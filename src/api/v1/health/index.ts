import { FastifyInstance } from 'fastify';
import { HealthController } from './health.controller';
import { healthSchema } from './health.schema';

export async function healthRoutes(fastify: FastifyInstance) {
  const healthController = new HealthController();

  // GET /api/v1/health - Comprehensive health check (no auth required)
  fastify.get('/', {
    schema: healthSchema.healthCheck,
    handler: healthController.healthCheck.bind(healthController),
  });

  // Cleanup on close
  fastify.addHook('onClose', async () => {
    await healthController.close();
  });
}

export default healthRoutes;
