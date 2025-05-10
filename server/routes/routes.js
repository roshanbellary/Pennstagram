import { ChatOpenAI } from "@langchain/openai";
import { PromptTemplate } from "@langchain/core/prompts";
import { StringOutputParser } from "@langchain/core/output_parsers";
import { OpenAIEmbeddings } from "@langchain/openai";
import { RunnableSequence, RunnablePassthrough } from "@langchain/core/runnables";
import { Chroma } from "@langchain/community/vectorstores/chroma";

import { get_db_connection } from '../models/rdbms.js';
import RouteHelper from '../routes/route_helper.js';

import bcrypt from 'bcrypt';
import fs from 'fs';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import { OpenAI } from '@langchain/openai';
import mysql from 'mysql2/promise';

// Import Kafka producer
import { kafkaProducer } from '../services/kafka-service.js';

// Import necessary models
import ChromaDB from '../models/vector.js';
import DynamoDB from '../models/kvs.js';
import S3KeyValueStore from '../models/s3.js';
import FaceEmbed from '../models/face_embed.js';

// Read config file
const configFile = fs.readFileSync('server/config.json', 'utf8');
const config = JSON.parse(configFile);

// Create instances of the ChromaDB, DynamoDB, and S3 classes
const chroma = ChromaDB();
const ddb = DynamoDB("user");
const ddb_main = DynamoDB("default");
const s3 = new S3KeyValueStore(config.s3BucketName);

// Set up multer for handling file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    // Ensure the uploads directory exists
    fs.mkdirSync('server/uploads', { recursive: true });
    cb(null, 'server/uploads/');
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + path.extname(file.originalname));
  }
});
const upload = multer({ storage: storage });

// Set up face embedding model
const faceModel = new FaceEmbed();
let faceModelLoaded = false;

async function ensureFaceModelLoaded() {
  if (!faceModelLoaded) {
    await faceModel.loadModel();
    faceModelLoaded = true;
  }
}

// Route middleware to handle file uploads
function uploadMiddleware(req, res, next) {
  upload.single('image')(req, res, function(err) {
    if (err instanceof multer.MulterError) {
      return res.status(400).json({ error: `Multer error: ${err.message}` });
    } else if (err) {
      return res.status(500).json({ error: `Unknown error: ${err.message}` });
    }
    next();
  });
}

// Route handler for getting actor embedding by name
async function getActorEmbedding(req, res) {
  const actorName = req.params?.name;
  
  if (!actorName) {
    return res.status(400).json({ error: 'Actor name is required.' });
  }

  try {
    const actorResult = await ddb_main.query_table_secondary_index(
      'imdb_actors',
      'primaryName-nconst-index',
      'primaryName',
      actorName
    );
    
    if (!actorResult || actorResult.length === 0) {
      return res.status(404).json({ error: 'Actor not found.' });
    }
    
    const nconst = actorResult[0].nconst.S;
    
    try {
      const faceResult = await ddb.query_table_by_key(
        config.dynamoDbTableName,
        'nconst',
        nconst
      );

      if (!faceResult || faceResult.length === 0) {
        return res.status(404).json({ error: 'Actor was found, but no face image was found.', nconst: nconst });
      }

      const id = parseInt(faceResult[0].id.N);
      
      const chromaResult = await chroma.get_item_from_table(config.chromaDbName, id.toString());
      if (!chromaResult || !chromaResult.embeddings || chromaResult.embeddings.length === 0) {
        return res.status(500).json({ error: 'Error querying databases.' });
      }
      
      return res.status(200).json(chromaResult.embeddings[0]);
    } catch (error) {
      return res.status(404).json({ error: 'Actor was found, but no face image was found.' });
    }
  } catch (error) {
    console.error('Error in getActorEmbedding:', error);
    return res.status(500).json({ error: 'Error querying databases.' });
  }
}

// Route handler for getting top-k similar actors based on embedding
async function getTopKSimilar(req, res) {
  try {
    if (!req.body || !req.body.embedding || req.body.embedding.length === 0) {
      return res.status(400).json({ error: 'Embedding is required.' });
    }
    
    const { embedding } = req.body;
    const k = parseInt(req.query.k || 5);
    
    const results = await chroma.get_items_from_table(
      config.chromaDbName,
      embedding,
      k
    );

    if (!results || !results.documents || results.documents.length === 0) {
      return res.json([]);
    }
    
    const resultArray = results.documents[0].map((document, index) => {
      const parsedDoc = JSON.parse(document);
      return {
        id: results.ids[0][index],
        path: parsedDoc.imagePath,
        nconst: parsedDoc.nconst,
        score: results.distances[0][index],
      };
    });
    
    res.json(resultArray);
  } catch (error) {
    console.error('Error in getTopKSimilar:', error);
    res.status(500).json({ error: 'Error querying databases.' });
  }
}

// Route handler for uploading images and generating embeddings
async function uploadImage(req, res) {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded.' });
    }

    await ensureFaceModelLoaded();
    
    const filePath = req.file.path;
    const fileName = path.basename(filePath);
    
    // Upload to S3
    const s3Key = `uploads/${fileName}`;
    await s3.uploadFile(filePath, config.s3BucketName, 'uploads');
    
    // Generate embedding
    const imageBuffer = fs.readFileSync(filePath);
    const embeddings = await faceModel.getEmbeddingsFromBuffer(imageBuffer);
    
    if (!embeddings || embeddings.length === 0) {
      fs.unlinkSync(filePath);
      return res.status(400).json({ error: 'No faces detected in the image.' });
    }
    
    // Store embeddings in ChromaDB
    const results = [];
    for (let i = 0; i < embeddings.length; i++) {
      const id = `${Date.now()}-${i}`;
      const metadata = {
        imagePath: s3Key,
        uploadDate: new Date().toISOString(),
        userId: req.session?.user_id || 'anonymous',
        faceIndex: i
      };
      
      await chroma.put_item_into_table(
        config.chromaDbName,
        id,
        embeddings[i],
        metadata
      );
      
      results.push({
        id,
        embedding: embeddings[i],
        metadata
      });
    }
    
    // Clean up local file
    fs.unlinkSync(filePath);
    
    return res.status(200).json({
      message: 'Image uploaded and embedding generated successfully.',
      faces: results.length,
      results
    });
  } catch (error) {
    console.error('Error in uploadImage:', error);
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    return res.status(500).json({ error: 'Error uploading image and generating embedding.' });
  }
}

