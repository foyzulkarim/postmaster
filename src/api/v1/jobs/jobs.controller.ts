import { FastifyRequest, FastifyReply } from 'fastify';
import { Queue, Job } from 'bullmq';
import { databaseService } from '../../../services/db.service';
import { ValidationError, ErrorUtils } from '../../../types/errors.types';
import { apiLogger } from '../../../utils/logger';
import { config } from '../../../config';
import Redis from 'ioredis';

export interface JobStatusParams {
  jobId: string;
}

export interface JobsListQuery {
  status?: 'waiting' | 'active' | 'completed' | 'failed' | 'delayed';
  limit?: number;
  offset?: number;
  platform?: string;
}

export interface JobRetryParams {
  jobId: string;
}

export interface JobStatus {
  id: string;
  status: string;
  progress?: number;
  data: any;
  attempts: number;
  maxAttempts: number;
  created_at: string;
  processed_at?: string;
  finished_at?: string;
  failed_at?: string;
  error?: string;
  logs: JobLogEntry[];
  metrics: {
    response_time?: number;
    platforms_attempted: number;
    platforms_successful: number;
    platforms_failed: number;
  };
}

export interface JobLogEntry {
  id: number;
  target?: string;
  platform?: string;
  status: string;
  error?: string;
  response_time?: number;
  attempt_count: number;
  created_at: string;
}

export interface JobsList {
  jobs: JobSummary[];
  total: number;
  offset: number;
  limit: number;
  has_more: boolean;
}

export interface JobSummary {
  id: string;
  status: string;
  created_at: string;
  finished_at?: string;
  targets_count: number;
  platforms: string[];
  attempts: number;
  max_attempts: number;
}

export class JobsController {
  private queue: Queue;
  private redis: Redis;

  constructor() {
    // Initialize Redis connection
    this.redis = new Redis({
      host: config.redis.host,
      port: config.redis.port,
      password: config.redis.password,
    });

    // Initialize BullMQ queue
    this.queue = new Queue('notifications', {
      connection: {
        host: config.redis.host,
        port: config.redis.port,
        password: config.redis.password,
      },
    });
  }

