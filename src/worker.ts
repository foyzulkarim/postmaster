import 'dotenv/config';
import { Worker } from 'bullmq';
import { Redis } from 'ioredis';
import { config } from './config';
import { workerLogger } from './utils/logger';
import { NotificationWorker } from './jobs/notification.worker';

// Initialize Redis connection for BullMQ worker
const redis = new Redis({
  host: config.redis.host,
  port: config.redis.port,
  password: config.redis.password,
  maxRetriesPerRequest: null, // Required for BullMQ
  lazyConnect: true,
});

// Initialize notification worker instance
const notificationWorker = new NotificationWorker();

// Create BullMQ worker
const worker = new Worker(
  'notification',
  async (job) => {
    return await notificationWorker.processJob(job);
  },
  {
    connection: redis,
    concurrency: 5, // Process up to 5 jobs concurrently
    removeOnComplete: { count: 100 }, // Keep last 100 completed jobs
    removeOnFail: { count: 50 }, // Keep last 50 failed jobs
  }
);

// Graceful shutdown handler
const gracefulShutdown = async (signal: string) => {
  workerLogger.info(`Received ${signal}, shutting down worker gracefully...`);
  
  try {
    // Close the worker
    await worker.close();
    workerLogger.info('Worker closed successfully');
    
    // Close Redis connection
    await redis.quit();
    workerLogger.info('Redis connection closed');
    
    // Close database connection
    await notificationWorker.close();
    workerLogger.info('Database connection closed');
    
    process.exit(0);
  } catch (error) {
    workerLogger.error('Error during worker shutdown', { 
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
    });
    process.exit(1);
  }
};

// Start the worker
const start = async () => {
  try {
    workerLogger.info('Starting Postmaster notification worker...', {
      nodeVersion: process.version,
      environment: process.env.NODE_ENV || 'development',
      redisHost: config.redis.host,
      redisPort: config.redis.port,
      concurrency: 5,
    });

    // Setup event listeners
    setupEventListeners();

    // Setup graceful shutdown
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
    process.on('SIGHUP', () => gracefulShutdown('SIGHUP'));

    workerLogger.info('🚀 Notification worker started successfully', {
      queueName: 'notification',
      concurrency: 5,
    });

  } catch (error) {
    workerLogger.error('Failed to start worker', { 
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
    });
    process.exit(1);
  }
};

// Setup event listeners for worker monitoring
const setupEventListeners = () => {
  // Job completed successfully
  worker.on('completed', (job) => {
    workerLogger.info('Job completed successfully', {
      jobId: job.id,
      jobName: job.name,
      duration: job.finishedOn ? job.finishedOn - job.processedOn! : 0,
      attempts: job.attemptsMade,
    });
  });

  // Job failed
  worker.on('failed', (job, err) => {
    workerLogger.error('Job failed', {
      jobId: job?.id,
      jobName: job?.name,
      error: err.message,
      attempts: job?.attemptsMade,
      maxAttempts: job?.opts.attempts,
      stack: err.stack,
    });
  });

  // Job is active (being processed)
  worker.on('active', (job) => {
    workerLogger.debug('Job started processing', {
      jobId: job.id,
      jobName: job.name,
      attempts: job.attemptsMade,
    });
  });

  // Job stalled (worker died while processing)
  worker.on('stalled', (jobId) => {
    workerLogger.warn('Job stalled', { jobId });
  });

  // Job progress update
  worker.on('progress', (job, progress) => {
    workerLogger.debug('Job progress update', {
      jobId: job.id,
      progress,
    });
  });

  // Worker error
  worker.on('error', (err) => {
    workerLogger.error('Worker error', {
      error: err.message,
      stack: err.stack,
    });
  });

  // Worker ready
  worker.on('ready', () => {
    workerLogger.info('Worker is ready to process jobs');
  });

  // Worker closing
  worker.on('closing', () => {
    workerLogger.info('Worker is closing...');
  });

  // Worker closed
  worker.on('closed', () => {
    workerLogger.info('Worker closed');
  });

  workerLogger.info('Worker event listeners setup complete');
};

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  workerLogger.fatal('Uncaught exception in worker', { 
    error: error.message, 
    stack: error.stack 
  });
  process.exit(1);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  workerLogger.fatal('Unhandled promise rejection in worker', { 
    reason, 
    promise 
  });
  process.exit(1);
});

// Start the worker
start();