// Route handler for finding similar images/actors
async function findSimilarFaces(req, res) {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded.' });
    }

    await ensureFaceModelLoaded();
    
    const filePath = req.file.path;
    
    // Generate embedding for the uploaded image
    const imageBuffer = fs.readFileSync(filePath);
    const embeddings = await faceModel.getEmbeddingsFromBuffer(imageBuffer);
    
    if (!embeddings || embeddings.length === 0) {
      fs.unlinkSync(filePath);
      return res.status(400).json({ error: 'No faces detected in the image.' });
    }
    
    // Search for similar faces for each detected face
    const allResults = [];
    for (let i = 0; i < embeddings.length; i++) {
      const embedding = embeddings[i];
      
      // Search ChromaDB for similar images
      const results = await chroma.get_items_from_table(
        config.chromaDbName,
        embedding,
        parseInt(req.query.k || 5)
      );
      
      if (results && results.documents && results.documents.length > 0) {
        const faceResults = results.documents[0].map((document, index) => {
          const parsedDoc = JSON.parse(document);
          return {
            id: results.ids[0][index],
            path: parsedDoc.imagePath,
            nconst: parsedDoc.nconst,
            score: results.distances[0][index],
            metadata: parsedDoc
          };
        });
        
        allResults.push({
          faceIndex: i,
          results: faceResults
        });
      }
    }
    
    // Clean up local file
    fs.unlinkSync(filePath);
    
    return res.status(200).json(allResults);
  } catch (error) {
    console.error('Error in findSimilarFaces:', error);
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    return res.status(500).json({ error: 'Error finding similar faces.' });
  }
}

// Route handler for finding actor matches
async function findActorMatches(req, res) {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded.' });
    }
    await ensureFaceModelLoaded();
    const filePath = req.file.path;
    const imageBuffer = fs.readFileSync(filePath);
    const embeddings = await faceModel.getEmbeddingsFromBuffer(imageBuffer);
    if (!embeddings || embeddings.length === 0) {
      fs.unlinkSync(filePath);
      return res.status(400).json({ error: 'No faces detected in the image.' });
    }
    // Use the first detected face embedding
    const embedding = embeddings[0];
    // Get top 5 matches by default
    const k = parseInt(req.query.k || 5);
    const results = await chroma.get_items_from_table(
      config.chromaDbName,
      embedding,
      k
    );
    fs.unlinkSync(filePath);
    if (!results || !results.documents || results.documents.length === 0) {
      return res.json([]);
    }
    const resultArray = results.documents[0].map((document, index) => {
      const parsedDoc = JSON.parse(document);
      return {
        id: results.ids[0][index],
        path: parsedDoc.imagePath,
        nconst: parsedDoc.nconst,
        score: results.distances[0][index],
        metadata: parsedDoc
      };
    });
    res.json(resultArray);
    console.log('Found similar actors:', resultArray);
  } catch (error) {
    console.error('Error in /find-actor-matches:', error);
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    res.status(500).json({ error: 'Error finding similar actors.' });
  }
}

// Setup database connection for LLM queries
let sqlDb = null;
async function setupDbConnection() {
    if (!sqlDb) {
        const connection = await mysql.createConnection({
            host: config.database.host,
            user: config.database.user,
            password: config.database.password,
            database: config.database.database
        });
        
        sqlDb = connection;
    }
    return sqlDb;
}

// LLM query generation endpoint
async function generateDatabaseQuery(req, res) {
    try {
        if (!req.body || !req.body.query) {
            return res.status(400).json({ error: 'Query is required.' });
        }
        
        const userQuery = req.body.query;
        
        // Check for potential private data requests
        const privateDataKeywords = ['password', 'secret', 'credit', 'ssn', 'social security', 'private', 'hashed_password'];
        if (privateDataKeywords.some(keyword => userQuery.toLowerCase().includes(keyword))) {
            return res.status(403).json({ error: 'Query potentially requesting private data is not allowed.' });
        }
        
        // Set up OpenAI
        if (!process.env.OPENAI_API_KEY) {
            return res.status(500).json({ error: 'OpenAI API key not configured.' });
        }
        
        const llm = new ChatOpenAI({
            modelName: "gpt-3.5-turbo",
            temperature: 0
        });
        
        // Set up database connection
        const db = await setupDbConnection();
        
        // Get database schema info
        const [tables] = await db.query(`
            SELECT table_name, column_name, data_type 
            FROM information_schema.columns 
            WHERE table_schema = ?
        `, [config.database.database]);
        
        // Format schema information as a string
        const schemaInfo = tables.map(row => 
            `Table: ${row.table_name}, Column: ${row.column_name}, Type: ${row.data_type}`
        ).join('\n');
        
        // Generate SQL query using LLM
        const prompt = PromptTemplate.fromTemplate(`
            System:
            You are a helpful assistant. Use the following information to answer the user's question by writing out an SQL query to get the appropriate data to answer the question.
            Here are the makeup of the database tables:
            names:

            parameter: nconst

            parameter: primaryName

            parameter: birthYear

            parameter: deathYear

            recommendations:

            parameter: person

            parameter: recommendation

            parameter: strength

            friends:

            parameter: followed

            parameter: follower

            users:

            parameter: user_id

            parameter: username

            parameter: hashed_password

            parameter: linked_nconst

            parameter: actor_nconst

            posts:

            parameter: post_id

            parameter: parent_post

            parameter: title

            parameter: content

            parameter: image_url

            parameter: hashtags

            parameter: created_at

            parameter: author_id

            chat_sessions:

            parameter: session_id

            parameter: name

            parameter: created_at

            parameter: is_group

            chat_participants:

            parameter: participant_id

            parameter: session_id

            parameter: user_id

            parameter: joined_at

            parameter: left_at

            chat_messages:

            parameter: message_id

            parameter: session_id

            parameter: sender_id

            parameter: content

            parameter: sent_at

            Question: {question}

            Answer by providing only the SQL query. If you don't know, say so.
        `);
        
        const ragChain = RunnableSequence.from([prompt, llm, new StringOutputParser()]);

        const result = await ragChain.invoke(req.body.query);
        res.status(200).send({message: result});
    } catch (error) {
        console.error('Error in generateDatabaseQuery:', error);
        return res.status(500).json({ error: 'Error generating database query.' });
    }
}

// Database connection setup
const db = get_db_connection();

var helper = new RouteHelper();

var vectorStore = null;

async function queryDatabase(query, params = []) {
    await db.connect();

    return db.send_sql(query, params);
}

