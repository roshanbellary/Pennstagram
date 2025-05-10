package edu.upenn.cis.nets2120.adsorption;

import org.apache.spark.api.java.JavaPairRDD;
import org.apache.spark.api.java.JavaRDD;
import org.apache.spark.api.java.JavaSparkContext;
import org.apache.spark.sql.SparkSession;
import scala.Tuple2;

import java.io.FileWriter;
import java.io.IOException;
import java.io.PrintWriter;
import java.io.Serializable;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Properties;
import java.util.Set;
import java.util.stream.Collectors;
import java.text.SimpleDateFormat;
import java.util.Date;

/**
 * Adsorption algorithm implementation for InstaLite
 * This job builds a graph of users, posts, hashtags and runs adsorption
 * to assign weights to posts for feed ranking
 */
public class AdsorptionRankJob implements Serializable {
    private static final long serialVersionUID = 1L;
    
    // Maximum number of iterations for adsorption
    private static final int MAX_ITERATIONS = 15;
    
    // Convergence threshold for adsorption
    private static final double CONVERGENCE_THRESHOLD = 0.01;
    
    // Database connection parameters
    private String dbUrl;
    private String dbUser;
    private String dbPassword;
    
    // Spark context
    private transient JavaSparkContext sc;
    private SparkSession spark;
    private static PrintWriter logWriter;
    private static final String LOG_FILE = "adsorption.log";
    
    public AdsorptionRankJob(String dbUrl, String dbUser, String dbPassword) {
        this.dbUrl = dbUrl;
        this.dbUser = dbUser;
        this.dbPassword = dbPassword;
        
        // Initialize Spark
        spark = SparkSession
                .builder()
                .appName("AdsorptionRankJob")
                .config("spark.master", "local[4]")
                .getOrCreate();
        
        sc = new JavaSparkContext(spark.sparkContext());
        
        // Initialize log file
        try {
            logWriter = new PrintWriter(new FileWriter(LOG_FILE, true));
            SimpleDateFormat dateFormat = new SimpleDateFormat("yyyy-MM-dd HH:mm:ss");
            String timestamp = dateFormat.format(new Date());
            log("===== AdsorptionRankJob started at " + timestamp + " =====");
        } catch (IOException e) {
            System.err.println("Error creating log file: " + e.getMessage());
        }
    }
    
    /**
     * Initialize Spark session and context
     */
    public void initialize() {
    }
    
    /**
     * Log a message to both console and log file
     */
    private static void log(String message) {
        System.out.println(message);
        if (logWriter != null) {
            logWriter.println(message);
            logWriter.flush();
        } else {
            // If logWriter is null (e.g., in static context), just print to console
            System.out.println(message);
        }
    }
    
    /**
     * Close the log file
     */
    private void closeLog() {
        if (logWriter != null) {
            SimpleDateFormat dateFormat = new SimpleDateFormat("yyyy-MM-dd HH:mm:ss");
            String timestamp = dateFormat.format(new Date());
            log("===== AdsorptionRankJob completed at " + timestamp + " =====");
            logWriter.close();
        }
    }
    
