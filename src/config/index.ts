// src/config/index.ts
export const config = {
  server: {
    port: parseInt(process.env.PORT || '3000'),
    host: process.env.HOST || '0.0.0.0',
  },
  database: {
    url: process.env.DATABASE_URL || 'file:./data/postmaster.db',
  },
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD,
  },
  auth: {
    apiKey: process.env.API_KEY || 'your-secret-api-key', // Single shared key
  },
  platforms: {
    slack: {
      defaultRateLimit: 60, // per minute
      maxMessageSize: 4000,
    },
    discord: {
      defaultRateLimit: 30,
      maxMessageSize: 2000,
    },
    telegram: {
      defaultRateLimit: 30,
      maxMessageSize: 4096,
    },
    twitter: {
      defaultRateLimit: 15, // per 15 minutes
      maxMessageSize: 280,
    },
  },
  queue: {
    defaultRetries: 3,
    backoffMultiplier: 2,
    defaultDelay: 5000,
  },
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    prettyPrint: process.env.NODE_ENV === 'development',
  },
}; 
