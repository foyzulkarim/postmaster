import { Queue, Job } from 'bullmq';
import { Redis } from 'ioredis';
import { PrismaClient } from '@prisma/client';
import { config } from '../config';
import { queueLogger } from '../utils/logger';
import { BroadcastRequest } from '../api/v1/broadcast/broadcast.schema';

// Initialize Redis connection for BullMQ
const redis = new Redis({
  host: config.redis.host,
  port: config.redis.port,
  password: config.redis.password,
  maxRetriesPerRequest: null, // Required for BullMQ
  lazyConnect: true,
});

// Initialize Prisma client
const prisma = new PrismaClient();

// Create notification queue
const notificationQueue = new Queue('notification', {
  connection: redis,
  defaultJobOptions: {
    removeOnComplete: 100, // Keep last 100 completed jobs
    removeOnFail: 50, // Keep last 50 failed jobs
    attempts: config.queue.defaultRetries,
    backoff: {
      type: 'exponential',
      delay: config.queue.defaultDelay,
    },
  },
});

export class NotificationProducer {
  private static instance: NotificationProducer;
  private queue: Queue;

  private constructor() {
    this.queue = notificationQueue;
    this.setupEventListeners();
  }

  /**
   * Get singleton instance
   */
  public static getInstance(): NotificationProducer {
    if (!NotificationProducer.instance) {
      NotificationProducer.instance = new NotificationProducer();
    }
    return NotificationProducer.instance;
  }

  /**
   * Create a broadcast job and add it to the queue
   */
  async createBroadcastJob(payload: BroadcastRequest): Promise<string> {
    const startTime = Date.now();
    
    try {
      const priority = this.getPriority(payload.options?.priority);
      const delay = this.calculateDelay(payload.options?.schedule);
      const jobOptions = this.buildJobOptions(payload, priority, delay);

      queueLogger.info('Creating broadcast job', {
        targetsCount: payload.targets.length,
        priority: payload.options?.priority || 'normal',
        scheduled: !!payload.options?.schedule,
        deduplication: !!payload.options?.deduplication,
      });

      // Add job to queue
      const job = await this.queue.add('broadcast', payload, jobOptions);

      // Update deduplication record with job ID if deduplication was used
      if (payload.options?.deduplication) {
        await this.updateDeduplicationJobId(payload.options.deduplication.key, job.id!);
      }

      const responseTime = Date.now() - startTime;
      queueLogger.info('Broadcast job created successfully', {
        jobId: job.id,
        priority,
        delay,
        responseTime,
      });

      return job.id!;
    } catch (error) {
      const responseTime = Date.now() - startTime;
      queueLogger.error('Error creating broadcast job', {
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        responseTime,
      });
      throw error;
    }
  }

  /**
   * Get job by ID
   */
  async getJob(jobId: string): Promise<Job | null> {
    try {
      return await this.queue.getJob(jobId);
    } catch (error) {
      queueLogger.error('Error getting job', {
        jobId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return null;
    }
  }

  /**
   * Get queue statistics
   */
  async getQueueStats() {
    try {
      const [waiting, active, completed, failed, delayed] = await Promise.all([
        this.queue.getWaiting(),
        this.queue.getActive(),
        this.queue.getCompleted(),
        this.queue.getFailed(),
        this.queue.getDelayed(),
      ]);

      return {
        waiting: waiting.length,
        active: active.length,
        completed: completed.length,
        failed: failed.length,
        delayed: delayed.length,
      };
    } catch (error) {
      queueLogger.error('Error getting queue stats', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return {
        waiting: 0,
        active: 0,
        completed: 0,
        failed: 0,
        delayed: 0,
      };
    }
  }

  /**
   * Close the queue connection
   */
  async close(): Promise<void> {
    try {
      await this.queue.close();
      await redis.quit();
      queueLogger.info('Queue connection closed');
    } catch (error) {
      queueLogger.error('Error closing queue connection', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Convert priority string to numeric value
   */
  private getPriority(priority?: string): number {
    switch (priority) {
      case 'high': return 10;
      case 'normal': return 5;
      case 'low': return 1;
      default: return 5;
    }
  }

  /**
   * Calculate delay in milliseconds for scheduled jobs
   */
  private calculateDelay(schedule?: { send_at: string }): number {
    if (!schedule) return 0;

    const scheduledTime = new Date(schedule.send_at);
    const now = new Date();
    const delay = scheduledTime.getTime() - now.getTime();

    return Math.max(0, delay); // Don't allow negative delays
  }

  /**
   * Build job options based on payload configuration
   */
  private buildJobOptions(payload: BroadcastRequest, priority: number, delay: number) {
    const retryConfig = payload.options?.retry_config;
    
    return {
      priority,
      delay,
      attempts: retryConfig?.max_attempts || config.queue.defaultRetries,
      backoff: {
        type: 'exponential' as const,
        delay: config.queue.defaultDelay,
        settings: {
          multiplier: retryConfig?.backoff_multiplier || config.queue.backoffMultiplier,
        },
      },
      removeOnComplete: 100,
      removeOnFail: 50,
      // Add job metadata
      jobId: `broadcast_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    };
  }

  /**
   * Update deduplication record with job ID
   */
  private async updateDeduplicationJobId(dedupKey: string, jobId: string): Promise<void> {
    try {
      await prisma.messageDeduplication.updateMany({
        where: { dedupKey },
        data: { jobId },
      });
      
      queueLogger.debug('Updated deduplication record with job ID', {
        dedupKey,
        jobId,
      });
    } catch (error) {
      queueLogger.warn('Error updating deduplication record', {
        dedupKey,
        jobId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      // Don't throw error as this is not critical for job processing
    }
  }

  /**
   * Setup event listeners for queue monitoring
   */
  private setupEventListeners(): void {
    (this.queue as any).on('completed', (job: any) => {
      queueLogger.info('Job completed', {
        jobId: job.id,
        duration: job.finishedOn ? job.finishedOn - job.processedOn! : 0,
      });
    });

    (this.queue as any).on('failed', (job: any, err: any) => {
      queueLogger.error('Job failed', {
        jobId: job?.id,
        error: err.message,
        attempts: job?.attemptsMade,
      });
    });

    (this.queue as any).on('stalled', (jobId: any) => {
      queueLogger.warn('Job stalled', { jobId });
    });

    this.queue.on('progress', (job, progress) => {
      queueLogger.debug('Job progress', {
        jobId: job.id,
        progress,
      });
    });

    queueLogger.info('Queue event listeners setup complete');
  }
}

// Export singleton instance
export const notificationProducer = NotificationProducer.getInstance();

export default NotificationProducer;