    /**
     * Run the adsorption algorithm on the social graph
     */
    public void run() throws SQLException {
        log("Starting AdsorptionRankJob");
        
        // 1. Load data from database
        Map<String, List<String>> graphData = loadGraphData();
        
        // Log counts of users and posts
        log("Loaded " + graphData.get("users").size() + " users from database");
        log("Loaded " + graphData.get("posts").size() + " posts from database");
        log("Found " + graphData.get("user_post_likes").size() + " user-post likes");
        log("Found " + graphData.get("user_post_comments").size() + " user-post comments");
        log("Found " + graphData.get("user_user_follows").size() + " user-user follows");
        
        // 2. Build the graph using Spark RDDs
        JavaPairRDD<String, String> userToPostLikes = buildRDD(graphData.get("user_post_likes"));
        JavaPairRDD<String, String> postToUserLikes = userToPostLikes.mapToPair(t -> new Tuple2<>(t._2, t._1));
        
        JavaPairRDD<String, String> userToPostComments = buildRDD(graphData.get("user_post_comments"));
        JavaPairRDD<String, String> postToUserComments = userToPostComments.mapToPair(t -> new Tuple2<>(t._2, t._1));
        
        JavaPairRDD<String, String> userToUser = buildRDD(graphData.get("user_user_follows"));
        
        // 3. Combine all edges
        JavaPairRDD<String, Tuple2<String, String>> allEdges = userToPostLikes
                .mapToPair(t -> new Tuple2<>(t._1 + "|" + t._2, new Tuple2<>("user", "post")))
                .union(postToUserLikes.mapToPair(t -> new Tuple2<>(t._1 + "|" + t._2, new Tuple2<>("post", "user"))))
                .union(userToPostComments.mapToPair(t -> new Tuple2<>(t._1 + "|" + t._2, new Tuple2<>("user", "post"))))
                .union(postToUserComments.mapToPair(t -> new Tuple2<>(t._1 + "|" + t._2, new Tuple2<>("post", "user"))))
                .union(userToUser.mapToPair(t -> new Tuple2<>(t._1 + "|" + t._2, new Tuple2<>("user", "user"))));
        
        // 4. Assign weights to edges
        JavaPairRDD<String, Map<String, Double>> edgeWeights = assignWeights(
                userToPostLikes, postToUserLikes, 
                userToPostComments, postToUserComments, 
                userToUser);
        
        // 5. Initialize user label weights
        List<String> users = graphData.get("users");
        JavaPairRDD<String, Map<String, Double>> labelWeights = initializeUserLabels(users);
        
        // 6. Run adsorption iterations
        JavaPairRDD<String, Map<String, Double>> finalWeights = runAdsorption(
                labelWeights, edgeWeights, allEdges);
        
        // 7. Extract post weights
        List<Tuple2<String, Map<String, Double>>> postWeights = finalWeights
                .filter(t -> t._1.startsWith("post:"))
                .collect();
        
        // 8. Save results to database
        saveResults(postWeights);
        
        // Close the log file
        closeLog();
        
        // Already logged in closeLog() method
    }
    
    /**
     * Load graph data from the database
     */
    private Map<String, List<String>> loadGraphData() throws SQLException {
        Map<String, List<String>> result = new HashMap<>();
        result.put("users", new ArrayList<>());
        result.put("posts", new ArrayList<>());
        result.put("user_post_likes", new ArrayList<>());
        result.put("user_post_comments", new ArrayList<>());
        result.put("user_user_follows", new ArrayList<>());
        
        Connection conn = null;
        
        try {
            log("Connecting to database: " + dbUrl);
            conn = DriverManager.getConnection(dbUrl, dbUser, dbPassword);
            
            // Load users
            PreparedStatement userStmt = conn.prepareStatement("SELECT user_id FROM users");
            ResultSet userRs = userStmt.executeQuery();
            
            int userCount = 0;
            while (userRs.next()) {
                String userId = "user:" + userRs.getInt("user_id");
                result.get("users").add(userId);
                userCount++;
            }
            log("Loaded " + userCount + " users from users table");
            
            // We don't use post_likes table anymore
            log("Skipping post_likes table as it doesn't exist");
            
            // Load comment edges (replies)
            try {
                PreparedStatement commentStmt = conn.prepareStatement(
                    "SELECT author_id, parent_post FROM posts WHERE parent_post IS NOT NULL");
                ResultSet commentRs = commentStmt.executeQuery();
                while (commentRs.next()) {
                    String userId = "user:" + commentRs.getInt("author_id");
                    String postId = "post:" + commentRs.getInt("parent_post");
                    result.get("user_post_comments").add(userId + "|" + postId);
                }
                log("Loaded comment relationship data");
            } catch (SQLException e) {
                log("Warning: Error loading comments as edges: " + e.getMessage());
            }
            
            // Create user-user relationships based on co-commenting patterns
            try {
                PreparedStatement coCommentStmt = conn.prepareStatement(
                    "SELECT DISTINCT a.author_id as user1, b.author_id as user2 " +
                    "FROM posts a JOIN posts b ON a.parent_post = b.parent_post " +
                    "WHERE a.parent_post IS NOT NULL AND a.author_id != b.author_id");
                ResultSet coCommentRs = coCommentStmt.executeQuery();
                while (coCommentRs.next()) {
                    String user1 = "user:" + coCommentRs.getInt("user1");
                    String user2 = "user:" + coCommentRs.getInt("user2");
                    result.get("user_user_follows").add(user1 + "|" + user2);
                }
                log("Created user-user edges based on co-commenting");
            } catch (SQLException e) {
                log("Warning: Error creating user-user edges: " + e.getMessage());
            };
            
            // Load posts
            PreparedStatement postStmt = conn.prepareStatement("SELECT post_id FROM posts");
            ResultSet postRs = postStmt.executeQuery();
            
            int postCount = 0;
            while (postRs.next()) {
                String postId = "post:" + postRs.getInt("post_id");
                result.get("posts").add(postId);
                postCount++;
            }
            log("Loaded " + postCount + " posts from posts table");
            
            // If there are no interactions, create default connections to ensure recommendations
            if (result.get("user_post_likes").isEmpty() && result.get("user_post_comments").isEmpty() && result.get("user_user_follows").isEmpty()) {
                log("No interactions found. Creating default connections for recommendation generation...");
                
                // Create default connections between users and some posts
                List<String> users = result.get("users");
                List<String> posts = result.get("posts");
                
                if (!users.isEmpty() && !posts.isEmpty()) {
                    // For each user, connect to a subset of posts (up to 10 or all if fewer)
                    for (String user : users) {
                        int connectCount = Math.min(10, posts.size());
                        for (int i = 0; i < connectCount; i++) {
                            // Create a connection with every 10th post or similar distribution
                            int postIndex = (i * posts.size() / connectCount) % posts.size();
                            String post = posts.get(postIndex);
                            
                            // Add a default connection with low weight
                            result.get("user_post_likes").add(user + "|" + post);
                            log("Created default connection between " + user + " and " + post);
                        }
                    }
                    
                    // Create connections between users if there are multiple users
                    if (users.size() > 1) {
                        for (int i = 0; i < users.size(); i++) {
                            for (int j = 0; j < users.size(); j++) {
                                if (i != j) {
                                    result.get("user_user_follows").add(users.get(i) + "|" + users.get(j));
                                    log("Created default connection between " + users.get(i) + " and " + users.get(j));
                                }
                            }
                        }
                    }
                }
            }
            
            // Print some stats about the data
            log("Loaded " + result.get("users").size() + " users");
            log("Loaded " + result.get("user_post_likes").size() + " user-post likes");
            log("Loaded " + result.get("user_post_comments").size() + " user-post comments");
            log("Loaded " + result.get("user_user_follows").size() + " user-user relationships");
            log("Loaded " + result.get("posts").size() + " posts");
            
        } finally {
            if (conn != null) {
                conn.close();
            }
        }
        
        return result;
    }
    