function getHelloWorld(req, res) {
    // If the user is logged in, send their user_id back
    if (req.session && req.session.user_id) {
        res.status(200).send({
            message: "Hello, world!",
            user_id: req.session.user_id,
            logged_in: true
        });
    } else {
        res.status(200).send({
            message: "Hello, world!",
            logged_in: false
        });
    }
}

async function getVectorStore() {
    if (vectorStore == null) {
        vectorStore = await Chroma.fromExistingCollection(new OpenAIEmbeddings(), {
            collectionName: "imdb_reviews2",
            url: "http://localhost:8000", // Optional, will default to this value
            });
    } else
        console.log('Vector store already initialized');
    return vectorStore;
}

// POST /register 
async function postRegister(req, res) {
    var user = req.body.username;
    var raw_pass = req.body.password;
    var display_name = req.body.display_name || user; // Use display_name if provided, otherwise use username
    var actor_nconst = req.body.actor_nconst || null; // Get actor_nconst if provided
    
    if (user.trim().length == 0 || 
        raw_pass.trim().length == 0 || 
        !helper.isOK(user)) {
        console.log('Invalid values in the request');
        res.status(400).send({error: "One or more of the fields you entered was empty or invalid, please try again."}); 
    } else {
        console.debug('Checking if user exists');

        try {
            const [rows] = await queryDatabase("SELECT * FROM users WHERE username = ?", [user]);
            
            if (rows.length > 0) {
                return res.status(409).send({error: "An account with this username already exists, please try again."});
            }
            
            // Generate a unique nconst ID
            let unique = false;
            let nconst = '';
            while (!unique) {
                // Generate an ID in format "nm" followed by a random 7-digit number
                const randomId = Math.floor(10000000 + Math.random() * 90000000);
                nconst = `nm${randomId}`;
                
                // Check if this nconst already exists
                const existing = await queryDatabase("SELECT nconst FROM names WHERE nconst = ?", [nconst]);
                console.log('Existing nconsts:', existing);
                console.log('Checking for existing nconst:', nconst);
                if (existing.length === 0 || existing[0].length == 0) {
                    unique = true;
                }
            }
            
            // Insert the new person into the names table
            await queryDatabase(
                "INSERT INTO names (nconst, primaryName, birthYear, deathYear) VALUES (?, ?, NULL, NULL)",
                [nconst, display_name]
            );
            
            helper.encryptPassword(raw_pass, async (err, hash) => {
                if (err) {
                    console.error('Error encrypting password:', err);
                    return res.status(500).send({error: 'Error querying database.'});
                }
                
                try {
                    // Determine which nconst to link - actor's or user's own
                    const linked_nconst = actor_nconst || nconst;
                    console.log(`Registering user with linked actor nconst: ${linked_nconst}`);
                    
                    await queryDatabase(
                        "INSERT INTO users (username, hashed_password, linked_nconst, actor_nconst) VALUES (?, ?, ?, ?)",
                        [user, hash, nconst, actor_nconst]
                    );
                    
                    const [newUser] = await queryDatabase("SELECT user_id FROM users WHERE username = ?", [user]);
                    req.session.user_id = newUser[0].user_id;
                    
                    return res.status(200).send({username: user});
                } catch (err) {
                    console.error('Error inserting user:', err);
                    return res.status(500).send({error: 'Error querying database.'});
                }
            });
        } catch (err) {
            console.error('Error checking username:', err);
            return res.status(500).send({error: 'Error querying database.'});
        }
    }
};

// POST /login
async function postLogin(req, res) {
    console.log(req.body);
    var username = req.body.username;
    var plain_password = req.body.password;
    console.log('Logging in user: ' + username);

    // TODO: check if user exists
    // then match password. If appropriate, set session
    if (!username || !plain_password) {
        return res.status(400).send({error: 'One or more of the fields you entered was empty, please try again.'});
    }
    
    try {
        const [rows] = await queryDatabase("SELECT * FROM users WHERE username = ?", [username]);
        
        if (rows.length === 0) {
            return res.status(401).send({error: 'Username and/or password are invalid.'});
        }
        
        const user = rows[0];
        
        bcrypt.compare(plain_password, user.hashed_password, (err, match) => {
            if (err) {
                console.error('Error comparing passwords:', err);
                return res.status(500).send({error: 'Error querying database'});
            }
            
            if (!match) {
                return res.status(401).send({error: 'Username and/or password are invalid.'});
            }
            
            // Set user session
            req.session.user_id = user.user_id;
            
            return res.status(200).send({username: username});
        });
    } catch (err) {
        console.error('Error during login:', err);
        return res.status(500).send({error: 'Error querying database'});
    }
};

// GET /logout
function postLogout(req, res) {
  req.session.user_id = null;
  res.status(200).send({message: "You were successfully logged out."});
};

// GET /friends
async function getFriends(req, res) {    
    console.log('Getting friends for user ID: ' + req.session.user_id);
    
    if (!req.session.user_id) {
        return res.status(403).send({error: 'Not logged in.'});
    }
    
    try {
        // 1. Get the linked_nconst for the logged-in user
        const [userRows] = await queryDatabase('SELECT linked_nconst FROM users WHERE user_id = ?', [req.session.user_id]);
        
        if (userRows.length === 0 || !userRows[0].linked_nconst) {
            console.error('User or linked_nconst not found for user_id:', req.session.user_id);
            // Decide on appropriate error: 404? 500? 403 might still make sense.
            return res.status(403).send({ error: 'User profile incomplete or not found.' });
        }
        const userNconst = userRows[0].linked_nconst;
        console.log('Using nconst:', userNconst);

        // 2. Get friends using the user's nconst
        const [friendRows] = await queryDatabase(`
            SELECT f.followed, n.primaryName 
            FROM friends f
            JOIN names n ON f.followed = n.nconst
            WHERE f.follower = ?
        `, [userNconst]); // Use the fetched nconst here
        
        return res.status(200).send({
            results: friendRows
        });
    } catch (err) {
        console.error('Error getting friends:', err);
        return res.status(500).send({error: 'Error querying database'});
    }
}

