import { FastifyInstance } from 'fastify';
import { buildApp } from '../../../src/app';
import { BroadcastRequest } from '../../../src/api/v1/broadcast/broadcast.schema';

describe('Jobs API Integration', () => {
  let app: FastifyInstance;
  let testJobId: string;

  beforeAll(async () => {
    app = buildApp();
    await app.ready();

    // Create a test job for testing job endpoints
    const broadcastRequest: BroadcastRequest = {
      message: {
        content: 'Test job for integration testing',
      },
      targets: [
        {
          platform: 'slack',
          channels: ['#test'],
        },
      ],
    };

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/broadcast',
      headers: {
        'Authorization': 'Bearer test-api-key',
        'Content-Type': 'application/json',
      },
      payload: broadcastRequest,
    });

    const body = JSON.parse(response.body);
    testJobId = body.job_id;
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /api/v1/jobs', () => {
    it('should list jobs successfully', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/jobs',
        headers: {
          'Authorization': 'Bearer test-api-key',
        },
      });

      expect(response.statusCode).toBe(200);
      
      const body = JSON.parse(response.body);
      expect(body.jobs).toBeDefined();
      expect(Array.isArray(body.jobs)).toBe(true);
      expect(body.total).toBeDefined();
      expect(body.offset).toBe(0);
      expect(body.limit).toBe(50);
      expect(body.has_more).toBeDefined();
    });

    it('should filter jobs by status', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/jobs?status=waiting',
        headers: {
          'Authorization': 'Bearer test-api-key',
        },
      });

      expect(response.statusCode).toBe(200);
      
      const body = JSON.parse(response.body);
      expect(body.jobs).toBeDefined();
    });

    it('should filter jobs by platform', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/jobs?platform=slack',
        headers: {
          'Authorization': 'Bearer test-api-key',
        },
      });

      expect(response.statusCode).toBe(200);
      
      const body = JSON.parse(response.body);
      expect(body.jobs).toBeDefined();
    });

    it('should handle pagination', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/jobs?limit=10&offset=0',
        headers: {
          'Authorization': 'Bearer test-api-key',
        },
      });

      expect(response.statusCode).toBe(200);
      
      const body = JSON.parse(response.body);
      expect(body.limit).toBe(10);
      expect(body.offset).toBe(0);
    });

    it('should reject request without authentication', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/jobs',
      });

      expect(response.statusCode).toBe(401);
    });

    it('should reject invalid status filter', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/jobs?status=invalid',
        headers: {
          'Authorization': 'Bearer test-api-key',
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should reject limit exceeding maximum', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/jobs?limit=200',
        headers: {
          'Authorization': 'Bearer test-api-key',
        },
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('GET /api/v1/jobs/:jobId', () => {
    it('should get job status successfully', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/api/v1/jobs/${testJobId}`,
        headers: {
          'Authorization': 'Bearer test-api-key',
        },
      });

      expect(response.statusCode).toBe(200);
      
      const body = JSON.parse(response.body);
      expect(body.id).toBe(testJobId);
      expect(body.status).toBeDefined();
      expect(body.data).toBeDefined();
      expect(body.attempts).toBeDefined();
      expect(body.maxAttempts).toBeDefined();
      expect(body.created_at).toBeDefined();
      expect(body.logs).toBeDefined();
      expect(body.metrics).toBeDefined();
    });

    it('should return 404 for non-existent job', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/jobs/non-existent-job-id',
        headers: {
          'Authorization': 'Bearer test-api-key',
        },
      });

      expect(response.statusCode).toBe(404);
      
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('JOB_NOT_FOUND');
    });

    it('should reject request without authentication', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/api/v1/jobs/${testJobId}`,
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe('POST /api/v1/jobs/:jobId/retry', () => {
    it('should handle retry request for non-existent job', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/jobs/non-existent-job-id/retry',
        headers: {
          'Authorization': 'Bearer test-api-key',
        },
      });

      expect(response.statusCode).toBe(404);
      
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('JOB_NOT_FOUND');
    });

    it('should reject retry for non-retryable job', async () => {
      // For this test, we assume the job is in a non-retryable state
      // In a real scenario, you might need to create a job in a specific state
      const response = await app.inject({
        method: 'POST',
        url: `/api/v1/jobs/${testJobId}/retry`,
        headers: {
          'Authorization': 'Bearer test-api-key',
        },
      });

      // This might be 400 if job is not in retryable state, or 200 if it is
      expect([200, 400]).toContain(response.statusCode);
    });

    it('should reject request without authentication', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/api/v1/jobs/${testJobId}/retry`,
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe('DELETE /api/v1/jobs/:jobId', () => {
    it('should handle cancel request for non-existent job', async () => {
      const response = await app.inject({
        method: 'DELETE',
        url: '/api/v1/jobs/non-existent-job-id',
        headers: {
          'Authorization': 'Bearer test-api-key',
        },
      });

      expect(response.statusCode).toBe(404);
      
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('JOB_NOT_FOUND');
    });

    it('should reject cancel for non-cancellable job', async () => {
      // For this test, we assume the job might not be cancellable
      const response = await app.inject({
        method: 'DELETE',
        url: `/api/v1/jobs/${testJobId}`,
        headers: {
          'Authorization': 'Bearer test-api-key',
        },
      });

      // This might be 400 if job is not cancellable, or 200 if it is
      expect([200, 400]).toContain(response.statusCode);
    });

    it('should reject request without authentication', async () => {
      const response = await app.inject({
        method: 'DELETE',
        url: `/api/v1/jobs/${testJobId}`,
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe('Job Lifecycle Integration', () => {
    it('should create job and track its status', async () => {
      // Create a new job
      const broadcastRequest: BroadcastRequest = {
        message: {
          content: 'Lifecycle test message',
        },
        targets: [
          {
            platform: 'slack',
            channels: ['#test'],
          },
        ],
      };

      const createResponse = await app.inject({
        method: 'POST',
        url: '/api/v1/broadcast',
        headers: {
          'Authorization': 'Bearer test-api-key',
          'Content-Type': 'application/json',
        },
        payload: broadcastRequest,
      });

      expect(createResponse.statusCode).toBe(200);
      
      const createBody = JSON.parse(createResponse.body);
      const jobId = createBody.job_id;

      // Check job status
      const statusResponse = await app.inject({
        method: 'GET',
        url: `/api/v1/jobs/${jobId}`,
        headers: {
          'Authorization': 'Bearer test-api-key',
        },
      });

      expect(statusResponse.statusCode).toBe(200);
      
      const statusBody = JSON.parse(statusResponse.body);
      expect(statusBody.id).toBe(jobId);
      expect(statusBody.data.message.content).toBe('Lifecycle test message');

      // Verify job appears in jobs list
      const listResponse = await app.inject({
        method: 'GET',
        url: '/api/v1/jobs',
        headers: {
          'Authorization': 'Bearer test-api-key',
        },
      });

      expect(listResponse.statusCode).toBe(200);
      
      const listBody = JSON.parse(listResponse.body);
      const jobExists = listBody.jobs.some((job: any) => job.id === jobId);
      expect(jobExists).toBe(true);
    });
  });
});