    /**
     * Build RDD from list of edge strings in format "source|target"
     */
    private JavaPairRDD<String, String> buildRDD(List<String> edges) {
        List<Tuple2<String, String>> tuples = edges.stream()
                .map(edge -> {
                    String[] parts = edge.split("\\|");
                    return new Tuple2<>(parts[0], parts[1]);
                })
                .collect(Collectors.toList());
        
        return sc.parallelizePairs(tuples);
    }
    
    /**
     * Assign weights to edges based on node type
     */
    private JavaPairRDD<String, Map<String, Double>> assignWeights(
            JavaPairRDD<String, String> userToPostLikes,
            JavaPairRDD<String, String> postToUserLikes,
            JavaPairRDD<String, String> userToPostComments,
            JavaPairRDD<String, String> postToUserComments,
            JavaPairRDD<String, String> userToUser) {
        
        // Count outgoing edges per node
        JavaPairRDD<String, Integer> userPostLikesCount = userToPostLikes.mapToPair(t -> new Tuple2<>(t._1, 1))
                .reduceByKey(Integer::sum);
        
        JavaPairRDD<String, Integer> userPostCommentsCount = userToPostComments.mapToPair(t -> new Tuple2<>(t._1, 1))
                .reduceByKey(Integer::sum);
        
        JavaPairRDD<String, Integer> userFriendCount = userToUser.mapToPair(t -> new Tuple2<>(t._1, 1))
                .reduceByKey(Integer::sum);
        
        JavaPairRDD<String, Integer> postUserLikesCount = postToUserLikes.mapToPair(t -> new Tuple2<>(t._1, 1))
                .reduceByKey(Integer::sum);
                
        JavaPairRDD<String, Integer> postUserCommentsCount = postToUserComments.mapToPair(t -> new Tuple2<>(t._1, 1))
                .reduceByKey(Integer::sum);
        
        // Calculate edge weights
        // Likes get 0.3 weight
        JavaPairRDD<String, Double> userPostLikesWeights = userToPostLikes
                .join(userPostLikesCount)
                .mapToPair(t -> {
                    String user = t._1;
                    String post = t._2._1;
                    int count = t._2._2;
                    return new Tuple2<>(user + "|" + post, 0.3 / count);
                });
        
        // Comments get 0.5 weight (stronger signal than likes)
        JavaPairRDD<String, Double> userPostCommentsWeights = userToPostComments
                .join(userPostCommentsCount)
                .mapToPair(t -> {
                    String user = t._1;
                    String post = t._2._1;
                    int count = t._2._2;
                    return new Tuple2<>(user + "|" + post, 0.5 / count);
                });
        
        // User-user edges get 0.2 weight
        JavaPairRDD<String, Double> userFriendWeights = userToUser
                .join(userFriendCount)
                .mapToPair(t -> {
                    String user = t._1;
                    String friend = t._2._1;
                    int count = t._2._2;
                    return new Tuple2<>(user + "|" + friend, 0.2 / count);
                });
        
        // Post to user weights for likes
        JavaPairRDD<String, Double> postUserLikesWeights = postToUserLikes
                .join(postUserLikesCount)
                .mapToPair(t -> {
                    String post = t._1;
                    String user = t._2._1;
                    int count = t._2._2;
                    return new Tuple2<>(post + "|" + user, 1.0 / count);
                });
                
        // Post to user weights for comments
        JavaPairRDD<String, Double> postUserCommentsWeights = postToUserComments
                .join(postUserCommentsCount)
                .mapToPair(t -> {
                    String post = t._1;
                    String user = t._2._1;
                    int count = t._2._2;
                    return new Tuple2<>(post + "|" + user, 1.0 / count);
                });
        
        // Combine all weights into a map per node
        JavaPairRDD<String, Double> allWeights = userPostLikesWeights
                .union(userPostCommentsWeights)
                .union(userFriendWeights)
                .union(postUserLikesWeights)
                .union(postUserCommentsWeights);
        
        // Transform to format: node -> {target: weight, ...}
        return allWeights.mapToPair(t -> {
                    String[] parts = t._1.split("\\|");
                    return new Tuple2<>(parts[0], new Tuple2<>(parts[1], t._2));
                })
                .groupByKey()
                .mapToPair(t -> {
                    Map<String, Double> weights = new HashMap<>();
                    t._2.forEach(pair -> weights.put(pair._1, pair._2));
                    return new Tuple2<>(t._1, weights);
                });
    }
    
