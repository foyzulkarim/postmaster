import { FastifyInstance } from 'fastify';
import { BroadcastController } from './broadcast.controller';

export async function broadcastRoutes(fastify: FastifyInstance) {
  // POST /api/v1/broadcast - Send broadcast message
  fastify.post('/', {
    schema: {
      body: {
        type: 'object',
        required: ['message', 'targets'],
        properties: {
          message: {
            type: 'object',
            required: ['title', 'content'],
            properties: {
              title: { type: 'string' },
              content: { type: 'string' },
              priority: { type: 'string', enum: ['low', 'normal', 'high', 'critical'] },
              tags: { type: 'array', items: { type: 'string' } }
            }
          },
          targets: {
            type: 'array',
            items: {
              type: 'object',
              required: ['platform', 'channel'],
              properties: {
                platform: { type: 'string', enum: ['slack', 'discord', 'telegram'] },
                channel: { type: 'string' },
                webhook: { type: 'string' }
              }
            }
          }
        }
      }
    }
  }, BroadcastController.broadcast);
}

export default broadcastRoutes;