// GET /recommendations
async function getFriendRecs(req, res) {
    console.log('Getting recommendations for user ID: ' + req.session.user_id);

    if (!req.session.user_id) {
        return res.status(403).send({error: 'Not logged in.'});
    }
    
    try {
        // 1. Get the linked_nconst for the logged-in user
        const [userRows] = await queryDatabase('SELECT linked_nconst FROM users WHERE user_id = ?', [req.session.user_id]);
        
        if (userRows.length === 0 || !userRows[0].linked_nconst) {
             console.error('User or linked_nconst not found for user_id:', req.session.user_id);
            return res.status(403).send({ error: 'User profile incomplete or not found.' });
        }
        const userNconst = userRows[0].linked_nconst;
        console.log('Using nconst:', userNconst);

        // 2. Get recommendations using the user's nconst
        const [recRows] = await queryDatabase(`
            SELECT r.recommendation, n.primaryName 
            FROM recommendations r
            JOIN names n ON r.recommendation = n.nconst
            WHERE r.person = ?
        `, [userNconst]); // Use the fetched nconst here
        
        return res.status(200).send({
            results: recRows
        });
    } catch (err) {
        console.error('Error getting recommendations:', err);
        return res.status(500).send({error: 'Error querying database'});
    }
}

// POST /createPost
async function createPost(req, res) {
    if (!req.session.user_id) {
        return res.status(403).send({error: 'Not logged in.'});
    }
    
    const title = req.body.title || null;
    const content = req.body.content || null;
    const image_url = req.body.image_url || null;
    const hashtags = req.body.hashtags || null;
    const parent_post_id = req.body.parent_id || null;
    
    // Ensure post has at least some content (text, image, or both)
    if ((!content || content.trim().length === 0) && 
        (!image_url || image_url.trim().length === 0)) {
        return res.status(400).send({error: 'Post must have either text content or an image.'});
    }
    
    // Check for SQL injection in text fields
    if ((title && !helper.isOK(title)) || 
        (content && !helper.isOK(content)) || 
        (hashtags && !helper.isOK(hashtags))) {
        return res.status(400).send({error: 'Invalid characters in post content.'});
    }
    
    try {
        // Get the username for the current user
        const [userRows] = await queryDatabase(
            "SELECT username FROM users WHERE user_id = ?",
            [req.session.user_id]
        );
        
        if (userRows.length === 0) {
            return res.status(404).send({error: 'User not found.'});
        }
        
        const username = userRows[0].username;
        
        // Insert the post into the database
        const [result] = await queryDatabase(
            "INSERT INTO posts (author_id, parent_post, title, content, image_url, hashtags) VALUES (?, ?, ?, ?, ?, ?)",
            [req.session.user_id, parent_post_id, title, content, image_url, hashtags]
        );
        
        const post_id = result.insertId;
        console.log("Sending post to Kafka!");
        // Send the post to Kafka
        try {
            await kafkaProducer.sendPost({
                username: username,
                post_id: post_id,
                caption: content,
                image_url: image_url
            });
            console.log(`Post ${post_id} sent to Kafka successfully`);
        } catch (kafkaError) {
            console.error('Failed to send post to Kafka:', kafkaError);
            // Continue with the response even if Kafka fails
        }
        
        return res.status(200).send({
            post_id: post_id
        });
    } catch (err) {
        console.error('Error creating post:', err);
        return res.status(500).send({error: 'Error querying database'});
    }
}

// GET /:username/feed
async function getFeed(req, res) {
    if (!req.session.user_id) {
        return res.status(403).send({error: 'Not logged in.'});
    }
    
    try {
        // Get the user_id from the username in the URL
        const username = req.params.username;
        
        // Get the user ID from the username
        const [userResult] = await queryDatabase(
            "SELECT user_id, linked_nconst FROM users WHERE username = ?",
            [username]
        );
        
        if (userResult.length === 0) {
            return res.status(404).send({error: 'User not found.'});
        }
        
        const targetUserId = userResult[0].user_id;
        const currentUserNconst = userResult[0].linked_nconst;
        
        // 2. Get all user_ids that the target user follows
        const [followedUsers] = await queryDatabase(`
            SELECT u.user_id 
            FROM users u
            JOIN friends f ON u.linked_nconst = f.followed
            WHERE f.follower = ?
        `, [currentUserNconst]);
        
        // Extract user_ids of followed users
        const followedUserIds = followedUsers.map(user => user.user_id);
        
        // Include target user's ID
        followedUserIds.push(targetUserId);
        
        // Create placeholders for the SQL IN clause
        const placeholders = followedUserIds.map(() => '?').join(',');
        
        // 3. Get recommended posts from the adsorption algorithm
        const [recommendedPosts] = await queryDatabase(`
            SELECT p.post_id, u.username, p.parent_post, p.title, p.content, 
                   p.image_url, p.hashtags, p.created_at, p.author_id, r.score as recommendation_score
            FROM recommendedPosts r
            JOIN posts p ON r.post_id = p.post_id
            JOIN users u ON p.author_id = u.user_id
            WHERE r.user_id = ? AND p.parent_post IS NULL
            ORDER BY r.score DESC
            LIMIT 10
        `, [targetUserId]);
        
        // 4. Get posts from the target user and all followed users
        const [followedPosts] = await queryDatabase(`
            SELECT p.post_id, u.username, p.parent_post, p.title, p.content, 
                   p.image_url, p.hashtags, p.created_at, p.author_id, NULL as recommendation_score
            FROM posts p
            JOIN users u ON p.author_id = u.user_id
            WHERE p.author_id IN (${placeholders})
            AND p.parent_post IS NULL
            ORDER BY p.created_at DESC
            LIMIT 20
        `, followedUserIds);
        
        // 5. Combine recommended posts and followed posts, removing duplicates
        const allPostIds = new Set();
        const combinedPosts = [];
        
        // Add recommended posts first (higher priority)
        recommendedPosts.forEach(post => {
            if (!allPostIds.has(post.post_id)) {
                allPostIds.add(post.post_id);
                combinedPosts.push({
                    ...post,
                    is_recommended: true
                });
            }
        });
        
        // Then add followed posts
        followedPosts.forEach(post => {
            if (!allPostIds.has(post.post_id)) {
                allPostIds.add(post.post_id);
                combinedPosts.push({
                    ...post,
                    is_recommended: false
                });
            }
        });
        
        // Sort combined posts by creation date (newest first)
        combinedPosts.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        
        // 6. For each top-level post, fetch its comments
        const postsWithComments = await Promise.all(
            combinedPosts.map(async (post) => {
                const [comments] = await queryDatabase(`
                    SELECT c.post_id, u.username, c.parent_post, c.title, c.content, 
                           c.image_url, c.hashtags, c.created_at, c.author_id
                    FROM posts c
                    JOIN users u ON c.author_id = u.user_id
                    WHERE c.parent_post = ?
                    ORDER BY c.created_at ASC
                `, [post.post_id]);
                
                return {
                    ...post,
                    comments: comments
                };
            })
        );
        
        return res.status(200).send({
            results: postsWithComments
        });
    } catch (err) {
        console.error('Error getting feed:', err);
        return res.status(500).send({error: 'Error querying database'});
    }
}