    /**
     * Initialize user labels for adsorption
     * Each user gets a label with value 1.0
     */
    private JavaPairRDD<String, Map<String, Double>> initializeUserLabels(List<String> users) {
        List<Tuple2<String, Map<String, Double>>> initialLabels = new ArrayList<>();
        
        for (String user : users) {
            Map<String, Double> labelMap = new HashMap<>();
            labelMap.put(user, 1.0);
            initialLabels.add(new Tuple2<>(user, labelMap));
        }
        
        return sc.parallelizePairs(initialLabels);
    }
    
    /**
     * Run adsorption algorithm iterations
     */
    private JavaPairRDD<String, Map<String, Double>> runAdsorption(
            JavaPairRDD<String, Map<String, Double>> labelWeights,
            JavaPairRDD<String, Map<String, Double>> edgeWeights,
            JavaPairRDD<String, Tuple2<String, String>> allEdges) {
        
        boolean converged = false;
        int iteration = 0;
        
        JavaPairRDD<String, Map<String, Double>> currentWeights = labelWeights;
        
        while (!converged && iteration < MAX_ITERATIONS) {
            // Join current weights with edge weights
            JavaPairRDD<String, Tuple2<Map<String, Double>, Map<String, Double>>> joinedWeights = 
                    currentWeights.join(edgeWeights);
            
            // Propagate labels through edges
            JavaPairRDD<String, Map<String, Double>> propagatedLabels = joinedWeights.flatMapToPair(t -> {
                String source = t._1;
                Map<String, Double> sourceLabels = t._2._1;
                Map<String, Double> outgoingEdges = t._2._2;
                
                List<Tuple2<String, Map<String, Double>>> result = new ArrayList<>();
                
                for (Map.Entry<String, Double> edge : outgoingEdges.entrySet()) {
                    String target = edge.getKey();
                    double weight = edge.getValue();
                    
                    Map<String, Double> targetLabels = new HashMap<>();
                    for (Map.Entry<String, Double> label : sourceLabels.entrySet()) {
                        targetLabels.put(label.getKey(), label.getValue() * weight);
                    }
                    
                    result.add(new Tuple2<>(target, targetLabels));
                }
                
                return result.iterator();
            });
            
            // Combine propagated labels
            JavaPairRDD<String, Map<String, Double>> combinedWeights = propagatedLabels
                    .reduceByKey((map1, map2) -> {
                        Map<String, Double> combined = new HashMap<>(map1);
                        
                        for (Map.Entry<String, Double> entry : map2.entrySet()) {
                            combined.merge(entry.getKey(), entry.getValue(), Double::sum);
                        }
                        
                        return combined;
                    });
            
            // Add original user labels (each user keeps its own label with value 1.0)
            JavaPairRDD<String, Map<String, Double>> withOriginalLabels = combinedWeights
                    .leftOuterJoin(labelWeights)
                    .mapToPair(t -> {
                        String node = t._1;
                        Map<String, Double> newLabelWeights = t._2._1;
                        Map<String, Double> originalLabels = t._2._2.orElse(new HashMap<>());
                        
                        // If this is a user node, restore its original label
                        if (node.startsWith("user:") && originalLabels.containsKey(node)) {
                            newLabelWeights.put(node, 1.0);
                        }
                        
                        return new Tuple2<>(node, newLabelWeights);
                    });
            
            // Check for convergence by finding maximum change in any label weight
            if (iteration > 0) {
                JavaRDD<Double> changeValues = withOriginalLabels
                        .join(currentWeights)
                        .mapValues(pair -> {
                            Map<String, Double> newWeights = pair._1;
                            Map<String, Double> oldWeights = pair._2;
                            double maxDiff = 0.0;
                            
                            // Find all keys (labels) in either map
                            Set<String> allKeys = new HashSet<>();
                            allKeys.addAll(newWeights.keySet());
                            allKeys.addAll(oldWeights.keySet());
                            
                            // Find maximum difference for any label
                            for (String key : allKeys) {
                                double newVal = newWeights.getOrDefault(key, 0.0);
                                double oldVal = oldWeights.getOrDefault(key, 0.0);
                                maxDiff = Math.max(maxDiff, Math.abs(newVal - oldVal));
                            }
                            
                            return maxDiff;
                        })
                        .values();
                
                // Check if we have any values before calling reduce
                if (!changeValues.isEmpty()) {
                    double maxChange = changeValues.reduce(Math::max);
                    
                    if (maxChange < CONVERGENCE_THRESHOLD) {
                        converged = true;
                        System.out.println("Converged after " + iteration + " iterations");
                    }
                } else {
                    // If there are no values, we can consider it converged
                    converged = true;
                    System.out.println("No changes detected, considering converged after " + iteration + " iterations");
                }
            }
            
            currentWeights = withOriginalLabels;
            iteration++;
            System.out.println("Completed iteration " + iteration);
        }
        
        return currentWeights;
    }
    
