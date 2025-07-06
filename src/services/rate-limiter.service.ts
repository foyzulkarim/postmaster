import { RateLimiterRedis } from 'rate-limiter-flexible';
import Redis from 'ioredis';
import { config } from '../config';
import { RateLimitError, ErrorType } from '../types/errors.types';
import { serviceLogger } from '../utils/logger';

export interface RateLimitConfig {
  points: number; // Number of requests
  duration: number; // Per duration in seconds
  blockDuration?: number; // Block duration in seconds (defaults to duration)
  execEvenly?: boolean; // Execute requests evenly across duration
}

export interface RateLimitResult {
  allowed: boolean;
  remainingPoints: number;
  msBeforeNext: number;
  totalHits: number;
}

export class RateLimiterService {
  private redis: Redis;
  private limiters = new Map<string, RateLimiterRedis>();
  private defaultConfigs: Record<string, RateLimitConfig> = {
    // Platform-specific rate limits
    slack: {
      points: 60, // 60 requests
      duration: 60, // per minute
      execEvenly: true,
    },
    discord: {
      points: 30, // 30 requests
      duration: 60, // per minute
      execEvenly: true,
    },
    telegram: {
      points: 30, // 30 requests
      duration: 60, // per minute
      execEvenly: true,
    },
    twitter: {
      points: 15, // 15 tweets per 15 minutes (Twitter's rate limit)
      duration: 900, // per 15 minutes
      execEvenly: true,
    },
    // API rate limits
    api: {
      points: 100, // 100 requests
      duration: 60, // per minute
    },
    // Global rate limits
    global: {
      points: 1000, // 1000 requests
      duration: 60, // per minute
    },
  };

  constructor() {
    this.redis = new Redis({
      host: config.redis.host,
      port: config.redis.port,
      password: config.redis.password,
      maxRetriesPerRequest: null, // Required for BullMQ
      lazyConnect: true,
    });

    this.initializeLimiters();
    this.setupRedisEventHandlers();
  }

  /**
   * Check rate limit for a specific key and limiter
   */
  async checkLimit(
    limiterName: string,
    key?: string,
    points: number = 1
  ): Promise<RateLimitResult> {
    try {
      const limiter = this.getLimiter(limiterName);
      const identifier = key || limiterName;
      
      serviceLogger.debug('Checking rate limit', {
        limiterName,
        identifier,
        points,
      });

      const result = await limiter.consume(identifier, points);
      
      const rateLimitResult: RateLimitResult = {
        allowed: true,
        remainingPoints: result.remainingPoints || 0,
        msBeforeNext: result.msBeforeNext || 0,
        totalHits: (result as any).totalHits || 0,
      };

      serviceLogger.debug('Rate limit check passed', {
        limiterName,
        identifier,
        remainingPoints: rateLimitResult.remainingPoints,
      });

      return rateLimitResult;
      
    } catch (rejRes: any) {
      const secs = Math.round(rejRes.msBeforeNext / 1000) || 1;
      
      serviceLogger.warn('Rate limit exceeded', {
        limiterName,
        identifier: key || limiterName,
        msBeforeNext: rejRes.msBeforeNext,
        remainingPoints: rejRes.remainingPoints,
        totalHits: rejRes.totalHits,
      });

      // Throw rate limit error
      throw new RateLimitError(
        `Rate limit exceeded for ${limiterName}. Retry after ${secs} seconds`,
        secs,
        limiterName,
        {
          limiterName,
          identifier: key || limiterName,
          remainingPoints: rejRes.remainingPoints || 0,
          totalHits: rejRes.totalHits || 0,
        }
      );
    }
  }

