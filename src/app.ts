import Fastify, { FastifyInstance } from 'fastify';
import { config } from './config';
import { serverLogger } from './utils/logger';
import { HealthController } from './api/v1/health/health.controller';
import { AuthMiddleware } from './middleware/auth.middleware';
import { BroadcastController } from './api/v1/broadcast/broadcast.controller';

// Create Fastify instance
export const createApp = async (): Promise<FastifyInstance> => {
  const app = Fastify({
    logger: false, // Disable Fastify's built-in logger to use our own
    requestIdHeader: 'x-request-id',
    requestIdLogLabel: 'reqId',
    genReqId: () => {
      return Date.now().toString(36) + Math.random().toString(36).substr(2);
    },
  });

  try {
    // Register plugins one by one to identify issues
    serverLogger.info('Registering CORS plugin...');
    await app.register(import('@fastify/cors'), {
      origin: true,
      credentials: true,
    });

    serverLogger.info('Registering Helmet plugin...');
    await app.register(import('@fastify/helmet'), {
      contentSecurityPolicy: false,
    });

    serverLogger.info('Registering Rate Limit plugin...');
    await app.register(import('@fastify/rate-limit'), {
      max: 100,
      timeWindow: '1 minute',
    });

    serverLogger.info('Adding hooks...');
    // Add request logging with timing
    app.addHook('onRequest', async (request, reply) => {
      (request as any).startTime = Date.now();
      serverLogger.info('Incoming request', {
        method: request.method,
        url: request.url,
        userAgent: request.headers['user-agent'],
        ip: request.ip,
      });
    });

    // Add response logging
    app.addHook('onResponse', async (request, reply) => {
      const responseTime = Date.now() - ((request as any).startTime || Date.now());
      serverLogger.info('Request completed', {
        method: request.method,
        url: request.url,
        statusCode: reply.statusCode,
        responseTime,
      });
    });

    serverLogger.info('Registering routes...');
    // Register routes
    await registerRoutes(app);

    serverLogger.info('Setting up error handlers...');
    // Global error handler
    app.setErrorHandler(async (error, request, reply) => {
      serverLogger.error('Request error', {
        error: error.message,
        stack: error.stack,
        method: request.method,
        url: request.url,
      });

      const statusCode = error.statusCode || 500;
      const message = statusCode === 500 ? 'Internal Server Error' : error.message;

      reply.status(statusCode).send({
        success: false,
        error: {
          code: error.code || 'INTERNAL_ERROR',
          message,
        },
        request_id: request.id,
      });
    });

    // 404 handler
    app.setNotFoundHandler(async (request, reply) => {
      serverLogger.warn('Route not found', {
        method: request.method,
        url: request.url,
      });

      reply.status(404).send({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Route not found',
        },
        request_id: request.id,
      });
    });

    serverLogger.info('Fastify app created successfully');
    return app;
  } catch (error) {
    serverLogger.error('Error creating Fastify app', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
    });
    throw error;
  }
};

// Register all routes
const registerRoutes = async (app: FastifyInstance) => {
  // Public routes (no authentication required)
  
  // Health check endpoint
  app.get('/api/v1/health', HealthController.healthCheck);

  // Root endpoint
  app.get('/', async (request, reply) => {
    return {
      name: 'Postmaster',
      version: '1.0.0',
      description: 'Central notification hub for multi-platform messaging',
      status: 'running',
      timestamp: new Date().toISOString(),
    };
  });

  // API info endpoint
  app.get('/api/v1', async (request, reply) => {
    return {
      name: 'Postmaster API',
      version: 'v1',
      endpoints: {
        health: '/api/v1/health',
        broadcast: '/api/v1/broadcast',
        jobs: '/api/v1/jobs',
      },
      documentation: 'https://github.com/foyzulkarim/postmaster#readme',
    };
  });

  // Protected routes (authentication required)
  await app.register(async function (fastify) {
    // Add authentication middleware to all routes in this context
    fastify.addHook('preHandler', AuthMiddleware.preHandler);
    
    // Broadcast endpoint
    fastify.post('/api/v1/broadcast', BroadcastController.broadcast);
    
    // Future protected routes will be registered here
    // Example: fastify.get('/api/v1/jobs/:jobId', jobStatusHandler);
    
    serverLogger.info('Protected routes registered with authentication middleware');
  });
};

export default createApp; 
