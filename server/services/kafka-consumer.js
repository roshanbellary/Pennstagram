import pkg from 'kafkajs';
const { Kafka, CompressionTypes, CompressionCodecs } = pkg;
import SnappyCodec from 'kafkajs-snappy';
// register snappy compression codec
CompressionCodecs[CompressionTypes.Snappy] = SnappyCodec;
import cron from 'node-cron';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';
import { get_db_connection } from '../models/rdbms.js';

// Read config file instead of importing it directly
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const configFile = fs.readFileSync(path.join(__dirname, '../../config.json'), 'utf8');
const config = JSON.parse(configFile);

// Helper function to query the database using rdbms.js
async function queryDatabase(query, params = []) {
  const dbaccess = get_db_connection();
  try {
    await dbaccess.connect();
    const [results] = await dbaccess.send_sql(query, params);
    return [results];
  } catch (error) {
    console.error('Database query error:', error);
    throw error;
  } finally {
    dbaccess.close();
  }
}

class KafkaConsumer {
  constructor() {
    this.kafka = new Kafka({
      clientId: 'pennstagram-consumer',
      brokers: config.bootstrapServers,
    });
    
    this.consumer = this.kafka.consumer({ groupId: config.groupId });
    this.topic = config.topic;
    this.isConnected = false;
    this.isRunning = false;
    this.cronJob = null;
  }

  async connect() {
    if (!this.isConnected) {
      try {
        await this.consumer.connect();
        await this.consumer.subscribe({ topic: this.topic, fromBeginning: false });
        console.log(`Kafka consumer connected and subscribed to topic: ${this.topic}`);
        this.isConnected = true;
      } catch (error) {
        console.error('Error connecting to Kafka:', error);
        throw error;
      }
    }
  }

  async disconnect() {
    if (this.isConnected) {
      try {
        await this.consumer.disconnect();
        console.log('Kafka consumer disconnected');
        this.isConnected = false;
      } catch (error) {
        console.error('Error disconnecting from Kafka:', error);
      }
    }
  }

  async processMessage(message) {
    try {
      const messageValue = JSON.parse(message.value.toString());
      
      // Print detailed information about the received message
      console.log('====================================');
      console.log('KAFKA MESSAGE RECEIVED:');
      console.log('====================================');
      console.log('Message Key:', message.key ? message.key.toString() : 'null');
      console.log('Message Timestamp:', new Date(parseInt(message.timestamp)).toISOString());
      console.log('Message Partition:', message.partition);
      console.log('Message Offset:', message.offset);
      console.log('Raw Content:', JSON.stringify(messageValue, null, 2));
      
      // Extract post data based on message format
      let postData;
      if (messageValue.post_json) {
        // Handle the nested format
        postData = messageValue.post_json;
        console.log('Content (nested format):');
      } else {
        // Handle the flat format
        postData = messageValue;
        console.log('Content (flat format):');
      }
      
      console.log('  Username:', postData.username || 'unknown');
      console.log('  Source Site:', postData.source_site || 'unknown');
      console.log('  Post UUID:', postData.post_uuid_within_site || 'unknown');
      console.log('  Post Text:', postData.post_text || 'unknown');
      console.log('  Content Type:', postData.content_type || 'unknown');
      
      // Check for image attachment
      if (messageValue.attach && messageValue.attach.image) {
        console.log('  Image:', messageValue.attach.image);
      }
      
      console.log('====================================');

      const user_id = 1;
      const postId = uuidv4();
      const timestamp = new Date().toISOString().slice(0, 19).replace('T', ' ');
      
      // Prepare data for database insertion
      const postText = postData.post_text || postData.text || '';
      const sourceSite = postData.source_site || '';
      const originalPostId = postData.post_uuid_within_site || '';
      const imageUrl = messageValue.attach && messageValue.attach.image ? messageValue.attach.image : null;
      if (sourceSite === 'mundes') {
        return;
      }
      if (postText === ''){
        return ;
      }
      await queryDatabase(
        "INSERT INTO posts (author_id, content, created_at, image_url, source_site, original_post_id) VALUES (?, ?, ?, ?, ?, ?)",
        [user_id, postText, timestamp, imageUrl, sourceSite, originalPostId]
      );

      // console.log(`Post from ${postData.username || 'unknown'} (${sourceSite}) saved to database with ID ${postId} and assigned to user ${randomUser.username}`);
    } catch (error) {
      console.error('Error processing Kafka message:', error);
      console.error('Message content:', message.value ? message.value.toString() : 'null');
    }
  }

  async consumeMessages() {
    try {
      if (!this.isConnected) {
        await this.connect();
      }

      console.log('====================================');
      console.log('STARTING KAFKA CONSUMER SESSION');
      console.log(`Topic: ${this.topic}`);
      console.log(`Group ID: ${config.groupId}`);
      console.log(`Brokers: ${config.bootstrapServers.join(', ')}`);
      console.log(`Time: ${new Date().toISOString()}`);
      console.log('====================================');
      
      // Run for a limited time (e.g., 5 minutes) to avoid consuming indefinitely
      const startTime = Date.now();
      const timeLimit = 5 * 60 * 1000; // 5 minutes in milliseconds
      let messageCount = 0;
      
      await this.consumer.run({
        eachMessage: async ({ topic, partition, message }) => {
          messageCount++;
          console.log(`Processing message #${messageCount}...`);
          await this.processMessage(message);
          
          // Check if we've exceeded the time limit
          if (Date.now() - startTime > timeLimit) {
            console.log('====================================');
            console.log('KAFKA CONSUMER SESSION COMPLETED');
            console.log(`Messages processed: ${messageCount}`);
            console.log(`Duration: ${Math.round((Date.now() - startTime) / 1000)} seconds`);
            console.log(`Time: ${new Date().toISOString()}`);
            console.log('====================================');
            await this.consumer.stop();
          }
        },
      });
    } catch (error) {
      console.error('Error consuming messages from Kafka:', error);
    }
  }

  startScheduler() {
    if (!this.isRunning) {
      // Schedule to run every hour
      this.cronJob = cron.schedule('0 * * * *', async () => {
        console.log('Running scheduled Kafka consumer job');
        await this.consumeMessages();
      });
      
      this.isRunning = true;
      console.log('Kafka consumer scheduler started');
    }
  }

  stopScheduler() {
    if (this.isRunning && this.cronJob) {
      this.cronJob.stop();
      this.isRunning = false;
      console.log('Kafka consumer scheduler stopped');
    }
  }
}

// Create a singleton instance
const kafkaConsumer = new KafkaConsumer();

export default kafkaConsumer;
