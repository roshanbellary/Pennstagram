import mysql from 'mysql2/promise';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Read config file
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const configFile = fs.readFileSync(path.join(__dirname, '../../config.json'), 'utf8');
const config = JSON.parse(configFile);

// Database configuration
const dbConfig = {
  host: config.database.host,
  port: config.database.port,
  database: config.database.database,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  waitForConnections: true,
  connectionLimit: 10
};

class FeedService {
  constructor() {
    this.pool = mysql.createPool(dbConfig);
  }
  
  /**
   * Get feed posts for a user
   * @param {string} username - The username
   * @param {number} page - The page number (1-indexed)
   * @param {number} limit - Number of posts per page
   * @return {Promise<Array>} - Array of posts
   */
  async getFeedForUser(username, page = 1, limit = 10) {
    const offset = (page - 1) * limit;
    
    try {
      // Get connection from pool
      const conn = await this.pool.getConnection();
      
      try {
        // First, get posts from friends
        const [friendPosts] = await conn.query(
          `SELECT p.*, u.first_name, u.last_name, u.profile_photo 
           FROM posts p
           JOIN users u ON p.username = u.username
           WHERE p.username IN (
             SELECT user2 FROM friendships WHERE user1 = ?
             UNION
             SELECT user1 FROM friendships WHERE user2 = ?
           )
           OR p.username = ?
           ORDER BY p.created_at DESC
           LIMIT ? OFFSET ?`,
          [username, username, username, limit, offset]
        );
        
        // If we have enough posts from friends, return them
        if (friendPosts.length >= limit) {
          return this.formatPosts(friendPosts);
        }
        
        // If we need more posts, get posts based on adsorption ranking
        const remainingCount = limit - friendPosts.length;
        const newOffset = Math.max(0, offset - friendPosts.length);
        
        const [rankedPosts] = await conn.query(
          `SELECT p.*, u.first_name, u.last_name, u.profile_photo,
                  pr.weight as ranking_weight
           FROM post_rankings pr
           JOIN posts p ON pr.post_id = p.post_id
           JOIN users u ON p.username = u.username
           WHERE pr.user_label = ?
             AND p.post_id NOT IN (
               SELECT post_id FROM posts
               WHERE username IN (
                 SELECT user2 FROM friendships WHERE user1 = ?
                 UNION
                 SELECT user1 FROM friendships WHERE user2 = ?
               )
               OR username = ?
             )
           ORDER BY pr.weight DESC, p.created_at DESC
           LIMIT ? OFFSET ?`,
          [username, username, username, username, remainingCount, newOffset]
        );
        
        // If we have posts from hashtags of interest
        const [hashtagPosts] = await conn.query(
          `SELECT p.*, u.first_name, u.last_name, u.profile_photo
           FROM posts p
           JOIN post_hashtags ph ON p.post_id = ph.post_id
           JOIN user_interests ui ON ph.hashtag = ui.hashtag
           JOIN users u ON p.username = u.username
           WHERE ui.username = ?
             AND p.username != ?
             AND p.post_id NOT IN (
               SELECT post_id FROM posts
               WHERE username IN (
                 SELECT user2 FROM friendships WHERE user1 = ?
                 UNION
                 SELECT user1 FROM friendships WHERE user2 = ?
               )
             )
             AND p.post_id NOT IN (${rankedPosts.map(p => '?').join(',') || "''"})
           ORDER BY p.created_at DESC
           LIMIT ?`,
          [
            username, 
            username, 
            username, 
            username, 
            ...rankedPosts.map(p => p.post_id),
            remainingCount
          ]
        );
        
        // Get federation posts from Kafka that were ranked highly
        const [kafkaPosts] = await conn.query(
          `SELECT kp.*, NULL as first_name, NULL as last_name, NULL as profile_photo 
           FROM kafka_posts kp
           JOIN post_rankings pr ON kp.post_id = pr.post_id
           WHERE pr.user_label = ?
           ORDER BY pr.weight DESC, kp.created_at DESC
           LIMIT ?`,
          [username, Math.floor(remainingCount / 3)] // Allow up to 1/3 of feed to be Kafka posts
        );
        
        // Combine all posts and sort by ranking weight or creation date
        const allPosts = [
          ...friendPosts.map(p => ({ ...p, source: 'friend', weight: 1.0 })),
          ...rankedPosts.map(p => ({ ...p, source: 'ranked', weight: p.ranking_weight })),
          ...hashtagPosts.map(p => ({ ...p, source: 'hashtag', weight: 0.7 })),
          ...kafkaPosts.map(p => ({ ...p, source: 'kafka', weight: p.weight || 0.5 }))
        ];
        
        // Sort posts by weight (higher first) and creation date (newer first)
        allPosts.sort((a, b) => {
          if (a.weight !== b.weight) {
            return b.weight - a.weight;
          }
          return new Date(b.created_at) - new Date(a.created_at);
        });
        
        // Return limited number of posts
        return this.formatPosts(allPosts.slice(0, limit));
      } finally {
        conn.release();
      }
    } catch (error) {
      console.error('Error getting feed:', error);
      throw error;
    }
  }
  
  /**
   * Format posts for frontend display
   * @param {Array} posts - Raw posts from database
   * @return {Array} - Formatted posts
   */
  formatPosts(posts) {
    return posts.map(post => {
      const formattedPost = {
        id: post.post_id,
        username: post.username,
        caption: post.caption,
        imageUrl: post.image_url,
        createdAt: post.created_at,
        likes: post.likes_count || 0,
        comments: post.comments_count || 0,
        user: {
          username: post.username,
          firstName: post.first_name,
          lastName: post.last_name,
          profilePhoto: post.profile_photo
        }
      };
      
      // Add source info if available (for debugging)
      if (post.source) {
        formattedPost.source = post.source;
        formattedPost.weight = post.weight;
      }
      
      return formattedPost;
    });
  }
  
  /**
   * Get posts for a specific hashtag
   * @param {string} hashtag - The hashtag to search for
   * @param {number} page - The page number
   * @param {number} limit - Number of posts per page
   * @return {Promise<Array>} - Array of posts
   */
  async getPostsByHashtag(hashtag, page = 1, limit = 10) {
    const offset = (page - 1) * limit;
    
    try {
      const [posts] = await this.pool.query(
        `SELECT p.*, u.first_name, u.last_name, u.profile_photo
         FROM posts p
         JOIN post_hashtags ph ON p.post_id = ph.post_id
         JOIN users u ON p.username = u.username
         WHERE ph.hashtag = ?
         ORDER BY p.created_at DESC
         LIMIT ? OFFSET ?`,
        [hashtag, limit, offset]
      );
      
      return this.formatPosts(posts);
    } catch (error) {
      console.error('Error getting posts by hashtag:', error);
      throw error;
    }
  }
  
  /**
   * Get a user's profile posts
   * @param {string} username - The username
   * @param {number} page - The page number
   * @param {number} limit - Number of posts per page
   * @return {Promise<Array>} - Array of posts
   */
  async getUserPosts(username, page = 1, limit = 10) {
    const offset = (page - 1) * limit;
    
    try {
      const [posts] = await this.pool.query(
        `SELECT p.*, u.first_name, u.last_name, u.profile_photo
         FROM posts p
         JOIN users u ON p.username = u.username
         WHERE p.username = ?
         ORDER BY p.created_at DESC
         LIMIT ? OFFSET ?`,
        [username, limit, offset]
      );
      
      return this.formatPosts(posts);
    } catch (error) {
      console.error('Error getting user posts:', error);
      throw error;
    }
  }
}

// Create singleton instance
const feedService = new FeedService();

export default feedService; 