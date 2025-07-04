import { Job } from 'bullmq';
import { workerLogger } from '../utils/logger';
import { databaseService } from '../services/db.service';
import { DispatcherService } from '../services/dispatcher.service';
import { BroadcastRequest } from '../api/v1/broadcast/broadcast.schema';
import { 
  ErrorType, 
  PostmasterError, 
  PlatformError, 
  RateLimitError, 
  ErrorUtils,
  ErrorFactory 
} from '../types/errors.types';

export class NotificationWorker {
  private dispatcher: DispatcherService;

  constructor() {
    this.dispatcher = new DispatcherService();
  }

  /**
   * Process a notification job with enhanced error handling
   */
  async processJob(job: Job<BroadcastRequest>): Promise<void> {
    const startTime = Date.now();
    const jobId = job.id!;
    const attempt = job.attemptsMade + 1;
    const maxAttempts = job.opts.attempts || 3;
    
    try {
      workerLogger.info('Processing notification job', {
        jobId,
        attempt,
        maxAttempts,
        targetsCount: job.data.targets.length,
        priority: job.opts.priority,
      });

      // Log job start
      await databaseService.createLogEntry({
        jobId,
        status: 'processing',
        payload: JSON.stringify(job.data),
        attemptCount: attempt,
      });

      // Update job progress
      await this.updateProgress(job, 10);

      // Dispatch the message to all platforms
      const dispatchResults = await this.dispatcher.dispatch(job.data);
      
      // Update job progress
      await this.updateProgress(job, 90);

      // Calculate response time
      const responseTime = Date.now() - startTime;

      // Analyze dispatch results
      const successCount = dispatchResults.filter(r => r.status === 'success').length;
      const failedCount = dispatchResults.filter(r => r.status === 'failed').length;
      
      // Determine final job status
      let finalStatus: string;
      let errorType: string | undefined;
      let errorMessage: string | undefined;

      if (successCount === dispatchResults.length) {
        // All platforms succeeded
        finalStatus = 'sent';
      } else if (successCount > 0) {
        // Partial success
        finalStatus = 'partial_success';
        errorMessage = `${failedCount} of ${dispatchResults.length} platforms failed`;
      } else {
        // All platforms failed
        finalStatus = 'failed';
        errorType = ErrorType.PLATFORM_DOWN;
        errorMessage = 'All platforms failed';
      }

      // Update job status
      await databaseService.updateLogStatus(
        jobId,
        finalStatus,
        errorType,
        errorMessage,
        responseTime
      );

      // Update job progress to complete
      await this.updateProgress(job, 100);

      workerLogger.info('Job completed', {
        jobId,
        finalStatus,
        responseTime,
        successCount,
        failedCount,
        attempt,
        dispatchResults: dispatchResults.map(r => ({
          platform: r.platform,
          status: r.status,
          responseTime: r.responseTime,
        })),
      });

      // If all platforms failed, throw error to trigger retry
      if (finalStatus === 'failed') {
        throw new PlatformError(
          errorMessage || 'All platforms failed',
          'multiple',
          undefined,
          true,
          ErrorType.PLATFORM_DOWN
        );
      }

    } catch (error) {
      const responseTime = Date.now() - startTime;
      
      // Enhanced error handling with new error types
      const processedError = this.processError(error, jobId, attempt, maxAttempts);
      
      workerLogger.error('Job processing failed', {
        jobId,
        error: processedError.message,
        errorType: processedError.errorType,
        retryable: processedError.retryable,
        attempt,
        maxAttempts,
        responseTime,
        context: ErrorUtils.extractContext(processedError),
      });

      // Update job status based on error analysis
      const jobStatus = this.determineJobStatus(processedError, attempt, maxAttempts);
      
      await databaseService.updateLogStatus(
        jobId,
        jobStatus,
        processedError.errorType,
        processedError.message,
        responseTime
      );

      // Handle different error scenarios
      await this.handleJobError(processedError, job, attempt, maxAttempts);
    }
  }

  /**
   * Process and categorize errors with enhanced logic
   */
  private processError(
    error: any, 
    jobId: string, 
    attempt: number, 
    maxAttempts: number
  ): PostmasterError {
    // If it's already a PostmasterError, return as-is
    if (error instanceof PostmasterError) {
      return error;
    }

    // Use ErrorFactory to create appropriate error type
    return ErrorFactory.fromError(error, undefined, {
      jobId,
      attempt,
      maxAttempts,
    });
  }

  /**
   * Determine job status based on error and attempt count
   */
  private determineJobStatus(
    error: PostmasterError, 
    attempt: number, 
    maxAttempts: number
  ): string {
    // Permanent failures should not be retried
    if (!error.retryable) {
      return 'failed';
    }

    // If we've reached max attempts, mark as failed
    if (attempt >= maxAttempts) {
      return 'failed';
    }

    // Rate limited jobs should be retried
    if (error.errorType === ErrorType.RATE_LIMITED) {
      return 'rate_limited';
    }

    // Other retryable errors
    return 'retry';
  }

  /**
   * Handle job errors with appropriate retry logic
   */
  private async handleJobError(
    error: PostmasterError,
    job: Job,
    attempt: number,
    maxAttempts: number
  ): Promise<void> {
    const jobId = job.id!;

    // Don't retry permanent failures
    if (!error.retryable) {
      workerLogger.warn('Job marked as permanent failure, will not retry', {
        jobId,
        errorType: error.errorType,
        attempt,
        maxAttempts,
      });
      return; // Don't throw error, job is done
    }

    // Don't retry if we've reached max attempts
    if (attempt >= maxAttempts) {
      workerLogger.warn('Job reached max attempts, marking as failed', {
        jobId,
        errorType: error.errorType,
        attempt,
        maxAttempts,
      });
      return; // Don't throw error, job is done
    }

    // Handle rate limiting with custom delay
    if (error instanceof RateLimitError) {
      workerLogger.info('Job rate limited, will retry after delay', {
        jobId,
        retryAfter: error.retryAfter,
        attempt,
        maxAttempts,
      });
      
      // Calculate delay for rate limited jobs
      const delay = error.retryAfter * 1000; // Convert to milliseconds
      
      // Throw error with custom delay for BullMQ to handle retry
      const retryError = new Error(`Rate limited, retry after ${error.retryAfter}s`);
      (retryError as any).delay = delay;
      throw retryError;
    }

    // For other retryable errors, calculate exponential backoff
    const retryDelay = ErrorUtils.getRetryDelay(error, attempt);
    
    workerLogger.info('Job will be retried with backoff', {
      jobId,
      errorType: error.errorType,
      attempt,
      maxAttempts,
      retryDelay,
    });

    // Throw error with calculated delay for BullMQ to handle retry
    const retryError = new Error(error.message);
    (retryError as any).delay = retryDelay;
    throw retryError;
  }

  /**
   * Update job progress (for future use)
   */
  async updateProgress(job: Job, progress: number): Promise<void> {
    try {
      await job.updateProgress(progress);
      workerLogger.debug('Job progress updated', {
        jobId: job.id,
        progress,
      });
    } catch (error) {
      workerLogger.warn('Failed to update job progress', {
        jobId: job.id,
        progress,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Close worker resources
   */
  async close(): Promise<void> {
    try {
      await this.dispatcher.close();
      await databaseService.disconnect();
      workerLogger.info('NotificationWorker resources closed');
    } catch (error) {
      workerLogger.error('Error closing NotificationWorker resources', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
}

export default NotificationWorker;
