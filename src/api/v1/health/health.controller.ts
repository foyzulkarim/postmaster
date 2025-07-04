import { FastifyRequest, FastifyReply } from 'fastify';
import { Queue } from 'bullmq';
import Redis from 'ioredis';
import { databaseService } from '../../../services/db.service';
import { RateLimiterService } from '../../../services/rate-limiter.service';
import { platformConfigManager } from '../../../config/platforms.config';
import { apiLogger } from '../../../utils/logger';
import { config } from '../../../config';

export interface HealthResponse {
  status: 'healthy' | 'unhealthy' | 'degraded';
  timestamp: string;
  uptime: number;
  version: string;
  environment: string;
  services: {
    database: ServiceHealth;
    redis: ServiceHealth;
    queue: ServiceHealth;
    rateLimiter: ServiceHealth;
    platforms: ServiceHealth;
    configuration: ServiceHealth;
  };
  metrics: SystemMetrics;
}

export interface ServiceHealth {
  healthy: boolean;
  response_time?: number;
  error?: string;
  details?: any;
}

export interface SystemMetrics {
  memory: NodeJS.MemoryUsage;
  uptime: number;
  queue: {
    waiting: number;
    active: number;
    completed: number;
    failed: number;
    delayed: number;
  };
  database: {
    total_targets: number;
    active_targets: number;
    total_logs: number;
    recent_jobs: number;
  };
  timestamp: string;
}

export class HealthController {
  private redis: Redis;
  private queue: Queue;
  private rateLimiter: RateLimiterService;

  constructor() {
    // Initialize Redis connection for health checks
    this.redis = new Redis({
      host: config.redis.host,
      port: config.redis.port,
      password: config.redis.password,
      lazyConnect: true,
    });

    // Initialize queue for health checks
    this.queue = new Queue('notifications', {
      connection: {
        host: config.redis.host,
        port: config.redis.port,
        password: config.redis.password,
      },
    });

    // Initialize rate limiter for health checks
    this.rateLimiter = new RateLimiterService();
  }

  /**
   * Comprehensive health check
   */
  async healthCheck(
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<HealthResponse> {
    const startTime = Date.now();
    
    try {
      apiLogger.debug('Starting comprehensive health check');

      // Run all health checks in parallel
      const [
        databaseHealth,
        redisHealth,
        queueHealth,
        rateLimiterHealth,
        platformsHealth,
        configurationHealth,
        metrics,
      ] = await Promise.allSettled([
        this.checkDatabase(),
        this.checkRedis(),
        this.checkQueue(),
        this.checkRateLimiter(),
        this.checkPlatforms(),
        this.checkConfiguration(),
        this.getMetrics(),
      ]);

      // Process results
      const services = {
        database: this.processHealthResult(databaseHealth),
        redis: this.processHealthResult(redisHealth),
        queue: this.processHealthResult(queueHealth),
        rateLimiter: this.processHealthResult(rateLimiterHealth),
        platforms: this.processHealthResult(platformsHealth),
        configuration: this.processHealthResult(configurationHealth),
      };

      const systemMetrics = this.processMetricsResult(metrics);

      // Determine overall status
      const overallStatus = this.determineOverallStatus(services);

      const response: HealthResponse = {
        status: overallStatus,
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        version: process.env.npm_package_version || '1.0.0',
        environment: process.env.NODE_ENV || 'development',
        services,
        metrics: systemMetrics,
      };

      const responseTime = Date.now() - startTime;
      
      apiLogger.info('Health check completed', {
        responseTime,
        status: response.status,
        servicesHealthy: Object.values(services).filter(s => s.healthy).length,
        servicesTotal: Object.keys(services).length,
      });

      // Set appropriate HTTP status code
      const statusCode = overallStatus === 'healthy' ? 200 : 
                        overallStatus === 'degraded' ? 200 : 503;
      
      reply.code(statusCode);
      return response;

    } catch (error) {
      const responseTime = Date.now() - startTime;
      
      apiLogger.error('Health check failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        responseTime,
      });

      const errorResponse: HealthResponse = {
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        version: process.env.npm_package_version || '1.0.0',
        environment: process.env.NODE_ENV || 'development',
        services: {
          database: { healthy: false, error: 'Health check failed' },
          redis: { healthy: false, error: 'Health check failed' },
          queue: { healthy: false, error: 'Health check failed' },
          rateLimiter: { healthy: false, error: 'Health check failed' },
          platforms: { healthy: false, error: 'Health check failed' },
        },
        metrics: this.getEmptyMetrics(),
      };

      reply.code(503);
      return errorResponse;
    }
  }

