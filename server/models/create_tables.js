import { get_db_connection, RelationalDB } from '../models/rdbms.js';

// Database connection setup
const dbaccess = get_db_connection();

function sendQueryOrCommand(db, query, params = []) {
    return new Promise((resolve, reject) => {
      db.query(query, params, (err, results) => {
        if (err) {
          reject(err);
        } else {
          resolve(results);
        }
      });
    });
  }

async function create_tables() {

  /**
   * These should exist from HW2 and 3
   */
  await dbaccess.create_tables('DROP TABLE IF EXISTS chat_participants;');
  await dbaccess.create_tables('DROP TABLE IF EXISTS chat_messages;');
  await dbaccess.create_tables('DROP TABLE IF EXISTS chat_sessions;');
  await dbaccess.create_tables('DROP TABLE IF EXISTS post_likes;');
  await dbaccess.create_tables('DROP TABLE IF EXISTS post_rankings;');
  await dbaccess.create_tables('DROP TABLE IF EXISTS post_hashtags;');
  await dbaccess.create_tables('DROP TABLE IF EXISTS post_recommendations;');
  await dbaccess.create_tables('DROP TABLE IF EXISTS user_hashtag_interests;');
  await dbaccess.create_tables('DROP TABLE IF EXISTS posts;');
  await dbaccess.create_tables('DROP TABLE IF EXISTS friends;');
  await dbaccess.create_tables('DROP TABLE IF EXISTS users;');
  // Note here that birth/death year should really be int but have often been put as string
  await dbaccess.create_tables('CREATE TABLE IF NOT EXISTS names ( \
    nconst VARCHAR(255) UNIQUE, \
    primaryName VARCHAR(255), \
    birthYear VARCHAR(4), \
    deathYear VARCHAR(4), \
    nconst VARCHAR(255) PRIMARY KEY \
    );')

  await dbaccess.create_tables('CREATE TABLE IF NOT EXISTS recommendations ( \
      person VARCHAR(255), \
      recommendation VARCHAR(255), \
      strength int, \
      FOREIGN KEY (person) REFERENCES names(nconst), \
      FOREIGN KEY (recommendation) REFERENCES names(nconst) \
      );')
    /**
     * This should also exist from HW3
     */
  await dbaccess.create_tables('CREATE TABLE IF NOT EXISTS friends ( \
    followed VARCHAR(255), \
    follower VARCHAR(255), \
    FOREIGN KEY (follower) REFERENCES names(nconst), \
    FOREIGN KEY (followed) REFERENCES names(nconst) \
    );')

    ///////////
    // TODO: create users and posts tables
    await dbaccess.create_tables('CREATE TABLE IF NOT EXISTS users ( \
      user_id INT NOT NULL AUTO_INCREMENT, \
      username VARCHAR(255), \
      hashed_password VARCHAR(255), \
      linked_nconst VARCHAR(255), \
      actor_nconst VARCHAR(255), \
      PRIMARY KEY (user_id), \
      FOREIGN KEY (linked_nconst) REFERENCES names(nconst) \
    );')
    await dbaccess.create_tables('DROP TABLE IF EXISTS posts;');
    await dbaccess.create_tables(`
      CREATE TABLE IF NOT EXISTS posts (
        post_id INT AUTO_INCREMENT,\
        author_id INT NOT NULL,\
        parent_post INT DEFAULT NULL,\
        title VARCHAR(255) DEFAULT NULL,\
        content TEXT,\
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,\
        image_url VARCHAR(255) DEFAULT NULL,\
        hashtags VARCHAR(255) DEFAULT NULL,\
        source_site VARCHAR(50) DEFAULT NULL,\
        original_post_id VARCHAR(255) DEFAULT NULL,\
        PRIMARY KEY (post_id),\
        FOREIGN KEY (parent_post) REFERENCES posts(post_id), \
        FOREIGN KEY (author_id) REFERENCES users(user_id) \
      )
    `);

    // Create chat sessions table
    await dbaccess.create_tables('CREATE TABLE IF NOT EXISTS chat_sessions ( \
      session_id INT NOT NULL AUTO_INCREMENT, \
      name VARCHAR(255) DEFAULT NULL, \
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, \
      is_group BOOLEAN DEFAULT FALSE, \
      PRIMARY KEY (session_id) \
    );')

    // Create chat participants table
    await dbaccess.create_tables('CREATE TABLE IF NOT EXISTS chat_participants ( \
      participant_id INT NOT NULL AUTO_INCREMENT, \
      session_id INT NOT NULL, \
      user_id INT NOT NULL, \
      joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, \
      left_at TIMESTAMP DEFAULT NULL, \
      PRIMARY KEY (participant_id), \
      FOREIGN KEY (session_id) REFERENCES chat_sessions(session_id), \
      FOREIGN KEY (user_id) REFERENCES users(user_id), \
      UNIQUE KEY (session_id, user_id) \
    );')

    // Create chat messages table
    await dbaccess.create_tables('CREATE TABLE IF NOT EXISTS chat_messages ( \
      message_id INT NOT NULL AUTO_INCREMENT, \
      session_id INT NOT NULL, \
      sender_id INT NOT NULL, \
      content TEXT NOT NULL, \
      sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, \
      PRIMARY KEY (message_id), \
      FOREIGN KEY (session_id) REFERENCES chat_sessions(session_id), \
      FOREIGN KEY (sender_id) REFERENCES users(user_id) \
    );')

    // Create recommendedPosts table
    await dbaccess.create_tables(`
      CREATE TABLE IF NOT EXISTS recommendedPosts (
        user_id INT NOT NULL,
        post_id INT NOT NULL,
        score INT,
        PRIMARY KEY (user_id, post_id),
        FOREIGN KEY (user_id) REFERENCES users(user_id),
        FOREIGN KEY (post_id) REFERENCES posts(post_id)
      );
    `);

    // Check if image_url column exists in posts table, if not add it
    try {
      // First check if the column exists
      const columnExists = await dbaccess.send_sql("SELECT column_name FROM information_schema.columns WHERE table_name = 'posts' AND column_name = 'image_url';");
      
      // Only add the column if it doesn't exist
      if (columnExists.length === 0) {
        await dbaccess.create_tables("ALTER TABLE posts ADD COLUMN image_url VARCHAR(1024) DEFAULT NULL;");
        console.log('Added image_url column to posts table');
      } else {
        console.log('image_url column already exists in posts table');
      }
    } catch (err) {
      console.error('Error checking or adding image_url column:', err);
    }

    return null;
}

console.log('Creating tables');

async function create_populate() {
  await dbaccess.connect();
  await create_tables();
  console.log('Tables created');
}

create_populate().then(() => {
  console.log('Done');
  dbaccess.close();
}).catch((err) => {
  console.error(err);
  dbaccess.close();
}
).finally(() => {
  process.exit(0);
});
