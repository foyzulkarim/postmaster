import 'dotenv/config';
import { createApp } from './app';
import { config } from './config';
import { serverLogger } from './utils/logger';

// Graceful shutdown handler
const gracefulShutdown = async (signal: string, app: any) => {
  serverLogger.info(`Received ${signal}, shutting down gracefully...`);
  
  try {
    await app.close();
    serverLogger.info('Server closed successfully');
    process.exit(0);
  } catch (error) {
    serverLogger.error('Error during shutdown', { error });
    process.exit(1);
  }
};

// Start the server
const start = async () => {
  try {
    serverLogger.info('Starting Postmaster server...', {
      nodeVersion: process.version,
      environment: process.env.NODE_ENV || 'development',
      port: config.server.port,
      host: config.server.host,
    });

    serverLogger.info('Creating Fastify app...');
    // Create and start the app
    const app = await createApp();
    
    serverLogger.info('Starting server listener...');
    // Start listening
    await app.listen({
      port: config.server.port,
      host: config.server.host,
    });

    serverLogger.info('🚀 Postmaster server started successfully', {
      port: config.server.port,
      host: config.server.host,
      url: `http://${config.server.host}:${config.server.port}`,
      healthCheck: `http://${config.server.host}:${config.server.port}/api/v1/health`,
    });

    // Setup graceful shutdown
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM', app));
    process.on('SIGINT', () => gracefulShutdown('SIGINT', app));
    process.on('SIGHUP', () => gracefulShutdown('SIGHUP', app));

  } catch (error) {
    serverLogger.error('Failed to start server', { 
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      details: error,
    });
    process.exit(1);
  }
};

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  serverLogger.fatal('Uncaught exception', { error: error.message, stack: error.stack });
  process.exit(1);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  serverLogger.fatal('Unhandled promise rejection', { reason, promise });
  process.exit(1);
});

// Start the server
start(); 
