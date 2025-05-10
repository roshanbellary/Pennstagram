# InstaLite - NETS 2120 Project

**Team Members:**
- Roshan Bellary (rbellary@seas.upenn.edu)
- Rishabh Mandayam (rcmand@seas.upenn.edu)
- Vedant Gaur (vedantg@seas.upenn.edu)

## Project Description

InstaLite is an Instagram-like social media platform that allows users to create accounts, post content, follow friends, and interact with posts through likes and comments. The platform includes advanced features such as adsorption-based content ranking, real-time chat, and integration with external data sources.

## How to Run
First, set up an AWS RDS instance and EC2 instance and setup a tunnel to the EC2 instance at
port 3306. Finally, tunnel to the EC2 instance for the Kafka stream

Run the server using **npm start**

Run the frontend using **npm run start:react**

First set up the chromadb instance using **./chroma_setup.sh**. Then run the chroma server using **./run-chroma.sh**
Finally, Run the indexing for chromadb using **npm run index**.

Run the chron job for the adsorption algorithm using **./run-adsorption-rank.sh**

## Features Implemented

### Core Features
1. **User Authentication**
   - User registration and login
   - Password encryption and security

2. **Social Networking**
   - Friend/follow relationships
   - User profiles with customizable information

3. **Content Sharing**
   - Text and image posts
   - Comments and likes on posts
   - Hashtag support

4. **Feed System**
   - Personalized feed based on friends' activities
   - Adsorption algorithm for content ranking
   - Integration with external content sources

5. **Real-time Communication**
   - Direct messaging between users
   - Online status indicators

### Advanced Features
1. **Adsorption Ranking Algorithm**
   - Apache Spark implementation for content recommendation
   - Hourly job execution via cron
   - Graph-based ranking considering user relationships, hashtags, and interactions

2. **Database Integration**
   - MySQL database for structured data
   - Efficient schema design for social networking data

3. **Deployment Infrastructure**
   - AWS EC2 hosting
   - Load balancing and scaling capabilities

## Extra Credit Features
- Implemented websocket chat
- Implemented the notion of groups as you can add multiple people

## Source Files

### Backend
- `server/app.js` - Main Express server application
- `server/routes/routes.js` - API endpoints for the application
- `server/models/*.js` - Database models and schema definitions
- `server/services/adsorptionScheduler.js` - Scheduler for the adsorption ranking job
- `server/spark/src/main/java/edu/upenn/cis/nets2120/adsorption/AdsorptionRankJob.java` - Spark job for adsorption ranking

### Frontend
- `src/pages/*.tsx` - React components for different pages
- `src/components/*.tsx` - Reusable UI components
- `src/App.tsx` - Main application component
- `src/index.tsx` - Entry point for the React application

### Configuration and Utilities
- `config.json` - Configuration for database and services
- `run-adsorption-rank.sh` - Script to run the adsorption ranking job
- `package.json` - Node.js dependencies

## Code Declaration

All code submitted in this project was written by our team members, building upon the frameworks and libraries specified in the project requirements.

## Setup and Running Instructions

### Prerequisites
- Node.js (v14+)
- Java 8+
- Maven
- MySQL
- Apache Spark
- AWS Account (for deployment)

### Local Development Setup

1. **Clone the repository**
   ```
   git clone <repository-url>
   cd project-instalite-mundes
   ```

2. **Install dependencies**
   ```
   npm install
   cd server/spark
   mvn clean package
   cd ../..
   ```

3. **Set up the database**
   ```
   # Create a MySQL database named 'imdb_basic'
   # Update config.json with your database credentials
   ```

4. **Run the application**
   ```
   # Start the backend server
   node server/app.js
   
   # In a separate terminal, start the frontend
   npm start
   ```

5. **Run the adsorption job manually**
   ```
   ./run-adsorption-rank.sh
   ```

### Deployment to AWS

1. **Set up EC2 instance**
   - Launch an EC2 instance with Amazon Linux 2
   - Install Node.js, Java, and other dependencies

2. **Configure the database**
   - Set up an RDS MySQL instance
   - Update config.json with the RDS endpoint

3. **Deploy the application**
   ```
   # Clone the repository on the EC2 instance
   git clone <repository-url>
   cd project-instalite-mundes
   
   # Install dependencies
   npm install
   cd server/spark
   mvn clean package
   cd ../..
   
   # Start the application
   pm2 start server/app.js
   ```

4. **Set up the cron job for adsorption ranking**
   ```
   # Add to crontab
   0 * * * * /path/to/project-instalite-mundes/run-adsorption-rank.sh
   ```

### Accessing the Application

- Local: http://localhost:3000
- Deployed: http://<ec2-public-ip>:3000

## Troubleshooting

- If you encounter database connection issues, verify the credentials in config.json
- For Spark job failures, check the adsorption.log file in the server/spark directory
- If the adsorption job is not running automatically, verify the cron job setup

## Additional Notes

- The adsorption algorithm runs hourly to provide fresh content recommendations
- User passwords are securely hashed and stored
- The application uses JWT for authentication
- All images are stored with appropriate references in the database