  /**
   * Get remaining points for a key
   */
  async getRemainingPoints(limiterName: string, key?: string): Promise<number> {
    try {
      const limiter = this.getLimiter(limiterName);
      const identifier = key || limiterName;
      
      const res = await limiter.get(identifier);
      return res ? res.remainingPoints : limiter.points;
      
    } catch (error) {
      serviceLogger.error('Error getting remaining points', {
        limiterName,
        identifier: key || limiterName,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return 0;
    }
  }

  /**
   * Reset rate limit for a key
   */
  async resetLimit(limiterName: string, key?: string): Promise<void> {
    try {
      const limiter = this.getLimiter(limiterName);
      const identifier = key || limiterName;
      
      await limiter.delete(identifier);
      
      serviceLogger.info('Rate limit reset', {
        limiterName,
        identifier,
      });
      
    } catch (error) {
      serviceLogger.error('Error resetting rate limit', {
        limiterName,
        identifier: key || limiterName,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Block a key for a specific duration
   */
  async blockKey(
    limiterName: string,
    key: string,
    durationSeconds: number
  ): Promise<void> {
    try {
      const limiter = this.getLimiter(limiterName);
      
      // Block by consuming all available points plus one
      await limiter.block(key, durationSeconds * 1000);
      
      serviceLogger.warn('Key blocked', {
        limiterName,
        key,
        durationSeconds,
      });
      
    } catch (error) {
      serviceLogger.error('Error blocking key', {
        limiterName,
        key,
        durationSeconds,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Get rate limiter statistics
   */
  async getStats(): Promise<Record<string, any>> {
    const stats: Record<string, any> = {
      limiters: {},
      redis: {
        status: this.redis.status,
        connected: this.redis.status === 'ready',
      },
    };

    for (const [name, limiter] of this.limiters) {
      try {
        stats.limiters[name] = {
          points: limiter.points,
          duration: limiter.duration,
          blockDuration: limiter.blockDuration,
          execEvenly: limiter.execEvenly,
        };
      } catch (error) {
        stats.limiters[name] = {
          error: error instanceof Error ? error.message : 'Unknown error',
        };
      }
    }

    return stats;
  }

  /**
   * Create a custom rate limiter
   */
  createLimiter(name: string, config: RateLimitConfig): void {
    if (this.limiters.has(name)) {
      serviceLogger.warn('Rate limiter already exists, replacing', { name });
    }

    const limiter = new RateLimiterRedis({
      storeClient: this.redis,
      keyPrefix: `rl_${name}`,
      points: config.points,
      duration: config.duration,
      blockDuration: config.blockDuration || config.duration,
      execEvenly: config.execEvenly || false,
    });

    this.limiters.set(name, limiter);
    
    serviceLogger.info('Rate limiter created', {
      name,
      points: config.points,
      duration: config.duration,
    });
  }

  /**
   * Remove a rate limiter
   */
  removeLimiter(name: string): boolean {
    const removed = this.limiters.delete(name);
    
    if (removed) {
      serviceLogger.info('Rate limiter removed', { name });
    }
    
    return removed;
  }

  /**
   * Get limiter instance
   */
  private getLimiter(name: string): RateLimiterRedis {
    const limiter = this.limiters.get(name);
    
    if (!limiter) {
      throw new Error(`Rate limiter '${name}' not found`);
    }
    
    return limiter;
  }

  /**
   * Initialize default rate limiters
   */
  private initializeLimiters(): void {
    for (const [name, config] of Object.entries(this.defaultConfigs)) {
      this.createLimiter(name, config);
    }

    serviceLogger.info('Rate limiters initialized', {
      limiters: Array.from(this.limiters.keys()),
      totalLimiters: this.limiters.size,
    });
  }

  /**
   * Setup Redis event handlers
   */
  private setupRedisEventHandlers(): void {
    this.redis.on('connect', () => {
      serviceLogger.info('Rate limiter Redis connected');
    });

    this.redis.on('ready', () => {
      serviceLogger.info('Rate limiter Redis ready');
    });

    this.redis.on('error', (error) => {
      serviceLogger.error('Rate limiter Redis error', {
        error: error.message,
      });
    });

    this.redis.on('close', () => {
      serviceLogger.warn('Rate limiter Redis connection closed');
    });

    this.redis.on('reconnecting', () => {
      serviceLogger.info('Rate limiter Redis reconnecting');
    });
  }

  /**
   * Connect to Redis
   */
  async connect(): Promise<void> {
    try {
      await this.redis.connect();
      serviceLogger.info('Rate limiter service connected to Redis');
    } catch (error) {
      serviceLogger.error('Failed to connect rate limiter to Redis', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Close Redis connection and cleanup
   */
  async close(): Promise<void> {
    try {
      await this.redis.quit();
      this.limiters.clear();
      
      serviceLogger.info('Rate limiter service closed');
    } catch (error) {
      serviceLogger.error('Error closing rate limiter service', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Health check for rate limiter service
   */
  async healthCheck(): Promise<{ healthy: boolean; details?: any }> {
    try {
      // Test Redis connection
      await this.redis.ping();
      
      // Test a rate limiter
      const testLimiter = this.limiters.get('global');
      if (testLimiter) {
        const testKey = `health_check_${Date.now()}`;
        await testLimiter.get(testKey);
      }
      
      return {
        healthy: true,
        details: {
          redisStatus: this.redis.status,
          limitersCount: this.limiters.size,
        },
      };
      
    } catch (error) {
      return {
        healthy: false,
        details: {
          error: error instanceof Error ? error.message : 'Unknown error',
          redisStatus: this.redis.status,
        },
      };
    }
  }
}

export default RateLimiterService;
