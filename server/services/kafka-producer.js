import { Kafka } from 'kafkajs';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Read config file instead of importing it directly
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const configFile = fs.readFileSync(path.join(__dirname, '../../config.json'), 'utf8');
const config = JSON.parse(configFile);

class KafkaProducer {
  constructor() {
    this.kafka = new Kafka({
      clientId: 'pennstagram-producer',
      brokers: config.bootstrapServers,
    });
    
    this.producer = this.kafka.producer();
    this.topic = config.topic;
    this.isConnected = false;
  }

  async connect() {
    if (!this.isConnected) {
      try {
        await this.producer.connect();
        console.log('Kafka producer connected successfully');
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
        await this.producer.disconnect();
        console.log('Kafka producer disconnected');
        this.isConnected = false;
      } catch (error) {
        console.error('Error disconnecting from Kafka:', error);
      }
    }
  }

  async sendPost(post) {
    try {
      if (!this.isConnected) {
        await this.connect();
      }

      const message = {
        key: `${post.username}-${Date.now()}`,
        value: JSON.stringify({
          username: post.username,
          source_site: config.groupId, // Use the groupId as source_site
          post_uuid_within_site: post.post_id,
          post_text: post.caption || '',
          content_type: post.image_url ? 'image' : 'text'
        })
      };

      await this.producer.send({
        topic: this.topic,
        messages: [message]
      });

      console.log(`Post from ${post.username} sent to Kafka topic ${this.topic}`);
      return true;
    } catch (error) {
      console.error('Error sending post to Kafka:', error);
      return false;
    }
  }

  // Method to send profile update events to Kafka
  async sendProfileUpdate(update) {
    try {
      if (!this.isConnected) {
        await this.connect();
      }
      const message = {
        key: `profile-${update.user_id}-${Date.now()}`,
        value: JSON.stringify(update)
      };
      await this.producer.send({
        topic: this.topic,
        messages: [message]
      });
      console.log(`Profile update for user ${update.user_id} sent to Kafka topic ${this.topic}`);
      return true;
    } catch (error) {
      console.error('Error sending profile update to Kafka:', error);
      return false;
    }
  }
}

// Create a singleton instance
const kafkaProducer = new KafkaProducer();

export default kafkaProducer;
