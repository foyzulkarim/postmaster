import { FastifyInstance } from 'fastify';
import { buildApp } from '../../../src/app';

describe('Health API Integration', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /api/v1/health', () => {
    it('should return comprehensive health status', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/health',
      });

      // Health endpoint should be accessible without authentication
      expect([200, 503]).toContain(response.statusCode);
      
      const body = JSON.parse(response.body);
      
      // Basic structure validation
      expect(body.status).toBeDefined();
      expect(['healthy', 'unhealthy', 'degraded']).toContain(body.status);
      expect(body.timestamp).toBeDefined();
      expect(body.uptime).toBeDefined();
      expect(body.version).toBeDefined();
      expect(body.environment).toBeDefined();
      
      // Services health checks
      expect(body.services).toBeDefined();
      expect(body.services.database).toBeDefined();
      expect(body.services.redis).toBeDefined();
      expect(body.services.queue).toBeDefined();
      expect(body.services.rateLimiter).toBeDefined();
      expect(body.services.platforms).toBeDefined();
      
      // Each service should have healthy boolean
      Object.values(body.services).forEach((service: any) => {
        expect(typeof service.healthy).toBe('boolean');
        if (service.response_time) {
          expect(typeof service.response_time).toBe('number');
        }
      });
      
      // Metrics validation
      expect(body.metrics).toBeDefined();
      expect(body.metrics.memory).toBeDefined();
      expect(body.metrics.uptime).toBeDefined();
      expect(body.metrics.queue).toBeDefined();
      expect(body.metrics.database).toBeDefined();
      expect(body.metrics.timestamp).toBeDefined();
    });

    it('should return valid timestamp format', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/health',
      });

      const body = JSON.parse(response.body);
      
      // Validate ISO 8601 timestamp format
      expect(body.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
      expect(body.metrics.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
      
      // Timestamps should be recent (within last minute)
      const now = new Date();
      const healthTimestamp = new Date(body.timestamp);
      const timeDiff = now.getTime() - healthTimestamp.getTime();
      expect(timeDiff).toBeLessThan(60000); // Less than 1 minute
    });

    it('should return valid memory metrics', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/health',
      });

      const body = JSON.parse(response.body);
      const memory = body.metrics.memory;
      
      expect(typeof memory.rss).toBe('number');
      expect(typeof memory.heapTotal).toBe('number');
      expect(typeof memory.heapUsed).toBe('number');
      expect(typeof memory.external).toBe('number');
      
      // Memory values should be positive
      expect(memory.rss).toBeGreaterThan(0);
      expect(memory.heapTotal).toBeGreaterThan(0);
      expect(memory.heapUsed).toBeGreaterThan(0);
      expect(memory.external).toBeGreaterThanOrEqual(0);
      
      // Heap used should not exceed heap total
      expect(memory.heapUsed).toBeLessThanOrEqual(memory.heapTotal);
    });

    it('should return valid queue metrics', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/health',
      });

      const body = JSON.parse(response.body);
      const queue = body.metrics.queue;
      
      expect(typeof queue.waiting).toBe('number');
      expect(typeof queue.active).toBe('number');
      expect(typeof queue.completed).toBe('number');
      expect(typeof queue.failed).toBe('number');
      expect(typeof queue.delayed).toBe('number');
      
      // Queue counts should be non-negative
      expect(queue.waiting).toBeGreaterThanOrEqual(0);
      expect(queue.active).toBeGreaterThanOrEqual(0);
      expect(queue.completed).toBeGreaterThanOrEqual(0);
      expect(queue.failed).toBeGreaterThanOrEqual(0);
      expect(queue.delayed).toBeGreaterThanOrEqual(0);
    });

    it('should return valid database metrics', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/health',
      });

      const body = JSON.parse(response.body);
      const database = body.metrics.database;
      
      expect(typeof database.total_targets).toBe('number');
      expect(typeof database.active_targets).toBe('number');
      expect(typeof database.total_logs).toBe('number');
      expect(typeof database.recent_jobs).toBe('number');
      
      // Database counts should be non-negative
      expect(database.total_targets).toBeGreaterThanOrEqual(0);
      expect(database.active_targets).toBeGreaterThanOrEqual(0);
      expect(database.total_logs).toBeGreaterThanOrEqual(0);
      expect(database.recent_jobs).toBeGreaterThanOrEqual(0);
      
      // Active targets should not exceed total targets
      expect(database.active_targets).toBeLessThanOrEqual(database.total_targets);
    });

    it('should return valid uptime', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/health',
      });

      const body = JSON.parse(response.body);
      
      expect(typeof body.uptime).toBe('number');
      expect(typeof body.metrics.uptime).toBe('number');
      expect(body.uptime).toBeGreaterThan(0);
      expect(body.metrics.uptime).toBeGreaterThan(0);
      
      // Both uptime values should be similar (within 1 second)
      expect(Math.abs(body.uptime - body.metrics.uptime)).toBeLessThan(1);
    });

    it('should return environment information', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/health',
      });

      const body = JSON.parse(response.body);
      
      expect(typeof body.environment).toBe('string');
      expect(typeof body.version).toBe('string');
      
      // Environment should be test in test environment
      expect(body.environment).toBe('test');
    });

    it('should handle service degradation gracefully', async () => {
      // This test assumes some services might be unhealthy in test environment
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/health',
      });

      const body = JSON.parse(response.body);
      
      // Even if some services are unhealthy, the response should be well-formed
      if (body.status === 'degraded') {
        // At least one service should be healthy
        const healthyServices = Object.values(body.services).filter((service: any) => service.healthy);
        expect(healthyServices.length).toBeGreaterThan(0);
        
        // At least one service should be unhealthy
        const unhealthyServices = Object.values(body.services).filter((service: any) => !service.healthy);
        expect(unhealthyServices.length).toBeGreaterThan(0);
      }
    });

    it('should include response times for healthy services', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/health',
      });

      const body = JSON.parse(response.body);
      
      Object.entries(body.services).forEach(([serviceName, service]: [string, any]) => {
        if (service.healthy && service.response_time !== undefined) {
          expect(typeof service.response_time).toBe('number');
          expect(service.response_time).toBeGreaterThanOrEqual(0);
          expect(service.response_time).toBeLessThan(10000); // Should be less than 10 seconds
        }
      });
    });

    it('should include error messages for unhealthy services', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/health',
      });

      const body = JSON.parse(response.body);
      
      Object.entries(body.services).forEach(([serviceName, service]: [string, any]) => {
        if (!service.healthy) {
          // Unhealthy services should have error messages
          expect(service.error).toBeDefined();
          expect(typeof service.error).toBe('string');
          expect(service.error.length).toBeGreaterThan(0);
        }
      });
    });

    it('should be consistent across multiple requests', async () => {
      const responses = await Promise.all([
        app.inject({ method: 'GET', url: '/api/v1/health' }),
        app.inject({ method: 'GET', url: '/api/v1/health' }),
        app.inject({ method: 'GET', url: '/api/v1/health' }),
      ]);

      const bodies = responses.map(r => JSON.parse(r.body));
      
      // All responses should have the same structure
      bodies.forEach(body => {
        expect(body.status).toBeDefined();
        expect(body.services).toBeDefined();
        expect(body.metrics).toBeDefined();
      });
      
      // Service health should be consistent (within a short time window)
      const firstServiceStates = bodies[0].services;
      bodies.slice(1).forEach(body => {
        Object.keys(firstServiceStates).forEach(serviceName => {
          // Service health might change, but structure should be consistent
          expect(body.services[serviceName]).toBeDefined();
          expect(typeof body.services[serviceName].healthy).toBe('boolean');
        });
      });
    });
  });
});
