export const jobsSchema = {
  listJobs: {
    description: 'List jobs with filtering and pagination',
    tags: ['Jobs'],
    querystring: {
      type: 'object',
      properties: {
        status: {
          type: 'string',
          enum: ['waiting', 'active', 'completed', 'failed', 'delayed'],
          description: 'Filter jobs by status',
        },
        limit: {
          type: 'integer',
          minimum: 1,
          maximum: 100,
          default: 50,
          description: 'Number of jobs to return',
        },
        offset: {
          type: 'integer',
          minimum: 0,
          default: 0,
          description: 'Number of jobs to skip',
        },
        platform: {
          type: 'string',
          enum: ['slack', 'discord', 'telegram'],
          description: 'Filter jobs by platform',
        },
      },
    },
    response: {
      200: {
        type: 'object',
        properties: {
          jobs: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                status: { type: 'string' },
                created_at: { type: 'string', format: 'date-time' },
                finished_at: { type: 'string', format: 'date-time' },
                targets_count: { type: 'integer' },
                platforms: {
                  type: 'array',
                  items: { type: 'string' },
                },
                attempts: { type: 'integer' },
                max_attempts: { type: 'integer' },
              },
              required: ['id', 'status', 'created_at', 'targets_count', 'platforms', 'attempts', 'max_attempts'],
            },
          },
          total: { type: 'integer' },
          offset: { type: 'integer' },
          limit: { type: 'integer' },
          has_more: { type: 'boolean' },
        },
        required: ['jobs', 'total', 'offset', 'limit', 'has_more'],
      },
      400: {
        type: 'object',
        properties: {
          success: { type: 'boolean', const: false },
          error: {
            type: 'object',
            properties: {
              code: { type: 'string' },
              message: { type: 'string' },
            },
            required: ['code', 'message'],
          },
        },
        required: ['success', 'error'],
      },
      500: {
        type: 'object',
        properties: {
          success: { type: 'boolean', const: false },
          error: {
            type: 'object',
            properties: {
              code: { type: 'string' },
              message: { type: 'string' },
            },
            required: ['code', 'message'],
          },
        },
        required: ['success', 'error'],
      },
    },
  },

  getJobStatus: {
    description: 'Get job status and details',
    tags: ['Jobs'],
    params: {
      type: 'object',
      properties: {
        jobId: {
          type: 'string',
          description: 'Job ID',
        },
      },
      required: ['jobId'],
    },
    response: {
      200: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          status: { type: 'string' },
          progress: { type: 'integer', minimum: 0, maximum: 100 },
          data: { type: 'object' },
          attempts: { type: 'integer' },
          maxAttempts: { type: 'integer' },
          created_at: { type: 'string', format: 'date-time' },
          processed_at: { type: 'string', format: 'date-time' },
          finished_at: { type: 'string', format: 'date-time' },
          failed_at: { type: 'string', format: 'date-time' },
          error: { type: 'string' },
          logs: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'integer' },
                target: { type: 'string' },
                platform: { type: 'string' },
                status: { type: 'string' },
                error: { type: 'string' },
                response_time: { type: 'integer' },
                attempt_count: { type: 'integer' },
                created_at: { type: 'string', format: 'date-time' },
              },
              required: ['id', 'status', 'attempt_count', 'created_at'],
            },
          },
          metrics: {
            type: 'object',
            properties: {
              response_time: { type: 'number' },
              platforms_attempted: { type: 'integer' },
              platforms_successful: { type: 'integer' },
              platforms_failed: { type: 'integer' },
            },
            required: ['platforms_attempted', 'platforms_successful', 'platforms_failed'],
          },
        },
        required: ['id', 'status', 'data', 'attempts', 'maxAttempts', 'created_at', 'logs', 'metrics'],
      },
      404: {
        type: 'object',
        properties: {
          success: { type: 'boolean', const: false },
          error: {
            type: 'object',
            properties: {
              code: { type: 'string' },
              message: { type: 'string' },
            },
            required: ['code', 'message'],
          },
        },
        required: ['success', 'error'],
      },
      500: {
        type: 'object',
        properties: {
          success: { type: 'boolean', const: false },
          error: {
            type: 'object',
            properties: {
              code: { type: 'string' },
              message: { type: 'string' },
            },
            required: ['code', 'message'],
          },
        },
        required: ['success', 'error'],
      },
    },
  },

  retryJob: {
    description: 'Retry a failed job',
    tags: ['Jobs'],
    params: {
      type: 'object',
      properties: {
        jobId: {
          type: 'string',
          description: 'Job ID',
        },
      },
      required: ['jobId'],
    },
    response: {
      200: {
        type: 'object',
        properties: {
          success: { type: 'boolean', const: true },
          message: { type: 'string' },
        },
        required: ['success', 'message'],
      },
      400: {
        type: 'object',
        properties: {
          success: { type: 'boolean', const: false },
          error: {
            type: 'object',
            properties: {
              code: { type: 'string' },
              message: { type: 'string' },
            },
            required: ['code', 'message'],
          },
        },
        required: ['success', 'error'],
      },
      404: {
        type: 'object',
        properties: {
          success: { type: 'boolean', const: false },
          error: {
            type: 'object',
            properties: {
              code: { type: 'string' },
              message: { type: 'string' },
            },
            required: ['code', 'message'],
          },
        },
        required: ['success', 'error'],
      },
      500: {
        type: 'object',
        properties: {
          success: { type: 'boolean', const: false },
          error: {
            type: 'object',
            properties: {
              code: { type: 'string' },
              message: { type: 'string' },
            },
            required: ['code', 'message'],
          },
        },
        required: ['success', 'error'],
      },
    },
  },

  cancelJob: {
    description: 'Cancel a job',
    tags: ['Jobs'],
    params: {
      type: 'object',
      properties: {
        jobId: {
          type: 'string',
          description: 'Job ID',
        },
      },
      required: ['jobId'],
    },
    response: {
      200: {
        type: 'object',
        properties: {
          success: { type: 'boolean', const: true },
          message: { type: 'string' },
        },
        required: ['success', 'message'],
      },
      400: {
        type: 'object',
        properties: {
          success: { type: 'boolean', const: false },
          error: {
            type: 'object',
            properties: {
              code: { type: 'string' },
              message: { type: 'string' },
            },
            required: ['code', 'message'],
          },
        },
        required: ['success', 'error'],
      },
      404: {
        type: 'object',
        properties: {
          success: { type: 'boolean', const: false },
          error: {
            type: 'object',
            properties: {
              code: { type: 'string' },
              message: { type: 'string' },
            },
            required: ['code', 'message'],
          },
        },
        required: ['success', 'error'],
      },
      500: {
        type: 'object',
        properties: {
          success: { type: 'boolean', const: false },
          error: {
            type: 'object',
            properties: {
              code: { type: 'string' },
              message: { type: 'string' },
            },
            required: ['code', 'message'],
          },
        },
        required: ['success', 'error'],
      },
    },
  },
};
