import { exec } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import cron from 'node-cron';
import fetch from 'node-fetch';

// Get directory paths
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const configFile = fs.readFileSync(path.join(__dirname, '../../config.json'), 'utf8');
const config = JSON.parse(configFile);

// Environment
const isProduction = process.env.NODE_ENV === 'production';

// Spark job paths
const sparkJobPath = path.join(__dirname, '../spark/build-and-run.sh');
const livyJobPath = path.join(__dirname, '../spark/run-livy.sh');

/**
 * Handles running the Spark job
 */
class RankingScheduler {
  constructor() {
    this.isRunning = false;
  }

  /**
   * Start the scheduler to run the Spark job hourly
   */
  start() {
    // Set up environment variables for the Spark job
    const env = {
      ...process.env,
      DB_HOST: config.database.host,
      DB_PORT: config.database.port,
      DB_NAME: config.database.database,
      DB_USER: process.env.DB_USER || 'root',
      DB_PASSWORD: process.env.DB_PASSWORD || '',
      LIVY_SERVER: process.env.LIVY_SERVER || 'http://localhost:8998',
      DB_URL: `jdbc:mysql://${config.database.host}:${config.database.port}/${config.database.database}`
    };

    // Schedule the job to run hourly
    cron.schedule('0 * * * *', () => {
      this.runJob(env);
    });

    console.log('Ranking scheduler started. Will run hourly.');

    // Run immediately on startup
    this.runJob(env);
  }

  /**
   * Run the Spark job with the provided environment
   */
  runJob(env) {
    if (this.isRunning) {
      console.log('Spark job is already running. Skipping this run.');
      return;
    }

    this.isRunning = true;
    console.log('Starting post ranking Spark job...');

    // Decide whether to use local Spark or Livy
    const jobPath = isProduction ? livyJobPath : sparkJobPath;

    // Make the script executable
    fs.chmodSync(jobPath, '755');

    // Execute the Spark job
    exec(jobPath, { env }, (error, stdout, stderr) => {
      this.isRunning = false;

      if (error) {
        console.error(`Error running Spark job: ${error.message}`);
        return;
      }

      if (stderr) {
        console.error(`Spark job stderr: ${stderr}`);
      }

      console.log(`Spark job completed successfully: ${stdout}`);
    });
  }

  /**
   * Run the ranking job on demand
   */
  runNow() {
    if (this.isRunning) {
      console.log('Spark job is already running.');
      return false;
    }

    // Set up environment variables for the Spark job
    const env = {
      ...process.env,
      DB_HOST: config.database.host,
      DB_PORT: config.database.port,
      DB_NAME: config.database.database,
      DB_USER: process.env.DB_USER || 'root',
      DB_PASSWORD: process.env.DB_PASSWORD || '',
      LIVY_SERVER: process.env.LIVY_SERVER || 'http://localhost:8998',
      DB_URL: `jdbc:mysql://${config.database.host}:${config.database.port}/${config.database.database}`
    };

    this.runJob(env);
    return true;
  }

  /**
   * Check Livy job status by ID
   * Used in production to monitor running jobs
   */
  async checkLivyJobStatus(jobId) {
    if (!isProduction) {
      return { status: 'not_supported', message: 'Livy status check only supported in production' };
    }

    try {
      const livyServer = process.env.LIVY_SERVER || 'http://localhost:8998';
      const response = await fetch(`${livyServer}/batches/${jobId}`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' }
      });

      if (!response.ok) {
        throw new Error(`Failed to check job status: ${response.statusText}`);
      }

      const data = await response.json();
      return {
        status: data.state,
        appId: data.appId,
        appInfo: data.appInfo,
        log: data.log
      };
    } catch (error) {
      console.error(`Error checking Livy job status: ${error}`);
      return { status: 'error', message: error.message };
    }
  }
}

// Create singleton instance
const rankingScheduler = new RankingScheduler();

export default rankingScheduler; 