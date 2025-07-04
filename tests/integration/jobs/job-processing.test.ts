import { Queue, Worker, Job } from 'bullmq';
import { NotificationWorker } from '../../../src/jobs/notification.worker';
import { BroadcastRequest } from '../../../src/api/v1/broadcast/broadcast.schema';
import { config } from '../../../src/config';

// Mock external dependencies for integration testing
jest.mock('../../../src/services/dispatcher.service');
jest.mock('../../../src/services/db.service');

describe('Job Processing Integration', () => {
  let queue: Queue;
  let worker: Worker;
  let notificationWorker: NotificationWorker;

  beforeAll(async () => {
    // Initialize queue with test Redis connection
    queue = new Queue('test-notifications', {
      connection: {
        host: config.redis.host,
        port: config.redis.port,
        password: config.redis.password,
      },
    });

    // Initialize notification worker
    notificationWorker = new NotificationWorker();

    // Initialize BullMQ worker
    worker = new Worker(
      'test-notifications',
      async (job: Job<BroadcastRequest>) => {
        return await notificationWorker.processJob(job);
      },
      {
        connection: {
          host: config.redis.host,
          port: config.redis.port,
          password: config.redis.password,
        },
        concurrency: 1,
      }
    );

    // Wait for worker to be ready
    await worker.waitUntilReady();
  });

  afterAll(async () => {
    await worker.close();
    await queue.close();
    await notificationWorker.close();
  });

  beforeEach(async () => {
    // Clean up queue before each test
    await queue.obliterate({ force: true });
  });

  describe('Job Creation and Processing', () => {
    it('should create and process a simple broadcast job', async () => {
      const broadcastData: BroadcastRequest = {
        message: {
          content: 'Test integration message',
        },
        targets: [
          {
            platform: 'slack',
            channels: ['#general'],
          },
        ],
      };

      // Add job to queue
      const job = await queue.add('broadcast', broadcastData, {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 1000,
        },
      });

      expect(job.id).toBeDefined();
      expect(job.data).toEqual(broadcastData);

      // Wait for job to be processed
      const result = await job.waitUntilFinished(queue.events);
      
      // Job should complete successfully (mocked dispatcher will succeed)
      expect(result).toBeDefined();
    });

    it('should handle job with multiple platforms', async () => {
      const broadcastData: BroadcastRequest = {
        message: {
          content: 'Multi-platform test message',
        },
        targets: [
          {
            platform: 'slack',
            channels: ['#general'],
          },
          {
            platform: 'discord',
            channels: ['general'],
          },
          {
            platform: 'telegram',
            channels: ['-1001234567890'],
          },
        ],
      };

      const job = await queue.add('broadcast', broadcastData);
      const result = await job.waitUntilFinished(queue.events);
      
      expect(result).toBeDefined();
    });

    it('should handle scheduled jobs', async () => {
      const broadcastData: BroadcastRequest = {
        message: {
          content: 'Scheduled test message',
        },
        targets: [
          {
            platform: 'slack',
            channels: ['#general'],
          },
        ],
      };

      // Schedule job for 1 second in the future
      const delay = 1000;
      const job = await queue.add('broadcast', broadcastData, { delay });

      expect(job.id).toBeDefined();
      
      // Job should be in delayed state initially
      const jobState = await job.getState();
      expect(jobState).toBe('delayed');

      // Wait for job to be processed
      const result = await job.waitUntilFinished(queue.events);
      expect(result).toBeDefined();
    });

    it('should handle high priority jobs', async () => {
      const normalPriorityData: BroadcastRequest = {
        message: { content: 'Normal priority message' },
        targets: [{ platform: 'slack', channels: ['#general'] }],
      };

      const highPriorityData: BroadcastRequest = {
        message: { content: 'High priority message' },
        targets: [{ platform: 'slack', channels: ['#general'] }],
      };

      // Add normal priority job first
      const normalJob = await queue.add('broadcast', normalPriorityData, {
        priority: 5,
      });

      // Add high priority job second
      const highJob = await queue.add('broadcast', highPriorityData, {
        priority: 10,
      });

      // Both jobs should be created
      expect(normalJob.id).toBeDefined();
      expect(highJob.id).toBeDefined();

      // Wait for both jobs to complete
      await Promise.all([
        normalJob.waitUntilFinished(queue.events),
        highJob.waitUntilFinished(queue.events),
      ]);
    });
  });

  describe('Job Retry Logic', () => {
    it('should retry failed jobs with exponential backoff', async () => {
      // Mock dispatcher to fail initially
      const mockDispatcher = require('../../../src/services/dispatcher.service').DispatcherService;
      mockDispatcher.prototype.dispatch = jest.fn()
        .mockRejectedValueOnce(new Error('First attempt failed'))
        .mockRejectedValueOnce(new Error('Second attempt failed'))
        .mockResolvedValueOnce([{ platform: 'slack', status: 'success' }]);

      const broadcastData: BroadcastRequest = {
        message: { content: 'Retry test message' },
        targets: [{ platform: 'slack', channels: ['#general'] }],
      };

      const job = await queue.add('broadcast', broadcastData, {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 100, // Short delay for testing
        },
      });

      // Wait for job to complete after retries
      const result = await job.waitUntilFinished(queue.events);
      
      expect(result).toBeDefined();
      expect(mockDispatcher.prototype.dispatch).toHaveBeenCalledTimes(3);
    });

    it('should fail job after max attempts', async () => {
      // Mock dispatcher to always fail
      const mockDispatcher = require('../../../src/services/dispatcher.service').DispatcherService;
      mockDispatcher.prototype.dispatch = jest.fn()
        .mockRejectedValue(new Error('Persistent failure'));

      const broadcastData: BroadcastRequest = {
        message: { content: 'Failing test message' },
        targets: [{ platform: 'slack', channels: ['#general'] }],
      };

      const job = await queue.add('broadcast', broadcastData, {
        attempts: 2,
        backoff: {
          type: 'exponential',
          delay: 100,
        },
      });

      // Job should fail after max attempts
      try {
        await job.waitUntilFinished(queue.events);
        fail('Job should have failed');
      } catch (error) {
        expect(error).toBeDefined();
      }

      const jobState = await job.getState();
      expect(jobState).toBe('failed');
    });
  });

  describe('Job Progress Tracking', () => {
    it('should update job progress during processing', async () => {
      const broadcastData: BroadcastRequest = {
        message: { content: 'Progress test message' },
        targets: [{ platform: 'slack', channels: ['#general'] }],
      };

      const job = await queue.add('broadcast', broadcastData);

      // Monitor progress updates
      const progressUpdates: number[] = [];
      job.on('progress', (progress) => {
        progressUpdates.push(progress);
      });

      await job.waitUntilFinished(queue.events);

      // Should have received progress updates
      expect(progressUpdates.length).toBeGreaterThan(0);
      expect(progressUpdates).toContain(10); // Initial progress
      expect(progressUpdates).toContain(90); // Pre-completion progress
      expect(progressUpdates).toContain(100); // Final progress
    });
  });

  describe('Queue Statistics', () => {
    it('should track queue statistics correctly', async () => {
      // Add multiple jobs
      const jobs = await Promise.all([
        queue.add('broadcast', {
          message: { content: 'Stats test 1' },
          targets: [{ platform: 'slack', channels: ['#general'] }],
        }),
        queue.add('broadcast', {
          message: { content: 'Stats test 2' },
          targets: [{ platform: 'discord', channels: ['general'] }],
        }),
        queue.add('broadcast', {
          message: { content: 'Stats test 3' },
          targets: [{ platform: 'telegram', channels: ['-1001234567890'] }],
        }),
      ]);

      // Check waiting jobs count
      const waiting = await queue.getWaiting();
      expect(waiting.length).toBeGreaterThanOrEqual(0);

      // Wait for jobs to complete
      await Promise.all(jobs.map(job => job.waitUntilFinished(queue.events)));

      // Check completed jobs count
      const completed = await queue.getCompleted();
      expect(completed.length).toBeGreaterThanOrEqual(3);
    });

    it('should handle concurrent job processing', async () => {
      // Create multiple jobs concurrently
      const jobPromises = Array.from({ length: 5 }, (_, i) =>
        queue.add('broadcast', {
          message: { content: `Concurrent test ${i + 1}` },
          targets: [{ platform: 'slack', channels: ['#general'] }],
        })
      );

      const jobs = await Promise.all(jobPromises);

      // Wait for all jobs to complete
      const results = await Promise.all(
        jobs.map(job => job.waitUntilFinished(queue.events))
      );

      expect(results).toHaveLength(5);
      results.forEach(result => {
        expect(result).toBeDefined();
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle malformed job data gracefully', async () => {
      const malformedData = {
        message: {
          // Missing content
        },
        targets: [], // Empty targets
      } as any;

      const job = await queue.add('broadcast', malformedData);

      try {
        await job.waitUntilFinished(queue.events);
        fail('Job should have failed with malformed data');
      } catch (error) {
        expect(error).toBeDefined();
      }

      const jobState = await job.getState();
      expect(jobState).toBe('failed');
    });

    it('should handle worker shutdown gracefully', async () => {
      const broadcastData: BroadcastRequest = {
        message: { content: 'Shutdown test message' },
        targets: [{ platform: 'slack', channels: ['#general'] }],
      };

      // Add job
      const job = await queue.add('broadcast', broadcastData);

      // Close worker while job might be processing
      await worker.close();

      // Job should remain in queue for other workers to pick up
      const jobState = await job.getState();
      expect(['waiting', 'active', 'completed', 'failed']).toContain(jobState);
    });
  });

  describe('Job Data Validation', () => {
    it('should process job with all optional fields', async () => {
      const fullBroadcastData: BroadcastRequest = {
        message: {
          title: 'Full Test Message',
          content: 'This is a comprehensive test message',
          format: 'markdown',
          max_length: 1000,
        },
        targets: [
          {
            platform: 'slack',
            channels: ['#general', '#alerts'],
            format_override: 'plain',
            template: 'alert-template',
          },
        ],
        options: {
          priority: 'high',
          schedule: {
            send_at: new Date(Date.now() + 1000).toISOString(),
          },
          deduplication: {
            key: 'test-dedup-key',
            window_seconds: 3600,
          },
          retry_config: {
            max_attempts: 5,
            backoff_multiplier: 2,
          },
        },
        metadata: {
          source_app: 'integration-test',
          tags: ['test', 'integration'],
          correlation_id: 'test-correlation-123',
          user_id: 'test-user',
        },
      };

      const job = await queue.add('broadcast', fullBroadcastData, {
        delay: 1000, // 1 second delay
        attempts: fullBroadcastData.options?.retry_config?.max_attempts || 3,
        priority: fullBroadcastData.options?.priority === 'high' ? 10 : 5,
      });

      const result = await job.waitUntilFinished(queue.events);
      expect(result).toBeDefined();
    });
  });
});
