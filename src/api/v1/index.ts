import { FastifyInstance } from 'fastify';
import { broadcastRoutes } from './broadcast';
import { jobsRoutes } from './jobs';
import { healthRoutes } from './health';

export async function apiV1Routes(fastify: FastifyInstance) {
  // Register broadcast routes
  await fastify.register(broadcastRoutes, { prefix: '/broadcast' });
  
  // Register jobs routes
  await fastify.register(jobsRoutes, { prefix: '/jobs' });
  
  // Register health routes
  await fastify.register(healthRoutes, { prefix: '/health' });
}

export default apiV1Routes;
