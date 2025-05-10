// Scheduler for the adsorption ranking job
// Runs the job once per hour
import nodeCron from 'node-cron';
import axios from 'axios';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { get_db_connection } from '../models/rdbms.js';

// ES modules equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Livy server configuration
const LIVY_URL = 'http://localhost:8998';

// Set to true to try Livy first, false to use direct execution only
const USE_LIVY = true;

// Database connection for retrieving and storing data
const dbaccess = get_db_connection();

/**
 * Run the adsorption job
 */
async function runAdsorptionJob() {
  try {
    // Set database connection info
    const config = JSON.parse(fs.readFileSync(path.join(dirname(dirname(__dirname)), 'config.json'), 'utf8'));
    console.log('Database connection info set to: ', config.database);
    
    // First, try to use Livy if it's enabled and available
    if (USE_LIVY) {
      try {
        console.log('Attempting to run job via Livy on EMR...');
        
        // Check if Livy is available by making a request to the sessions endpoint
        try {
          const result = await axios.get(`${LIVY_URL}/batches/`, { timeout: 5000 });
          console.log(result);
          console.log('Livy is available, submitting job...');
          
          // Submit job to Livy - use HDFS path format which Livy can access
          // Note: For EMR, we need to use a path that's accessible to the EMR cluster
          // This could be an S3 path or an HDFS path depending on your setup
          const localJarPath = path.resolve(dirname(dirname(__dirname)), 'server/spark/target/instalite-adsorption-1.0-SNAPSHOT-jar-with-dependencies.jar');
          console.log(`Local JAR path: ${localJarPath}`);
          
          // Check if JAR exists locally
          if (!fs.existsSync(localJarPath)) {
            console.warn(`Warning: JAR file does not exist locally at ${localJarPath}`);
            console.warn('Make sure the JAR is accessible to the EMR cluster');
          }
          
          // For EMR, use a path that's accessible to the cluster
          // This is typically an HDFS or S3 path
          const emrJarPath = '/root/nets2120/project-instalite-mundes/server/spark/target/instalite-adsorption-1.0-SNAPSHOT-jar-with-dependencies.jar';
          console.log(`Using EMR JAR path: ${emrJarPath}`);
          console.log(`Config host: ${config.database.host}`);
          console.log(`Config port: ${config.database.port}`);
          console.log(`Config database: ${config.database.database}`);
          console.log(`Config user: ${config.database.user}`);
          console.log(`Config password: ${config.database.password}`);
          const response = await axios.post(`${LIVY_URL}/batches`, {
            file: emrJarPath,
            className: 'edu.upenn.cis.nets2120.adsorption.AdsorptionRankJob',
            args: [
              config.database.host,
              config.database.port,
              config.database.database,
              config.database.user,
              config.database.password
            ],
            conf: {
              'spark.driver.memory': '2g',
              'spark.executor.memory': '2g'
            }
          });
          
          const batchId = response.data.id;
          console.log(`Adsorption job submitted to Livy with batch ID: ${batchId}`);
          
          // Poll for job status
          await pollJobStatus(batchId);
          return true;
        } catch (connectionError) {
          console.log(`Error connecting to Livy: ${connectionError.message}`);
          if (connectionError.response) {
            console.log(`Livy response status: ${connectionError.response.status}`);
            console.log(`Livy response data: ${JSON.stringify(connectionError.response.data, null, 2)}`);
          }
          throw connectionError;
        }
      } catch (livyError) {
        // If Livy is not available or fails, fall back to direct execution
        console.log(`Livy not available or failed: ${livyError.message}`);
        console.log('Falling back to direct execution...');
      }
    }
    
    // Direct execution (either as fallback or primary method if Livy is disabled)
    console.log('Running via direct execution...');
    
    // Use the child_process module to run the shell script
    const { exec } = await import('child_process');
    const projectRoot = path.resolve(dirname(dirname(__dirname)));
    const scriptPath = path.join(projectRoot, 'run-adsorption-rank.sh');
    
    return new Promise((resolve, reject) => {
      // Increase maxBuffer to handle large output
      const options = { 
        cwd: projectRoot,
        maxBuffer: 10 * 1024 * 1024 // 10MB buffer
      };
      
      exec(scriptPath, options, (error, stdout, stderr) => {
        if (error) {
          console.error(`Error running adsorption script: ${error.message}`);
          // Only log a portion of stderr to avoid console flooding
          if (stderr) {
            console.error(`Error output (truncated): ${stderr.substring(0, 500)}...`);
          }
          reject(error);
          return;
        }
        
        console.log('Adsorption job completed successfully via direct execution');
        // Only log the last part of stdout which typically contains the summary
        if (stdout.length > 1000) {
          console.log(`Job output (last part): ...${stdout.substring(stdout.length - 1000)}`);
        } else {
          console.log(stdout);
        }
        resolve();
      });
    });
  } catch (error) {
    console.error(`Error running adsorption job: ${error.message}`);
    if (error.response) {
      console.error(`Response data: ${JSON.stringify(error.response.data)}`);
    }
  }
}

/**
 * Poll Livy for job status
 */
async function pollJobStatus(batchId) {
  let completed = false;
  let attempts = 0;
  const maxAttempts = 30; // Poll for up to 15 minutes (30 * 30s)
  
  while (!completed && attempts < maxAttempts) {
    try {
      const response = await axios.get(`${LIVY_URL}/batches/${batchId}`);
      const state = response.data.state;
      
      console.log(`Batch ${batchId} state: ${state}`);
      
      if (state === 'success') {
        console.log(`Adsorption job completed successfully via Livy`);
        completed = true;
      } else if (state === 'error' || state === 'dead' || state === 'killed') {
        console.error(`Adsorption job failed with state: ${state}`);
        if (response.data.log && response.data.log.length > 0) {
          console.error(`Log (truncated): ${JSON.stringify(response.data.log.slice(-5))}`);
        }
        throw new Error(`Job failed with state: ${state}`);
      } else {
        // Wait 30 seconds before polling again
        await new Promise(resolve => setTimeout(resolve, 30000));
        attempts++;
      }
    } catch (error) {
      console.error(`Error polling job status: ${error.message}`);
      throw error;
    }
  }
  
  if (!completed) {
    console.error(`Gave up waiting for job completion after ${maxAttempts} attempts`);
    throw new Error('Timeout waiting for job completion');
  }
}



/**
 * Schedule the adsorption job to run every hour
 */
function scheduleAdsorptionJob() {
  // Run immediately on startup
  runAdsorptionJob();
  
  // Then schedule to run every hour
  nodeCron.schedule('0 * * * *', () => {
    console.log('Scheduled adsorption job triggered');
    runAdsorptionJob();
  });
  
  console.log('Adsorption job scheduler started');
}

// Start the scheduler
scheduleAdsorptionJob();

export { runAdsorptionJob, scheduleAdsorptionJob };