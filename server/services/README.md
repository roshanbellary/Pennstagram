# Kafka Integration for InstaLite

This directory contains the Kafka integration services for the InstaLite application. The integration allows the application to both produce posts to a Kafka stream and consume posts from the stream.

## Components

### 1. Kafka Producer (`kafka-producer.js`)

The Kafka producer sends posts created by users to the Kafka stream. Each post is formatted as follows:

```json
{
  "username": "...",
  "source_site": "...", // The groupId from config.json
  "post_uuid_within_site": "...", // The post_id in our database
  "post_text": "...", // The caption/content of the post
  "content_type": "..." // "image" or "text"
}
```

### 2. Kafka Consumer (`kafka-consumer.js`)

The Kafka consumer runs on a schedule (hourly) to consume posts from the Kafka stream and store them in the local database. It:

1. Connects to the Kafka stream
2. Consumes messages for a limited time (5 minutes)
3. For each message, selects a random user from the database and assigns the post to them
4. Stores the post with source information in the database

### 3. Kafka Service Initializer (`kafka-service.js`)

This module initializes both the producer and consumer when the application starts. It also handles graceful shutdown of Kafka connections when the application terminates.

## Database Schema Updates

The integration adds two new columns to the `posts` table:

- `source_site`: Stores the source site identifier (the groupId of the originating site)
- `original_post_id`: Stores the original post ID from the source site

These columns allow tracking where external posts came from.

## Configuration

The Kafka integration uses the following configuration from `config.json`:

```json
{
  "groupId": "mundes", // Your group ID
  "bootstrapServers": ["localhost:9092"], // Kafka broker addresses
  "topic": "Bluesky-Kafka" // Kafka topic to produce/consume
}
```

## Usage

The integration is automatically initialized when the server starts. No additional steps are required to use it.
