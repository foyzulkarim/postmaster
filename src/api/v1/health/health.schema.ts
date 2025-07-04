export const healthSchema = {
  healthCheck: {
    description: 'Comprehensive system health check',
    tags: ['Health'],
    response: {
      200: {
        type: 'object',
        properties: {
          status: {
            type: 'string',
            enum: ['healthy', 'unhealthy', 'degraded'],
          },
          timestamp: {
            type: 'string',
            format: 'date-time',
          },
          uptime: {
            type: 'number',
            description: 'Process uptime in seconds',
          },
          version: {
            type: 'string',
          },
          environment: {
            type: 'string',
          },
          services: {
            type: 'object',
            properties: {
              database: {
                type: 'object',
                properties: {
                  healthy: { type: 'boolean' },
                  response_time: { type: 'number' },
                  error: { type: 'string' },
                  details: { type: 'object' },
                },
                required: ['healthy'],
              },
              redis: {
                type: 'object',
                properties: {
                  healthy: { type: 'boolean' },
                  response_time: { type: 'number' },
                  error: { type: 'string' },
                  details: { type: 'object' },
                },
                required: ['healthy'],
              },
              queue: {
                type: 'object',
                properties: {
                  healthy: { type: 'boolean' },
                  response_time: { type: 'number' },
                  error: { type: 'string' },
                  details: { type: 'object' },
                },
                required: ['healthy'],
              },
              rateLimiter: {
                type: 'object',
                properties: {
                  healthy: { type: 'boolean' },
                  response_time: { type: 'number' },
                  error: { type: 'string' },
                  details: { type: 'object' },
                },
                required: ['healthy'],
              },
              platforms: {
                type: 'object',
                properties: {
                  healthy: { type: 'boolean' },
                  response_time: { type: 'number' },
                  error: { type: 'string' },
                  details: { type: 'object' },
                },
                required: ['healthy'],
              },
            },
            required: ['database', 'redis', 'queue', 'rateLimiter', 'platforms'],
          },
          metrics: {
            type: 'object',
            properties: {
              memory: {
                type: 'object',
                properties: {
                  rss: { type: 'number' },
                  heapTotal: { type: 'number' },
                  heapUsed: { type: 'number' },
                  external: { type: 'number' },
                  arrayBuffers: { type: 'number' },
                },
                required: ['rss', 'heapTotal', 'heapUsed', 'external'],
              },
              uptime: { type: 'number' },
              queue: {
                type: 'object',
                properties: {
                  waiting: { type: 'number' },
                  active: { type: 'number' },
                  completed: { type: 'number' },
                  failed: { type: 'number' },
                  delayed: { type: 'number' },
                },
                required: ['waiting', 'active', 'completed', 'failed', 'delayed'],
              },
              database: {
                type: 'object',
                properties: {
                  total_targets: { type: 'number' },
                  active_targets: { type: 'number' },
                  total_logs: { type: 'number' },
                  recent_jobs: { type: 'number' },
                },
                required: ['total_targets', 'active_targets', 'total_logs', 'recent_jobs'],
              },
              timestamp: {
                type: 'string',
                format: 'date-time',
              },
            },
            required: ['memory', 'uptime', 'queue', 'database', 'timestamp'],
          },
        },
        required: ['status', 'timestamp', 'uptime', 'version', 'environment', 'services', 'metrics'],
      },
      503: {
        type: 'object',
        properties: {
          status: {
            type: 'string',
            const: 'unhealthy',
          },
          timestamp: {
            type: 'string',
            format: 'date-time',
          },
          uptime: {
            type: 'number',
          },
          version: {
            type: 'string',
          },
          environment: {
            type: 'string',
          },
          services: {
            type: 'object',
            properties: {
              database: {
                type: 'object',
                properties: {
                  healthy: { type: 'boolean', const: false },
                  error: { type: 'string' },
                },
                required: ['healthy'],
              },
              redis: {
                type: 'object',
                properties: {
                  healthy: { type: 'boolean', const: false },
                  error: { type: 'string' },
                },
                required: ['healthy'],
              },
              queue: {
                type: 'object',
                properties: {
                  healthy: { type: 'boolean', const: false },
                  error: { type: 'string' },
                },
                required: ['healthy'],
              },
              rateLimiter: {
                type: 'object',
                properties: {
                  healthy: { type: 'boolean', const: false },
                  error: { type: 'string' },
                },
                required: ['healthy'],
              },
              platforms: {
                type: 'object',
                properties: {
                  healthy: { type: 'boolean', const: false },
                  error: { type: 'string' },
                },
                required: ['healthy'],
              },
            },
            required: ['database', 'redis', 'queue', 'rateLimiter', 'platforms'],
          },
          metrics: {
            type: 'object',
            properties: {
              memory: { type: 'object' },
              uptime: { type: 'number' },
              queue: { type: 'object' },
              database: { type: 'object' },
              timestamp: { type: 'string', format: 'date-time' },
            },
            required: ['memory', 'uptime', 'queue', 'database', 'timestamp'],
          },
        },
        required: ['status', 'timestamp', 'uptime', 'version', 'environment', 'services', 'metrics'],
      },
    },
  },
};