async function getMovie(req, res) {
    console.log('Getting movie database');
    try {
        const input = req.body.question;
        const prompt = PromptTemplate.fromTemplate(
            `
            System:
            You are a helpful assistant. Use the following information to answer the user's question by writing out an SQL query to get the appropriate data to answer the question.
            Here are the makeup of the database tables:
            names:

            parameter: nconst

            parameter: primaryName

            parameter: birthYear

            parameter: deathYear

            recommendations:

            parameter: person

            parameter: recommendation

            parameter: strength

            friends:

            parameter: followed

            parameter: follower

            users:

            parameter: user_id

            parameter: username

            parameter: hashed_password

            parameter: linked_nconst

            parameter: actor_nconst

            posts:

            parameter: post_id

            parameter: parent_post

            parameter: title

            parameter: content

            parameter: image_url

            parameter: hashtags

            parameter: created_at

            parameter: author_id

            chat_sessions:

            parameter: session_id

            parameter: name

            parameter: created_at

            parameter: is_group

            chat_participants:

            parameter: participant_id

            parameter: session_id

            parameter: user_id

            parameter: joined_at

            parameter: left_at

            chat_messages:

            parameter: message_id

            parameter: session_id

            parameter: sender_id

            parameter: content

            parameter: sent_at

            Question: {question}

            Answer by providing only the SQL query. If you don't know, say so.
        `);
        
        const llm = new ChatOpenAI({ modelName: "gpt-4.1-nano", temperature: 0 });
        
        const ragChain = RunnableSequence.from([prompt, llm, new StringOutputParser()]);

        const result = await ragChain.invoke({question: input});
        res.status(200).send({message: result});
    } catch (error) {
        console.error("Error in RAG processing:", error);
        res.status(500).send({error: "Error processing movie request."});
    }
}

// GET /searchUsers
async function searchUsers(req, res) {
    console.log('Searching users');
    
    if (!req.session.user_id) {
        return res.status(403).send({error: 'Not logged in.'});
    }
    
    const searchTerm = req.query.query || '';
    
    try {
        // Get current user's nconst to exclude from search results
        const [userRow] = await queryDatabase(
            'SELECT linked_nconst FROM users WHERE user_id = ?', 
            [req.session.user_id]
        );
        
        if (userRow.length === 0) {
            return res.status(403).send({error: 'User profile not found.'});
        }
        
        const currentUserNconst = userRow[0].linked_nconst;
        const [rows] = await queryDatabase(
            `
            SELECT n.nconst, n.primaryName FROM users u 
            JOIN names n ON u.linked_nconst = n.nconst
            WHERE n.primaryName LIKE ?
            AND n.nconst != ?
            ORDER BY n.primaryName
            LIMIT 20
            `,
            [`%${searchTerm}%`, currentUserNconst]
        );
        
        return res.status(200).send({
            results: rows
        });
    } catch (err) {
        console.error('Error searching users:', err);
        return res.status(500).send({error: 'Error querying database'});
    }
}

// POST /addFriend
async function addFriend(req, res) {
    console.log('Adding friend for user ID: ' + req.session.user_id);
    
    if (!req.session.user_id) {
        return res.status(403).send({error: 'Not logged in.'});
    }
    
    const friendNconst = req.body.nconst;
    
    if (!friendNconst) {
        return res.status(400).send({error: 'Friend ID is required.'});
    }
    
    try {
        // Get current user's nconst
        const [userRow] = await queryDatabase(
            'SELECT linked_nconst FROM users WHERE user_id = ?', 
            [req.session.user_id]
        );
        
        if (userRow.length === 0) {
            return res.status(403).send({error: 'User profile not found.'});
        }
        
        const currentUserNconst = userRow[0].linked_nconst;
        
        // Check if friendship already exists
        const [existingFriend] = await queryDatabase(
            'SELECT * FROM friends WHERE follower = ? AND followed = ?',
            [currentUserNconst, friendNconst]
        );
        
        if (existingFriend.length > 0) {
            return res.status(409).send({error: 'Already following this user.'});
        }
        
        // Add friend relationship (both ways for simplicity)
        await queryDatabase(
            'INSERT INTO friends (follower, followed) VALUES (?, ?)',
            [currentUserNconst, friendNconst]
        );
        
        await queryDatabase(
            'INSERT INTO friends (follower, followed) VALUES (?, ?)',
            [friendNconst, currentUserNconst]
        );
        
        return res.status(200).send({message: 'Friend added successfully.'});
    } catch (err) {
        console.error('Error adding friend:', err);
        return res.status(500).send({error: 'Error querying database'});
    }
}

// GET /post/:post_id
async function getPost(req, res) {
    if (!req.session.user_id) {
        return res.status(403).send({error: 'Not logged in.'});
    }
    
    const postId = req.params.post_id;
    
    if (!postId) {
        return res.status(400).send({error: 'Post ID is required.'});
    }
    
    try {
        // 1. Check if the post exists and if the current user has access to it
        const [postInfo] = await queryDatabase(`
            SELECT p.post_id, u.username, p.parent_post, p.title, p.content, 
                   p.image_url, p.hashtags, p.created_at, p.author_id
            FROM posts p
            JOIN users u ON p.author_id = u.user_id
            WHERE p.post_id = ?
        `, [postId]);
        
        if (postInfo.length === 0) {
            return res.status(404).send({error: 'Post not found.'});
        }
        
        const post = postInfo[0];
        
        // 2. Check if the user has access to this post (their own or from someone they follow)
        const [userInfo] = await queryDatabase(
            "SELECT linked_nconst FROM users WHERE user_id = ?",
            [req.session.user_id]
        );
        
        if (userInfo.length === 0) {
            return res.status(403).send({error: 'User profile not found.'});
        }
        
        const currentUserNconst = userInfo[0].linked_nconst;
        
        // If it's not the user's own post, check if they follow the author
        if (post.author_id !== req.session.user_id) {
            const [authorInfo] = await queryDatabase(
                "SELECT linked_nconst FROM users WHERE user_id = ?",
                [post.author_id]
            );
            
            if (authorInfo.length === 0) {
                return res.status(404).send({error: 'Post author not found.'});
            }
            
            const authorNconst = authorInfo[0].linked_nconst;
            
            const [friendship] = await queryDatabase(
                "SELECT * FROM friends WHERE follower = ? AND followed = ?",
                [currentUserNconst, authorNconst]
            );
            
            if (friendship.length === 0) {
                return res.status(403).send({error: 'You do not have access to this post.'});
            }
        }
        
        // 3. Fetch all comments for this post
        const [comments] = await queryDatabase(`
            SELECT c.post_id, u.username, c.parent_post, c.title, c.content, 
                   c.image_url, c.hashtags, c.created_at, c.author_id
            FROM posts c
            JOIN users u ON c.author_id = u.user_id
            WHERE c.parent_post = ?
            ORDER BY c.created_at ASC
        `, [postId]);
        
        return res.status(200).send({
            post: {
                ...post,
                comments: comments
            }
        });
    } catch (err) {
        console.error('Error fetching post:', err);
        return res.status(500).send({error: 'Error querying database.'});
    }
}

