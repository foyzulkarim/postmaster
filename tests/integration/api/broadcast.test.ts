import { FastifyInstance } from 'fastify';
import { buildApp } from '../../../src/app';
import { BroadcastRequest } from '../../../src/api/v1/broadcast/broadcast.schema';

describe('Broadcast API Integration', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /api/v1/broadcast', () => {
    const validBroadcastRequest: BroadcastRequest = {
      message: {
        title: 'Test Notification',
        content: 'This is a test message for integration testing',
        format: 'plain',
      },
      targets: [
        {
          platform: 'slack',
          channels: ['#general'],
        },
      ],
      metadata: {
        source_app: 'test-suite',
        tags: ['integration-test'],
      },
    };

    it('should create broadcast job successfully with valid request', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/broadcast',
        headers: {
          'Authorization': 'Bearer test-api-key',
          'Content-Type': 'application/json',
        },
        payload: validBroadcastRequest,
      });

      expect(response.statusCode).toBe(200);
      
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.job_id).toBeDefined();
      expect(body.message).toContain('successfully');
      expect(body.targets_count).toBe(1);
    });

    it('should reject request without authentication', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/broadcast',
        headers: {
          'Content-Type': 'application/json',
        },
        payload: validBroadcastRequest,
      });

      expect(response.statusCode).toBe(401);
      
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('MISSING_AUTH');
    });

    it('should reject request with invalid API key', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/broadcast',
        headers: {
          'Authorization': 'Bearer invalid-key',
          'Content-Type': 'application/json',
        },
        payload: validBroadcastRequest,
      });

      expect(response.statusCode).toBe(401);
      
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('INVALID_API_KEY');
    });

    it('should reject request with missing message content', async () => {
      const invalidRequest = {
        ...validBroadcastRequest,
        message: {
          title: 'Test',
          // content is missing
        },
      };

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/broadcast',
        headers: {
          'Authorization': 'Bearer test-api-key',
          'Content-Type': 'application/json',
        },
        payload: invalidRequest,
      });

      expect(response.statusCode).toBe(400);
      
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should reject request with empty targets', async () => {
      const invalidRequest = {
        ...validBroadcastRequest,
        targets: [],
      };

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/broadcast',
        headers: {
          'Authorization': 'Bearer test-api-key',
          'Content-Type': 'application/json',
        },
        payload: invalidRequest,
      });

      expect(response.statusCode).toBe(400);
      
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should reject request with invalid platform', async () => {
      const invalidRequest = {
        ...validBroadcastRequest,
        targets: [
          {
            platform: 'invalid-platform' as any,
            channels: ['#general'],
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
        payload: invalidRequest,
      });

      expect(response.statusCode).toBe(400);
      
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should handle multiple platforms including Twitter', async () => {
      const multiPlatformRequest: BroadcastRequest = {
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
          {
            platform: 'twitter',
            channels: ['main'],
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
        payload: multiPlatformRequest,
      });

      expect(response.statusCode).toBe(200);
      
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.targets_count).toBe(4);
    });

    it('should handle scheduled messages', async () => {
      const scheduledRequest: BroadcastRequest = {
        message: {
          content: 'Scheduled test message',
        },
        targets: [
          {
            platform: 'slack',
            channels: ['#general'],
          },
        ],
        options: {
          schedule: {
            send_at: new Date(Date.now() + 60000).toISOString(), // 1 minute from now
          },
        },
      };

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/broadcast',
        headers: {
          'Authorization': 'Bearer test-api-key',
          'Content-Type': 'application/json',
        },
        payload: scheduledRequest,
      });

      expect(response.statusCode).toBe(200);
      
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.scheduled_for).toBeDefined();
    });

    it('should handle deduplication', async () => {
      const dedupRequest: BroadcastRequest = {
        message: {
          content: 'Deduplication test message',
        },
        targets: [
          {
            platform: 'slack',
            channels: ['#general'],
          },
        ],
        options: {
          deduplication: {
            key: 'test-dedup-key',
            window_seconds: 3600,
          },
        },
      };

      // Send first request
      const response1 = await app.inject({
        method: 'POST',
        url: '/api/v1/broadcast',
        headers: {
          'Authorization': 'Bearer test-api-key',
          'Content-Type': 'application/json',
        },
        payload: dedupRequest,
      });

      expect(response1.statusCode).toBe(200);
      
      const body1 = JSON.parse(response1.body);
      expect(body1.success).toBe(true);
      expect(body1.deduplication_applied).toBe(false);

      // Send duplicate request
      const response2 = await app.inject({
        method: 'POST',
        url: '/api/v1/broadcast',
        headers: {
          'Authorization': 'Bearer test-api-key',
          'Content-Type': 'application/json',
        },
        payload: dedupRequest,
      });

      expect(response2.statusCode).toBe(200);
      
      const body2 = JSON.parse(response2.body);
      expect(body2.success).toBe(true);
      expect(body2.deduplication_applied).toBe(true);
    });

    it('should handle priority settings', async () => {
      const highPriorityRequest: BroadcastRequest = {
        message: {
          content: 'High priority test message',
        },
        targets: [
          {
            platform: 'slack',
            channels: ['#general'],
          },
        ],
        options: {
          priority: 'high',
        },
      };

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/broadcast',
        headers: {
          'Authorization': 'Bearer test-api-key',
          'Content-Type': 'application/json',
        },
        payload: highPriorityRequest,
      });

      expect(response.statusCode).toBe(200);
      
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
    });

    it('should handle custom retry configuration', async () => {
      const customRetryRequest: BroadcastRequest = {
        message: {
          content: 'Custom retry test message',
        },
        targets: [
          {
            platform: 'slack',
            channels: ['#general'],
          },
        ],
        options: {
          retry_config: {
            max_attempts: 5,
            backoff_multiplier: 3,
          },
        },
      };

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/broadcast',
        headers: {
          'Authorization': 'Bearer test-api-key',
          'Content-Type': 'application/json',
        },
        payload: customRetryRequest,
      });

      expect(response.statusCode).toBe(200);
      
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
    });

    it('should handle format overrides', async () => {
      const formatOverrideRequest: BroadcastRequest = {
        message: {
          content: '**Bold text** and *italic text*',
          format: 'markdown',
        },
        targets: [
          {
            platform: 'slack',
            channels: ['#general'],
            format_override: 'plain',
          },
          {
            platform: 'discord',
            channels: ['general'],
            // Uses message format (markdown)
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
        payload: formatOverrideRequest,
      });

      expect(response.statusCode).toBe(200);
      
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.targets_count).toBe(2);
    });
  });
});