  /**
   * Check database health
   */
  private async checkDatabase(): Promise<ServiceHealth> {
    const startTime = Date.now();
    
    try {
      // Test database connection with a simple query
      await databaseService.healthCheck();
      
      const responseTime = Date.now() - startTime;
      
      return {
        healthy: true,
        response_time: responseTime,
        details: {
          connection: 'active',
          type: 'sqlite',
        },
      };
      
    } catch (error) {
      const responseTime = Date.now() - startTime;
      
      return {
        healthy: false,
        response_time: responseTime,
        error: error instanceof Error ? error.message : 'Unknown database error',
      };
    }
  }

  /**
   * Check Redis health
   */
  private async checkRedis(): Promise<ServiceHealth> {
    const startTime = Date.now();
    
    try {
      // Test Redis connection
      const pong = await this.redis.ping();
      
      if (pong !== 'PONG') {
        throw new Error('Redis ping failed');
      }
      
      const responseTime = Date.now() - startTime;
      
      return {
        healthy: true,
        response_time: responseTime,
        details: {
          status: this.redis.status,
          host: config.redis.host,
          port: config.redis.port,
        },
      };
      
    } catch (error) {
      const responseTime = Date.now() - startTime;
      
      return {
        healthy: false,
        response_time: responseTime,
        error: error instanceof Error ? error.message : 'Unknown Redis error',
        details: {
          status: this.redis.status,
        },
      };
    }
  }

  /**
   * Check queue health
   */
  private async checkQueue(): Promise<ServiceHealth> {
    const startTime = Date.now();
    
    try {
      // Get queue statistics
      const [waiting, active, completed, failed, delayed] = await Promise.all([
        this.queue.getWaiting(),
        this.queue.getActive(),
        this.queue.getCompleted(),
        this.queue.getFailed(),
        this.queue.getDelayed(),
      ]);
      
      const responseTime = Date.now() - startTime;
      
      return {
        healthy: true,
        response_time: responseTime,
        details: {
          waiting: waiting.length,
          active: active.length,
          completed: completed.length,
          failed: failed.length,
          delayed: delayed.length,
        },
      };
      
    } catch (error) {
      const responseTime = Date.now() - startTime;
      
      return {
        healthy: false,
        response_time: responseTime,
        error: error instanceof Error ? error.message : 'Unknown queue error',
      };
    }
  }

  /**
   * Check rate limiter health
   */
  private async checkRateLimiter(): Promise<ServiceHealth> {
    const startTime = Date.now();
    
    try {
      const healthResult = await this.rateLimiter.healthCheck();
      const responseTime = Date.now() - startTime;
      
      return {
        healthy: healthResult.healthy,
        response_time: responseTime,
        details: healthResult.details,
        error: healthResult.healthy ? undefined : 'Rate limiter unhealthy',
      };
      
    } catch (error) {
      const responseTime = Date.now() - startTime;
      
      return {
        healthy: false,
        response_time: responseTime,
        error: error instanceof Error ? error.message : 'Unknown rate limiter error',
      };
    }
  }