// GET /chats
async function getChats(req, res) {
    if (!req.session.user_id) {
        return res.status(403).send({error: 'Not logged in.'});
    }
    
    try {
        // Get all active chat sessions for the user
        const [chatSessions] = await queryDatabase(`
            SELECT cs.session_id, cs.name, cs.created_at, cs.is_group
            FROM chat_sessions cs
            JOIN chat_participants cp ON cs.session_id = cp.session_id
            WHERE cp.user_id = ?
            AND cp.left_at IS NULL
            ORDER BY cs.created_at DESC
        `, [req.session.user_id]);
        
        // For each chat session, get the other participants
        const chatsWithParticipants = await Promise.all(
            chatSessions.map(async (session) => {
                const [participants] = await queryDatabase(`
                    SELECT cp.user_id, u.username
                    FROM chat_participants cp
                    JOIN users u ON cp.user_id = u.user_id
                    WHERE cp.session_id = ?
                    AND cp.left_at IS NULL
                    AND cp.user_id != ?
                `, [session.session_id, req.session.user_id]);
                
                // For 1-on-1 chats, use the other person's name as the chat name if no custom name
                let chatName = session.name;
                if (!session.is_group && !chatName && participants.length > 0) {
                    chatName = participants[0].username;
                } else if (session.is_group && !chatName) {
                    chatName = "Group Chat";
                }
                
                // Get last message
                const [lastMessage] = await queryDatabase(`
                    SELECT cm.content, cm.sent_at, u.username as sender_username
                    FROM chat_messages cm
                    JOIN users u ON cm.sender_id = u.user_id
                    WHERE cm.session_id = ?
                    ORDER BY cm.sent_at DESC
                    LIMIT 1
                `, [session.session_id]);
                
                return {
                    ...session,
                    name: chatName,
                    participants,
                    lastMessage: lastMessage.length > 0 ? lastMessage[0] : null
                };
            })
        );
        
        return res.status(200).send({
            results: chatsWithParticipants
        });
    } catch (err) {
        console.error('Error getting chats:', err);
        return res.status(500).send({error: 'Error querying database.'});
    }
}

// GET /chat/:session_id
async function getChatMessages(req, res) {
    if (!req.session.user_id) {
        return res.status(403).send({error: 'Not logged in.'});
    }
    
    const sessionId = req.params.session_id;
    
    try {
        // Check if user is a participant in this chat
        const [participant] = await queryDatabase(`
            SELECT * FROM chat_participants
            WHERE session_id = ? AND user_id = ? AND left_at IS NULL
        `, [sessionId, req.session.user_id]);
        
        if (participant.length === 0) {
            return res.status(403).send({error: 'You are not a participant in this chat session.'});
        }
        
        // Get chat session info
        const [sessionInfo] = await queryDatabase(`
            SELECT * FROM chat_sessions WHERE session_id = ?
        `, [sessionId]);
        
        if (sessionInfo.length === 0) {
            return res.status(404).send({error: 'Chat session not found.'});
        }
        
        // Get all participants
        const [participants] = await queryDatabase(`
            SELECT cp.user_id, u.username
            FROM chat_participants cp
            JOIN users u ON cp.user_id = u.user_id
            WHERE cp.session_id = ?
            AND cp.left_at IS NULL
        `, [sessionId]);
        
        // Get all messages
        const [messages] = await queryDatabase(`
            SELECT cm.message_id, cm.content, cm.sent_at, cm.sender_id, u.username as sender_username
            FROM chat_messages cm
            JOIN users u ON cm.sender_id = u.user_id
            WHERE cm.session_id = ?
            ORDER BY cm.sent_at ASC
        `, [sessionId]);
        
        return res.status(200).send({
            session: sessionInfo[0],
            participants,
            messages
        });
    } catch (err) {
        console.error('Error getting chat messages:', err);
        return res.status(500).send({error: 'Error querying database.'});
    }
}

// POST /chat/create-group
async function createGroupChat(req, res) {
    if (!req.session.user_id) {
        return res.status(403).send({error: 'Not logged in.'});
    }
    
    const { name, participant_ids } = req.body;
    
    if (!participant_ids || !Array.isArray(participant_ids) || participant_ids.length === 0) {
        return res.status(400).send({error: 'At least one participant is required.'});
    }
    
    // Include the current user in the participants
    const allParticipantIds = [...new Set([...participant_ids, req.session.user_id])];
    
    try {
        // Check if a group chat with the exact same participants already exists
        // Sort participant IDs to ensure consistent comparison
        const sortedParticipantIds = [...allParticipantIds].sort((a, b) => a - b);
        
        // Get all group chats where current user is a participant
        const [userGroupChats] = await queryDatabase(`
            SELECT cs.session_id
            FROM chat_sessions cs
            JOIN chat_participants cp ON cs.session_id = cp.session_id
            WHERE cp.user_id = ?
            AND cs.is_group = TRUE
            AND cp.left_at IS NULL
        `, [req.session.user_id]);
        
        // For each group chat, check if it has the exact same participants
        for (const chat of userGroupChats) {
            const [chatParticipants] = await queryDatabase(`
                SELECT user_id
                FROM chat_participants
                WHERE session_id = ?
                AND left_at IS NULL
            `, [chat.session_id]);
            
            const chatParticipantIds = chatParticipants.map(p => p.user_id).sort((a, b) => a - b);
            
            if (chatParticipantIds.length === sortedParticipantIds.length && 
                chatParticipantIds.every((id, index) => id === sortedParticipantIds[index])) {
                return res.status(409).send({
                    error: 'A group chat with the same participants already exists.',
                    session_id: chat.session_id
                });
            }
        }
        
        // Create new group chat
        const [result] = await queryDatabase(
            'INSERT INTO chat_sessions (name, is_group) VALUES (?, TRUE)',
            [name || 'Group Chat']
        );
        
        const sessionId = result.insertId;
        
        // Add all participants
        await Promise.all(
            allParticipantIds.map(userId => 
                queryDatabase(
                    'INSERT INTO chat_participants (session_id, user_id) VALUES (?, ?)',
                    [sessionId, userId]
                )
            )
        );
        
        return res.status(201).send({
            message: 'Group chat created successfully.',
            session_id: sessionId
        });
    } catch (err) {
        console.error('Error creating group chat:', err);
        return res.status(500).send({error: 'Error querying database.'});
    }
}

