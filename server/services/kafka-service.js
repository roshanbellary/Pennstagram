import kafkaProducer from './kafka-producer.js';
import kafkaConsumer from './kafka-consumer.js';

/**
 * Initialize Kafka services
 */
export async function initializeKafkaServices() {
  try {
    console.log('Initializing Kafka services...');
    
    // Connect the producer
    await kafkaProducer.connect();
    
    // Start the consumer scheduler to run hourly
    kafkaConsumer.startScheduler();
    
    // Run the consumer immediately on startup
    console.log('Running initial Kafka consumer job on startup...');
    setTimeout(() => {
      kafkaConsumer.consumeMessages().catch(error => {
        console.error('Error running initial Kafka consumer job:', error);
      });
    }, 5000); // Wait 5 seconds to ensure everything is properly initialized
    
    console.log('Kafka services initialized successfully');
    
    // Setup graceful shutdown
    process.on('SIGTERM', async () => {
      console.log('SIGTERM received, shutting down Kafka services');
      await kafkaProducer.disconnect();
      kafkaConsumer.stopScheduler();
      await kafkaConsumer.disconnect();
    });
    
    process.on('SIGINT', async () => {
      console.log('SIGINT received, shutting down Kafka services');
      await kafkaProducer.disconnect();
      kafkaConsumer.stopScheduler();
      await kafkaConsumer.disconnect();
    });
    
  } catch (error) {
    console.error('Failed to initialize Kafka services:', error);
  }
}

export { kafkaProducer, kafkaConsumer };