  /**
   * Check platform configuration health
   */
  private async checkConfiguration(): Promise<ServiceHealth> {
    const startTime = Date.now();
    
    try {
      // Check if configuration file exists and is valid
      const hasConfiguredPlatforms = platformConfigManager.hasConfiguredPlatforms();
      
      if (!hasConfiguredPlatforms) {
        return {
          healthy: false,
          responseTime: Date.now() - startTime,
          error: 'No platforms configured',
          details: {
            configSummary: platformConfigManager.getConfigSummary(),
          },
        };
      }

      const configSummary = platformConfigManager.getConfigSummary();
      const activePlatforms = platformConfigManager.getActivePlatforms();
      
      return {
        healthy: true,
        responseTime: Date.now() - startTime,
        details: {
          activePlatforms,
          totalActivePlatforms: activePlatforms.length,
          configSummary,
        },
      };

    } catch (error) {
      return {
        healthy: false,
        responseTime: Date.now() - startTime,
        error: error instanceof Error ? error.message : 'Configuration check failed',
        details: {
          configPath: platformConfigManager['configPath'],
        },
      };
    }
  }
  private async checkPlatforms(): Promise<ServiceHealth> {
    const startTime = Date.now();
    
    try {
      // Get active targets from database
      const activeTargets = await databaseService.findAllActiveTargets();
      
      // Group by platform
      const platformCounts = activeTargets.reduce((acc, target) => {
        acc[target.platform] = (acc[target.platform] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);
      
      const responseTime = Date.now() - startTime;
      
      // Consider platforms healthy if we have at least one active target
      const healthy = activeTargets.length > 0;
      
      return {
        healthy,
        response_time: responseTime,
        details: {
          total_targets: activeTargets.length,
          platforms: platformCounts,
          supported_platforms: ['slack', 'discord', 'telegram'],
        },
        error: healthy ? undefined : 'No active platform targets configured',
      };
      
    } catch (error) {
      const responseTime = Date.now() - startTime;
      
      return {
        healthy: false,
        response_time: responseTime,
        error: error instanceof Error ? error.message : 'Unknown platforms error',
      };
    }
  }

  /**
   * Get system metrics
   */
  private async getMetrics(): Promise<SystemMetrics> {
    try {
      // Get queue metrics
      const [waiting, active, completed, failed, delayed] = await Promise.all([
        this.queue.getWaiting(),
        this.queue.getActive(),
        this.queue.getCompleted(),
        this.queue.getFailed(),
        this.queue.getDelayed(),
      ]);

      // Get database metrics
      const [totalTargets, activeTargets, totalLogs, recentJobs] = await Promise.all([
        databaseService.countTargets(),
        databaseService.countActiveTargets(),
        databaseService.countLogs(),
        databaseService.countRecentJobs(24), // Last 24 hours
      ]);

      return {
        memory: process.memoryUsage(),
        uptime: process.uptime(),
        queue: {
          waiting: waiting.length,
          active: active.length,
          completed: completed.length,
          failed: failed.length,
          delayed: delayed.length,
        },
        database: {
          total_targets: totalTargets,
          active_targets: activeTargets,
          total_logs: totalLogs,
          recent_jobs: recentJobs,
        },
        timestamp: new Date().toISOString(),
      };
      
    } catch (error) {
      apiLogger.warn('Error getting metrics, returning empty metrics', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      
      return this.getEmptyMetrics();
    }
  }

  /**
   * Process health check result
   */
  private processHealthResult(result: PromiseSettledResult<ServiceHealth>): ServiceHealth {
    if (result.status === 'fulfilled') {
      return result.value;
    } else {
      return {
        healthy: false,
        error: result.reason instanceof Error ? result.reason.message : 'Health check failed',
      };
    }
  }

  /**
   * Process metrics result
   */
  private processMetricsResult(result: PromiseSettledResult<SystemMetrics>): SystemMetrics {
    if (result.status === 'fulfilled') {
      return result.value;
    } else {
      return this.getEmptyMetrics();
    }
  }

  /**
   * Determine overall system status
   */
  private determineOverallStatus(services: Record<string, ServiceHealth>): 'healthy' | 'unhealthy' | 'degraded' {
    const healthyServices = Object.values(services).filter(s => s.healthy);
    const totalServices = Object.values(services).length;
    
    if (healthyServices.length === totalServices) {
      return 'healthy';
    } else if (healthyServices.length === 0) {
      return 'unhealthy';
    } else {
      // Some services are healthy, some are not
      return 'degraded';
    }
  }

  /**
   * Get empty metrics for error cases
   */
  private getEmptyMetrics(): SystemMetrics {
    return {
      memory: process.memoryUsage(),
      uptime: process.uptime(),
      queue: {
        waiting: 0,
        active: 0,
        completed: 0,
        failed: 0,
        delayed: 0,
      },
      database: {
        total_targets: 0,
        active_targets: 0,
        total_logs: 0,
        recent_jobs: 0,
      },
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Close health controller resources
   */
  async close(): Promise<void> {
    try {
      await this.redis.quit();
      await this.queue.close();
      await this.rateLimiter.close();
      apiLogger.info('HealthController resources closed');
    } catch (error) {
      apiLogger.error('Error closing HealthController resources', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
} 
