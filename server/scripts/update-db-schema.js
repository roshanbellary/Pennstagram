import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { get_db_connection } from '../models/rdbms.js';

// Get the directory name of the current module
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Read database configuration from config.json
const configFile = fs.readFileSync(path.join(__dirname, '../../config.json'), 'utf8');
const config = JSON.parse(configFile);

async function updateDatabaseSchema() {
  console.log('Checking and updating database schema for Kafka integration...');
  
  const dbaccess = get_db_connection();
  
  try {
    // Connect to the database using the existing connection module
    await dbaccess.connect();
    console.log('Connected to database successfully');
    
    // First, check if the posts table exists
    const [tables] = await dbaccess.send_sql("SHOW TABLES LIKE 'posts'");
    
    if (tables.length === 0) {
      console.log('Posts table does not exist, creating it...');
      await dbaccess.create_tables(`
        CREATE TABLE IF NOT EXISTS posts (
          post_id BIGINT AUTO_INCREMENT PRIMARY KEY,
          author_id INT NOT NULL,
          parent_post INT DEFAULT NULL,
          title VARCHAR(255) DEFAULT NULL,
          content TEXT,
          image_url VARCHAR(255) DEFAULT NULL,
          hashtags VARCHAR(255) DEFAULT NULL,
          timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          source_site VARCHAR(50) DEFAULT NULL,
          original_post_id VARCHAR(255) DEFAULT NULL
        )
      `);
      console.log('Created posts table with Kafka integration columns');
      return;
    }
    
    // Check if the posts table has the necessary columns for Kafka integration
    const [columns] = await dbaccess.send_sql(
      "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'posts'",
      [config.database.database]
    );
    
    const columnNames = columns.map(col => col.COLUMN_NAME);
    console.log('Existing columns in posts table:', columnNames);
    
    // Add source_site column if it doesn't exist
    if (!columnNames.includes('source_site')) {
      console.log('Adding source_site column to posts table...');
      await dbaccess.send_sql(
        "ALTER TABLE posts ADD COLUMN source_site VARCHAR(50) DEFAULT NULL"
      );
      console.log('Added source_site column');
    }
    
    // Add original_post_id column if it doesn't exist
    if (!columnNames.includes('original_post_id')) {
      console.log('Adding original_post_id column to posts table...');
      await dbaccess.send_sql(
        "ALTER TABLE posts ADD COLUMN original_post_id VARCHAR(255) DEFAULT NULL"
      );
      console.log('Added original_post_id column');
    }
    
    console.log('Database schema update completed successfully');
  } catch (error) {
    console.error('Error updating database schema:', error);
  } finally {
    // Close the database connection
    dbaccess.close();
  }
}

// Run the update function
updateDatabaseSchema();
