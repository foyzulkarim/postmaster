import { FastifyInstance } from 'fastify';
import { JobsController } from './jobs.controller';
import { jobsSchema } from './jobs.schema';
import { AuthMiddleware } from '../../../middleware/auth.middleware';

export async function jobsRoutes(fastify: FastifyInstance) {
  const jobsController = new JobsController();

  // Register authentication middleware for all job routes
  fastify.addHook('preHandler', AuthMiddleware.preHandler);

  // GET /api/v1/jobs - List jobs with filtering and pagination
  fastify.get('/', {
    schema: jobsSchema.listJobs,
    handler: jobsController.getJobsList.bind(jobsController),
  });

  // GET /api/v1/jobs/:jobId - Get job status and details
  fastify.get('/:jobId', {
    schema: jobsSchema.getJobStatus,
    handler: jobsController.getJobStatus.bind(jobsController),
  });

  // POST /api/v1/jobs/:jobId/retry - Retry a failed job
  fastify.post('/:jobId/retry', {
    schema: jobsSchema.retryJob,
    handler: jobsController.retryJob.bind(jobsController),
  });

  // DELETE /api/v1/jobs/:jobId - Cancel a job
  fastify.delete('/:jobId', {
    schema: jobsSchema.cancelJob,
    handler: jobsController.cancelJob.bind(jobsController),
  });

  // Cleanup on close
  fastify.addHook('onClose', async () => {
    await jobsController.close();
  });
}

export default jobsRoutes;