    /**
     * Save the ranking results to the database
     */
    private void saveResults(List<Tuple2<String, Map<String, Double>>> postWeights) throws SQLException {
        Connection conn = null;
        try {
            conn = DriverManager.getConnection(dbUrl, dbUser, dbPassword);
            
            // First, check if the table exists and create it if it doesn't
            try {
                PreparedStatement checkTableStmt = conn.prepareStatement(
                    "SELECT 1 FROM information_schema.tables WHERE table_name = 'recommendedPosts' LIMIT 1");
                ResultSet tableRs = checkTableStmt.executeQuery();
                
                if (!tableRs.next()) {
                    // Table doesn't exist, create it
                    log("Creating recommendedPosts table...");
                    PreparedStatement createTableStmt = conn.prepareStatement(
                        "CREATE TABLE IF NOT EXISTS recommendedPosts (" +
                        "user_id INT NOT NULL, " +
                        "post_id INT NOT NULL, " +
                        "score INT, " +
                        "PRIMARY KEY (user_id, post_id), " +
                        "FOREIGN KEY (user_id) REFERENCES users(user_id), " +
                        "FOREIGN KEY (post_id) REFERENCES posts(post_id)" +
                        ")");
                    createTableStmt.executeUpdate();
                } else {
                    // Table exists, clear it
                    PreparedStatement clearStmt = conn.prepareStatement(
                        "TRUNCATE TABLE recommendedPosts"
                    );
                    clearStmt.executeUpdate();
                }
            } catch (SQLException e) {
                log("Error checking/creating recommendedPosts table: " + e.getMessage());
                // Continue anyway, we'll try to create it below
            }
            
            // Get all users and posts from the database
            List<Integer> userIds = new ArrayList<>();
            List<Integer> postIds = new ArrayList<>();
            
            // Get all users
            PreparedStatement userStmt = conn.prepareStatement("SELECT user_id FROM users");
            ResultSet userRs = userStmt.executeQuery();
            while (userRs.next()) {
                userIds.add(userRs.getInt("user_id"));
            }
            
            // Get all posts
            PreparedStatement postStmt = conn.prepareStatement("SELECT post_id FROM posts");
            ResultSet postRs = postStmt.executeQuery();
            while (postRs.next()) {
                postIds.add(postRs.getInt("post_id"));
            }
            
            log("Found " + userIds.size() + " users and " + postIds.size() + " posts for recommendations");
            
            // Create a map of post weights for easier lookup
            Map<String, Map<String, Double>> postWeightsMap = new HashMap<>();
            for (Tuple2<String, Map<String, Double>> postWithWeights : postWeights) {
                postWeightsMap.put(postWithWeights._1, postWithWeights._2);
            }
            
            // Prepare the insert statement
            PreparedStatement insertStmt = conn.prepareStatement(
                "INSERT INTO recommendedPosts (user_id, post_id, score) VALUES (?, ?, ?)"
            );
            
            int batchCount = 0;
            int totalInserted = 0;
            
            // For each user and post combination, ensure we have a recommendation
            for (Integer userId : userIds) {
                String userLabel = "user:" + userId;
                
                for (Integer postId : postIds) {
                    String postLabel = "post:" + postId;
                    
                    // Default score (minimum recommendation)
                    int score = 1;
                    
                    // Check if we have a calculated weight for this user-post pair
                    if (postWeightsMap.containsKey(postLabel)) {
                        Map<String, Double> weights = postWeightsMap.get(postLabel);
                        if (weights.containsKey(userLabel)) {
                            Double weight = weights.get(userLabel);
                            // Convert weight to score (0-100)
                            score = Math.max(1, (int)(weight * 100));
                        }
                    }
                    
                    // Insert the recommendation
                    insertStmt.setInt(1, userId);
                    insertStmt.setInt(2, postId);
                    insertStmt.setInt(3, score);
                    insertStmt.addBatch();
                    
                    batchCount++;
                    
                    // Execute in batches of 1000
                    if (batchCount >= 1000) {
                        int[] results = insertStmt.executeBatch();
                        totalInserted += results.length;
                        batchCount = 0;
                    }
                }
            }
            
            // Execute any remaining batch
            if (batchCount > 0) {
                int[] results = insertStmt.executeBatch();
                totalInserted += results.length;
            }
            
            log("Successfully saved " + totalInserted + " post recommendations to database");
            log("AdsorptionRankJob completed");
            
        } catch (SQLException e) {
            System.err.println("Error saving recommendations: " + e.getMessage());
            throw e;
        } finally {
            if (conn != null) {
                try {
                    conn.close();
                } catch (SQLException e) {
                    log("Error closing connection: " + e.getMessage());
                }
            }
        }
    }
    
    /**
     * Main method for testing
     */
    public static void main(String[] args) {
        if (args.length < 3) {
            System.err.println("Usage: AdsorptionRankJob <db_url> <db_user> <db_password>");
            System.exit(1);
        }
        
        String dbUrl = args[0];
        String dbUser = args[1];
        String dbPassword = args[2];
        
        System.out.println("Connecting to database: " + dbUrl);
        System.out.println("Using username: " + dbUser);
        System.out.println("Logs will be written to: " + LOG_FILE);
        
        AdsorptionRankJob job = new AdsorptionRankJob(dbUrl, dbUser, dbPassword);
        
        try {
            job.initialize();
            job.run();
            System.out.println("Job completed successfully");
        } catch (Exception e) {
            System.err.println("Error running job: " + e.getMessage());
            e.printStackTrace();
            System.exit(1);
        }
    }
} 