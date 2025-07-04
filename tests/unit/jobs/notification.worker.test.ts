import { NotificationWorker } from '../../../src/jobs/notification.worker';
import { Job } from 'bullmq';
import { BroadcastRequest } from '../../../src/api/v1/broadcast/broadcast.schema';
import { PlatformError, ErrorType } from '../../../src/types/errors.types';

// Mock dependencies
jest.mock('../../../src/services/dispatcher.service');
jest.mock('../../../src/services/db.service');

describe('NotificationWorker', () => {
  let worker: NotificationWorker;
  let mockJob: Partial<Job<BroadcastRequest>>;
  let mockDispatcher: any;

  beforeEach(() => {
    worker = new NotificationWorker();
    mockDispatcher = {
      dispatch: jest.fn(),
      close: jest.fn(),
    };
    (worker as any).dispatcher = mockDispatcher;

    mockJob = {
      id: 'test-job-id',
      data: {
        message: {
          content: 'Test message',
        },
        targets: [
          {
            platform: 'slack',
            channels: ['#general'],
          },
        ],
      },
      attemptsMade: 0,
      opts: {
        attempts: 3,
      },
      updateProgress: jest.fn(),
    };
  });

  describe('processJob', () => {
    it('should process job successfully', async () => {
      mockDispatcher.dispatch.mockResolvedValue([
        { platform: 'slack', status: 'success', responseTime: 100 },
      ]);

      await expect(worker.processJob(mockJob as Job<BroadcastRequest>)).resolves.not.toThrow();

      expect(mockDispatcher.dispatch).toHaveBeenCalledWith(mockJob.data);
    });

    it('should handle partial success', async () => {
      mockDispatcher.dispatch.mockResolvedValue([
        { platform: 'slack', status: 'success', responseTime: 100 },
        { platform: 'discord', status: 'failed', error: 'Platform down' },
      ]);

      await expect(worker.processJob(mockJob as Job<BroadcastRequest>)).resolves.not.toThrow();
    });

    it('should throw error when all platforms fail', async () => {
      mockDispatcher.dispatch.mockResolvedValue([
        { platform: 'slack', status: 'failed', error: 'Platform down' },
        { platform: 'discord', status: 'failed', error: 'Platform down' },
      ]);

      await expect(worker.processJob(mockJob as Job<BroadcastRequest>)).rejects.toThrow(PlatformError);
    });

    it('should handle dispatcher errors', async () => {
      const error = new Error('Dispatcher failed');
      mockDispatcher.dispatch.mockRejectedValue(error);

      await expect(worker.processJob(mockJob as Job<BroadcastRequest>)).rejects.toThrow();
    });

    it('should handle rate limit errors', async () => {
      const rateLimitError = new PlatformError(
        'Rate limited',
        'slack',
        429,
        true,
        ErrorType.RATE_LIMITED
      );
      mockDispatcher.dispatch.mockRejectedValue(rateLimitError);

      await expect(worker.processJob(mockJob as Job<BroadcastRequest>)).rejects.toThrow();
    });

    it('should not retry permanent failures', async () => {
      const permanentError = new PlatformError(
        'Invalid webhook',
        'slack',
        400,
        false,
        ErrorType.PERMANENT_FAILURE
      );
      mockDispatcher.dispatch.mockRejectedValue(permanentError);

      await expect(worker.processJob(mockJob as Job<BroadcastRequest>)).resolves.not.toThrow();
    });
  });

  describe('processError', () => {
    it('should return PostmasterError as-is', () => {
      const error = new PlatformError('Test error', 'slack');
      const result = worker['processError'](error, 'job-id', 1, 3);

      expect(result).toBe(error);
    });

    it('should convert generic error to PostmasterError', () => {
      const error = new Error('Generic error');
      const result = worker['processError'](error, 'job-id', 1, 3);

      expect(result).toBeInstanceOf(Error);
      expect(result.message).toContain('Generic error');
    });
  });

  describe('determineJobStatus', () => {
    it('should return failed for non-retryable errors', () => {
      const error = new PlatformError('Test', 'slack', 400, false);
      const status = worker['determineJobStatus'](error, 1, 3);

      expect(status).toBe('failed');
    });

    it('should return failed when max attempts reached', () => {
      const error = new PlatformError('Test', 'slack', 500, true);
      const status = worker['determineJobStatus'](error, 3, 3);

      expect(status).toBe('failed');
    });

    it('should return rate_limited for rate limit errors', () => {
      const error = new PlatformError('Test', 'slack', 429, true, ErrorType.RATE_LIMITED);
      const status = worker['determineJobStatus'](error, 1, 3);

      expect(status).toBe('rate_limited');
    });

    it('should return retry for retryable errors', () => {
      const error = new PlatformError('Test', 'slack', 500, true);
      const status = worker['determineJobStatus'](error, 1, 3);

      expect(status).toBe('retry');
    });
  });

  describe('updateProgress', () => {
    it('should update job progress', async () => {
      await expect(worker.updateProgress(mockJob as Job, 50)).resolves.not.toThrow();

      expect(mockJob.updateProgress).toHaveBeenCalledWith(50);
    });

    it('should handle progress update errors gracefully', async () => {
      (mockJob.updateProgress as jest.Mock).mockRejectedValue(new Error('Update failed'));

      await expect(worker.updateProgress(mockJob as Job, 50)).resolves.not.toThrow();
    });
  });

  describe('close', () => {
    it('should close worker resources', async () => {
      await expect(worker.close()).resolves.not.toThrow();

      expect(mockDispatcher.close).toHaveBeenCalled();
    });

    it('should handle close errors gracefully', async () => {
      mockDispatcher.close.mockRejectedValue(new Error('Close failed'));

      await expect(worker.close()).resolves.not.toThrow();
    });
  });
});