// GET /chat/:session_id/participants
async function getChatParticipants(req, res) {
    if (!req.session.user_id) {
        return res.status(403).send({error: 'Not logged in.'});
    }
    
    const sessionId = req.params.session_id;
    
    try {
        // Check if user is a participant in this chat
        const [participant] = await queryDatabase(`
            SELECT * FROM chat_participants
            WHERE session_id = ? AND user_id = ? AND left_at IS NULL
        `, [sessionId, req.session.user_id]);
        
        if (participant.length === 0) {
            return res.status(403).send({error: 'You are not a participant in this chat session.'});
        }
        
        // Get all participants
        const [participants] = await queryDatabase(`
            SELECT cp.user_id, u.username, cp.joined_at
            FROM chat_participants cp
            JOIN users u ON cp.user_id = u.user_id
            WHERE cp.session_id = ?
            AND cp.left_at IS NULL
        `, [sessionId]);
        
        return res.status(200).send({
            participants
        });
    } catch (err) {
        console.error('Error getting chat participants:', err);
        return res.status(500).send({error: 'Error querying database.'});
    }
}

// GET /online-friends
async function getOnlineFriends(req, res) {
    if (!req.session.user_id) {
        return res.status(403).send({error: 'Not logged in.'});
    }
    
    try {
        // Get the current user's nconst
        const [userInfo] = await queryDatabase(
            "SELECT linked_nconst FROM users WHERE user_id = ?",
            [req.session.user_id]
        );
        
        if (userInfo.length === 0) {
            return res.status(403).send({error: 'User profile not found.'});
        }
        
        const currentUserNconst = userInfo[0].linked_nconst;
        
        // Get all user_ids that the current user follows
        const [followedUsers] = await queryDatabase(`
            SELECT u.user_id, u.username
            FROM users u
            JOIN friends f ON u.linked_nconst = f.followed
            WHERE f.follower = ?
        `, [currentUserNconst]);
        
        // The online status will be determined client-side via socket.io
        return res.status(200).send({
            friends: followedUsers
        });
    } catch (err) {
        console.error('Error getting online friends:', err);
        return res.status(500).send({error: 'Error querying database.'});
    }
}

// POST /find-actors-similar
async function postFindActorsSimilar(req, res) {
    try {
        // Expect an image upload (base64 or buffer)
        let imageBuffer;
        if (req.file && req.file.buffer) {
            imageBuffer = req.file.buffer;
        } else if (req.body.image) {
            // If image is sent as base64
            imageBuffer = Buffer.from(req.body.image, 'base64');
        } else {
            return res.status(400).send({ error: 'No image uploaded.' });
        }

        // Load face embedding model
        const face = new FaceEmbed();
        await face.loadModel();

        // Get ChromaDB connection and collection
        const chroma = getChromaDB();
        await chroma.get_client();
        const collection = await chroma.client.getCollection({ name: 'imdb_photos' });

        // Compute embedding for uploaded face
        const results = await face.findTopKMatchesToBuffer(collection, imageBuffer, 5);
        // results is an array, for each detected face (usually just 1)
        const matches = results[0];
        if (!matches || !matches.ids || matches.ids.length === 0) {
            return res.status(200).send({ matches: [] });
        }
        // Parse metadata from documents (which were stringified)
        const actors = (matches.documents || []).map((doc, idx) => {
            let meta = {};
            try {
                meta = JSON.parse(doc);
            } catch (e) {}
            return {
                nconst: meta.nconst || null,
                primaryName: meta.primaryName || null,
                imagePath: meta.imagePath || null,
                score: matches.distances ? matches.distances[idx] : null
            };
        });
        res.status(200).send({ matches: actors });
    } catch (err) {
        console.error('Error finding similar actors:', err);
        res.status(500).send({ error: 'Internal server error.' });
    }
}

// POST /find-actor-matches
async function postFindActorMatches(req, res) {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded.' });
        }
        await ensureFaceModelLoaded();
        const filePath = req.file.path;
        const imageBuffer = fs.readFileSync(filePath);
        const embeddings = await faceModel.getEmbeddingsFromBuffer(imageBuffer);
        if (!embeddings || embeddings.length === 0) {
            fs.unlinkSync(filePath);
            return res.status(400).json({ error: 'No faces detected in the image.' });
        }
        // Use the first detected face embedding
        const embedding = embeddings[0];
        // Get top 5 matches by default
        const k = parseInt(req.query.k || 5);
        const results = await chroma.get_items_from_table(
            config.chromaDbName,
            embedding,
            k
        );
        fs.unlinkSync(filePath);
        if (!results || !results.documents || results.documents.length === 0) {
            return res.json([]);
        }
        const resultArray = results.documents[0].map((document, index) => {
            const parsedDoc = JSON.parse(document);
            return {
                id: results.ids[0][index],
                path: parsedDoc.imagePath,
                nconst: parsedDoc.nconst,
                score: results.distances[0][index],
                metadata: parsedDoc
            };
        });
        res.json(resultArray);
    } catch (error) {
        console.error('Error in /find-actor-matches:', error);
        if (req.file && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
        }
        res.status(500).json({ error: 'Error finding similar actors.' });
    }
}