  /**
   * Get job status and details
   */
  async getJobStatus(
    request: FastifyRequest<{ Params: JobStatusParams }>,
    reply: FastifyReply
  ): Promise<JobStatus> {
    const { jobId } = request.params;

    try {
      apiLogger.info('Getting job status', { jobId });

      // Get job from queue
      const job = await this.queue.getJob(jobId);
      
      if (!job) {
        return reply.status(404).send({
          success: false,
          error: {
            code: 'JOB_NOT_FOUND',
            message: `Job ${jobId} not found`,
          },
        });
      }

      // Get job logs from database
      const logs = await databaseService.getJobLogs(jobId);

      // Build job status response
      const jobStatus = await this.buildJobStatus(job, logs);

      apiLogger.debug('Job status retrieved', {
        jobId,
        status: jobStatus.status,
        attempts: jobStatus.attempts,
      });

      return jobStatus;

    } catch (error) {
      apiLogger.error('Error getting job status', {
        jobId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      return reply.status(500).send(ErrorUtils.formatForApi(error));
    }
  }

  /**
   * Retry a failed job
   */
  async retryJob(
    request: FastifyRequest<{ Params: JobRetryParams }>,
    reply: FastifyReply
  ): Promise<{ success: boolean; message: string }> {
    const { jobId } = request.params;

    try {
      apiLogger.info('Retrying job', { jobId });

      // Get job from queue
      const job = await this.queue.getJob(jobId);
      
      if (!job) {
        return reply.status(404).send({
          success: false,
          error: {
            code: 'JOB_NOT_FOUND',
            message: `Job ${jobId} not found`,
          },
        });
      }

      // Check if job can be retried
      const jobState = await job.getState();
      
      if (!['failed', 'completed'].includes(jobState)) {
        return reply.status(400).send({
          success: false,
          error: {
            code: 'JOB_NOT_RETRYABLE',
            message: `Job ${jobId} is in state '${jobState}' and cannot be retried`,
          },
        });
      }

      // Retry the job
      await job.retry();

      // Log the retry action
      await databaseService.createLogEntry({
        jobId,
        status: 'retrying',
        payload: JSON.stringify({ action: 'manual_retry' }),
        attemptCount: job.attemptsMade + 1,
      });

      apiLogger.info('Job retry initiated', {
        jobId,
        previousState: jobState,
        newAttempt: job.attemptsMade + 1,
      });

      return {
        success: true,
        message: `Job ${jobId} has been queued for retry`,
      };

    } catch (error) {
      apiLogger.error('Error retrying job', {
        jobId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      return reply.status(500).send(ErrorUtils.formatForApi(error));
    }
  }

  /**
   * Get list of jobs with filtering and pagination
   */
  async getJobsList(
    request: FastifyRequest<{ Querystring: JobsListQuery }>,
    reply: FastifyReply
  ): Promise<JobsList> {
    const { 
      status, 
      limit = 50, 
      offset = 0, 
      platform 
    } = request.query;

    try {
      // Validate query parameters
      if (limit > 100) {
        throw new ValidationError('Limit cannot exceed 100');
      }

      apiLogger.debug('Getting jobs list', {
        status,
        limit,
        offset,
        platform,
      });

      let jobs: Job[] = [];

      // Get jobs based on status filter
      if (status) {
        jobs = await this.getJobsByStatus(status, offset, limit);
      } else {
        // Get jobs from all states
        const allJobs = await Promise.all([
          this.queue.getWaiting(0, limit),
          this.queue.getActive(0, limit),
          this.queue.getCompleted(0, limit),
          this.queue.getFailed(0, limit),
          this.queue.getDelayed(0, limit),
        ]);
        
        jobs = allJobs.flat().slice(offset, offset + limit);
      }

      // Filter by platform if specified
      if (platform) {
        jobs = jobs.filter(job => {
          const targets = job.data?.targets || [];
          return targets.some((target: any) => target.platform === platform);
        });
      }

      // Build job summaries
      const jobSummaries = await Promise.all(
        jobs.map(job => this.buildJobSummary(job))
      );

      const result: JobsList = {
        jobs: jobSummaries,
        total: jobSummaries.length,
        offset,
        limit,
        has_more: jobSummaries.length === limit,
      };

      apiLogger.debug('Jobs list retrieved', {
        count: result.jobs.length,
        total: result.total,
        hasMore: result.has_more,
      });

      return result;

    } catch (error) {
      apiLogger.error('Error getting jobs list', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      return reply.status(500).send(ErrorUtils.formatForApi(error));
    }
  }

  /**
   * Cancel a job
   */
  async cancelJob(
    request: FastifyRequest<{ Params: JobRetryParams }>,
    reply: FastifyReply
  ): Promise<{ success: boolean; message: string }> {
    const { jobId } = request.params;

    try {
      apiLogger.info('Cancelling job', { jobId });

      // Get job from queue
      const job = await this.queue.getJob(jobId);
      
      if (!job) {
        return reply.status(404).send({
          success: false,
          error: {
            code: 'JOB_NOT_FOUND',
            message: `Job ${jobId} not found`,
          },
        });
      }

      // Check if job can be cancelled
      const jobState = await job.getState();
      
      if (['completed', 'failed'].includes(jobState)) {
        return reply.status(400).send({
          success: false,
          error: {
            code: 'JOB_NOT_CANCELLABLE',
            message: `Job ${jobId} is in state '${jobState}' and cannot be cancelled`,
          },
        });
      }

      // Cancel the job
      await job.remove();

      // Log the cancellation
      await databaseService.createLogEntry({
        jobId,
        status: 'cancelled',
        payload: JSON.stringify({ action: 'manual_cancellation' }),
        attemptCount: job.attemptsMade,
      });

      apiLogger.info('Job cancelled', {
        jobId,
        previousState: jobState,
      });

      return {
        success: true,
        message: `Job ${jobId} has been cancelled`,
      };

    } catch (error) {
      apiLogger.error('Error cancelling job', {
        jobId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      return reply.status(500).send(ErrorUtils.formatForApi(error));
    }
  }

  /**
   * Get jobs by status
   */
  private async getJobsByStatus(
    status: string,
    offset: number,
    limit: number
  ): Promise<Job[]> {
    switch (status) {
      case 'waiting':
        return await this.queue.getWaiting(offset, offset + limit - 1);
      case 'active':
        return await this.queue.getActive(offset, offset + limit - 1);
      case 'completed':
        return await this.queue.getCompleted(offset, offset + limit - 1);
      case 'failed':
        return await this.queue.getFailed(offset, offset + limit - 1);
      case 'delayed':
        return await this.queue.getDelayed(offset, offset + limit - 1);
      default:
        throw new ValidationError(`Invalid status: ${status}`);
    }
  }

  /**
   * Build detailed job status
   */
  private async buildJobStatus(job: Job, logs: any[]): Promise<JobStatus> {
    const jobState = await job.getState();
    
    // Calculate metrics
    const platformsAttempted = new Set(logs.map(log => log.target?.platform).filter(Boolean)).size;
    const platformsSuccessful = new Set(
      logs.filter(log => log.status === 'sent').map(log => log.target?.platform)
    ).size;
    const platformsFailed = new Set(
      logs.filter(log => log.status === 'failed').map(log => log.target?.platform)
    ).size;

    const avgResponseTime = logs.length > 0 
      ? logs.reduce((sum, log) => sum + (log.responseTime || 0), 0) / logs.length 
      : undefined;

    return {
      id: job.id!,
      status: jobState,
      progress: job.progress,
      data: job.data,
      attempts: job.attemptsMade,
      maxAttempts: job.opts.attempts || 3,
      created_at: new Date(job.timestamp).toISOString(),
      processed_at: job.processedOn ? new Date(job.processedOn).toISOString() : undefined,
      finished_at: job.finishedOn ? new Date(job.finishedOn).toISOString() : undefined,
      failed_at: job.failedReason ? new Date(job.finishedOn || Date.now()).toISOString() : undefined,
      error: job.failedReason,
      logs: logs.map(log => ({
        id: log.id,
        target: log.target?.name,
        platform: log.target?.platform,
        status: log.status,
        error: log.errorMessage,
        response_time: log.responseTime,
        attempt_count: log.attemptCount,
        created_at: log.createdAt.toISOString(),
      })),
      metrics: {
        response_time: avgResponseTime,
        platforms_attempted: platformsAttempted,
        platforms_successful: platformsSuccessful,
        platforms_failed: platformsFailed,
      },
    };
  }

  /**
   * Build job summary
   */
  private async buildJobSummary(job: Job): Promise<JobSummary> {
    const jobState = await job.getState();
    const targets = job.data?.targets || [];
    const platforms = [...new Set(targets.map((t: any) => t.platform))];

    return {
      id: job.id!,
      status: jobState,
      created_at: new Date(job.timestamp).toISOString(),
      finished_at: job.finishedOn ? new Date(job.finishedOn).toISOString() : undefined,
      targets_count: targets.length,
      platforms,
      attempts: job.attemptsMade,
      max_attempts: job.opts.attempts || 3,
    };
  }

  /**
   * Close controller resources
   */
  async close(): Promise<void> {
    try {
      await this.queue.close();
      await this.redis.quit();
      apiLogger.info('JobsController resources closed');
    } catch (error) {
      apiLogger.error('Error closing JobsController resources', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
}

export default JobsController;