// GET /profile/:username
async function getUserProfile(req, res) {
    try {
        const username = req.params.username;
        
        // Check if user is logged in
        if (!req.session.user_id) {
            return res.status(403).send({error: 'Not logged in.'});
        }
        
        // Get user information
        const [userRows] = await queryDatabase(
            "SELECT user_id, username, linked_nconst, actor_nconst FROM users WHERE username = ?",
            [username]
        );
        
        if (userRows.length === 0) {
            return res.status(404).send({error: 'User not found.'});
        }
        
        const userInfo = userRows[0];
        
        // Get actor name if linked_nconst exists
        let actorName = null;
        if (userInfo.actor_nconst) {
            const [actorRows] = await queryDatabase(
                "SELECT primaryName FROM names WHERE nconst = ?",
                [userInfo.actor_nconst]
            );
            
            if (actorRows.length > 0) {
                actorName = actorRows[0].primaryName;
            }
        }
        
        // Get user's posts
        const [postsRows] = await queryDatabase(
            `SELECT p.*, u.username as author_username 
             FROM posts p 
             JOIN users u ON p.author_id = u.user_id 
             WHERE p.author_id = ? 
             ORDER BY p.created_at DESC 
             LIMIT 10`,
            [userInfo.user_id]
        );
        
        // Check if the logged-in user is following this user
        const [friendshipRows] = await queryDatabase(
            "SELECT * FROM friends WHERE follower = ? AND followed = ?",
            [req.session.user_id, userInfo.user_id]
        );
        
        const isFollowing = friendshipRows.length > 0;
        
        // Get follower count
        const [followerCountRows] = await queryDatabase(
            "SELECT COUNT(*) as count FROM friends WHERE followed = ?",
            [userInfo.user_id]
        );
        
        // Get following count
        const [followingCountRows] = await queryDatabase(
            "SELECT COUNT(*) as count FROM friends WHERE follower = ?",
            [userInfo.user_id]
        );
        
        return res.status(200).send({
            user: {
                user_id: userInfo.user_id,
                username: userInfo.username,
                linked_nconst: userInfo.linked_nconst,
                actor_nconst: userInfo.actor_nconst,
                actor_name: actorName
            },
            is_following: isFollowing,
            follower_count: followerCountRows[0].count,
            following_count: followingCountRows[0].count
        });
    } catch (err) {
        console.error('Error getting user profile:', err);
        return res.status(500).send({error: 'Error querying database'});
    }
}

// POST /updateProfile
async function updateProfile(req, res) {
    try {
        // Check if user is logged in
        if (!req.session.user_id) {
            return res.status(403).send({error: 'Not logged in.'});
        }
        
        const { actor_nconst, interests } = req.body;
        
        // Get current user information
        const [userRows] = await queryDatabase(
            "SELECT username, actor_nconst FROM users WHERE user_id = ?",
            [req.session.user_id]
        );
        
        if (userRows.length === 0) {
            return res.status(404).send({error: 'User not found.'});
        }
        
        const currentUser = userRows[0];
        const updates = [];
        const updateParams = [];
        let result;
        console.log("Updating Profile!");
        console.log("Actor Nconst & Interests: ", actor_nconst, interests);
        // Update actor_nconst if provided
        if (actor_nconst) {
            updates.push("actor_nconst = ?");
            updateParams.push(actor_nconst);
            
            // Get actor name for the status post
            const [actorRows] = await queryDatabase(
                "SELECT primaryName FROM names WHERE nconst = ?",
                [actor_nconst]
            );
            
            // Create a status post about the actor change
            const [result] = await queryDatabase(
                "INSERT INTO posts (author_id, content, created_at) VALUES (?, ?, NOW())",
                [req.session.user_id, `${currentUser.username} is now linked to a new actor!`]
            );
            console.log("New Post: ", result);
            try {
                const insertId = result.insertId;
                await kafkaProducer.sendPost({
                    username: currentUser.username,
                    post_id: insertId,
                    caption: `Profile updated for user ${currentUser.username} with new actor ${actor_nconst}`,
                });
                } catch (error) {
                console.error('Failed to send profile update event to Kafka:', error);
                }
        }
        
        // Update interests if provided
        if (interests) {
            updates.push("interests = ?");
            updateParams.push(interests.join(','));
        }
        
        // If no updates, return success
        if (updates.length === 0) {
            return res.status(200).send({message: 'No changes made to profile.'});
        }
        
        // Build and execute the update query
        const updateQuery = `UPDATE users SET ${updates.join(', ')} WHERE user_id = ?`;
        updateParams.push(req.session.user_id);
        
        await queryDatabase(updateQuery, updateParams);
        
        return res.status(200).send({message: 'Profile updated successfully.'});
    } catch (err) {
        console.error('Error updating profile:', err);
        return res.status(500).send({error: 'Error updating profile.'});
    }
}

// GET /suggestedInterests
async function getSuggestedInterests(req, res) {
    try {
        // Check if user is logged in
        if (!req.session.user_id) {
            return res.status(403).send({error: 'Not logged in.'});
        }
        
        // Get current user's interests
        const [userRows] = await queryDatabase(
            "SELECT interests FROM users WHERE user_id = ?",
            [req.session.user_id]
        );
        
        if (userRows.length === 0) {
            return res.status(404).send({error: 'User not found.'});
        }
        
        // Parse current interests
        const currentInterests = userRows[0].interests ? userRows[0].interests.split(',') : [];
        
        // Predefined list of popular interests/hashtags
        const popularInterests = [
            'movies', 'acting', 'hollywood', 'cinema', 'filmmaking',
            'directing', 'screenwriting', 'photography', 'celebrities',
            'oscars', 'awards', 'blockbuster', 'indie', 'documentary',
            'animation', 'comedy', 'drama', 'action', 'scifi', 'horror',
            'thriller', 'romance', 'fantasy', 'adventure', 'mystery',
            'family', 'musical', 'western', 'crime', 'biography',
            'history', 'war', 'sports', 'music', 'travel'
        ];
        
        // Filter out interests the user already has
        const suggestedInterests = popularInterests.filter(interest => 
            !currentInterests.includes(interest)
        );
        
        // Return a random selection of 5 suggested interests
        const randomSuggestions = suggestedInterests
            .sort(() => 0.5 - Math.random())
            .slice(0, 5);
        
        return res.status(200).send({
            currentInterests,
            suggestedInterests: randomSuggestions
        });
    } catch (err) {
        console.error('Error getting suggested interests:', err);
        return res.status(500).send({error: 'Error querying database.'});
    }
}

/* Here we construct an object that contains a field for each route
   we've defined, so we can call the routes from app.js. */

export {
    getHelloWorld,
    postLogin,
    postRegister,
    postLogout,
    getFriends,
    getFriendRecs,
    getMovie,
    createPost,
    getFeed,
    searchUsers,
    addFriend,
    getPost,
    getChats,
    getChatMessages,
    createGroupChat,
    getChatParticipants,
    getOnlineFriends,
    postFindActorsSimilar,
    getActorEmbedding,
    getTopKSimilar,
    uploadMiddleware,
    uploadImage,
    findSimilarFaces,
    generateDatabaseQuery,
    findActorMatches,
    postFindActorMatches,
    getUserProfile,
    updateProfile,
    getSuggestedInterests
};
