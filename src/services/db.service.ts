import { PrismaClient, NotificationTarget, NotificationLog, MessageDeduplication, MessageTemplate } from '@prisma/client';
import { dbLogger } from '../utils/logger';

export interface NotificationLogEntry {
  jobId: string;
  targetId?: number;
  messageHash?: string;
  status: string;
  errorType?: string;
  attemptCount?: number;
  errorMessage?: string;
  payload: string;
  responseTime?: number;
}

export interface NotificationTargetWithLogs extends NotificationTarget {
  logs: NotificationLog[];
}

export class DatabaseService {
  private static instance: DatabaseService;
  private prisma: PrismaClient;

  private constructor() {
    this.prisma = new PrismaClient({
      log: [
        { level: 'query', emit: 'event' },
        { level: 'error', emit: 'event' },
        { level: 'info', emit: 'event' },
        { level: 'warn', emit: 'event' },
      ],
    });

    // Setup Prisma event listeners for logging
    this.setupEventListeners();
  }

  /**
   * Get singleton instance
   */
  public static getInstance(): DatabaseService {
    if (!DatabaseService.instance) {
      DatabaseService.instance = new DatabaseService();
    }
    return DatabaseService.instance;
  }

  /**
   * Find notification targets by platform
   */
  async findTargetsByPlatform(platform: string): Promise<NotificationTarget[]> {
    const startTime = Date.now();
    
    try {
      const targets = await this.prisma.notificationTarget.findMany({
        where: { 
          platform, 
          active: true 
        },
        orderBy: { createdAt: 'asc' },
      });

      const responseTime = Date.now() - startTime;
      dbLogger.debug('Found targets by platform', {
        platform,
        count: targets.length,
        responseTime,
      });

      return targets;
    } catch (error) {
      const responseTime = Date.now() - startTime;
      dbLogger.error('Error finding targets by platform', {
        platform,
        error: error instanceof Error ? error.message : 'Unknown error',
        responseTime,
      });
      throw error;
    }
  }

  /**
   * Find all active notification targets
   */
  async findAllActiveTargets(): Promise<NotificationTarget[]> {
    const startTime = Date.now();
    
    try {
      const targets = await this.prisma.notificationTarget.findMany({
        where: { active: true },
        orderBy: [
          { platform: 'asc' },
          { createdAt: 'asc' },
        ],
      });

      const responseTime = Date.now() - startTime;
      dbLogger.debug('Found all active targets', {
        count: targets.length,
        responseTime,
      });

      return targets;
    } catch (error) {
      const responseTime = Date.now() - startTime;
      dbLogger.error('Error finding all active targets', {
        error: error instanceof Error ? error.message : 'Unknown error',
        responseTime,
      });
      throw error;
    }
  }

  /**
   * Create a notification log entry
   */
  async createLogEntry(entry: NotificationLogEntry): Promise<NotificationLog> {
    const startTime = Date.now();
    
    try {
      const logEntry = await this.prisma.notificationLog.create({
        data: {
          jobId: entry.jobId,
          targetId: entry.targetId,
          messageHash: entry.messageHash,
          status: entry.status,
          errorType: entry.errorType,
          attemptCount: entry.attemptCount || 0,
          errorMessage: entry.errorMessage,
          payload: entry.payload,
          responseTime: entry.responseTime,
        },
      });

      const responseTime = Date.now() - startTime;
      dbLogger.debug('Created log entry', {
        logId: logEntry.id,
        jobId: entry.jobId,
        status: entry.status,
        responseTime,
      });

      return logEntry;
    } catch (error) {
      const responseTime = Date.now() - startTime;
      dbLogger.error('Error creating log entry', {
        jobId: entry.jobId,
        error: error instanceof Error ? error.message : 'Unknown error',
        responseTime,
      });
      throw error;
    }
  }

  /**
   * Update log status for a job
   */
  async updateLogStatus(
    jobId: string,
    status: string,
    errorType?: string,
    errorMessage?: string,
    responseTime?: number
  ): Promise<void> {
    const startTime = Date.now();
    
    try {
      const updateData: any = {
        status,
        updatedAt: new Date(),
      };

      if (errorType !== undefined) updateData.errorType = errorType;
      if (errorMessage !== undefined) updateData.errorMessage = errorMessage;
      if (responseTime !== undefined) updateData.responseTime = responseTime;

      const result = await this.prisma.notificationLog.updateMany({
        where: { jobId },
        data: updateData,
      });

      const dbResponseTime = Date.now() - startTime;
      dbLogger.debug('Updated log status', {
        jobId,
        status,
        updatedCount: result.count,
        responseTime: dbResponseTime,
      });
    } catch (error) {
      const dbResponseTime = Date.now() - startTime;
      dbLogger.error('Error updating log status', {
        jobId,
        status,
        error: error instanceof Error ? error.message : 'Unknown error',
        responseTime: dbResponseTime,
      });
      throw error;
    }
  }

  /**
   * Increment failure count for a target
   */
  async incrementFailureCount(targetId: number): Promise<void> {
    const startTime = Date.now();
    
    try {
      await this.prisma.notificationTarget.update({
        where: { id: targetId },
        data: {
          failureCount: { increment: 1 },
          lastUsedAt: new Date(),
        },
      });

      const responseTime = Date.now() - startTime;
      dbLogger.debug('Incremented failure count', {
        targetId,
        responseTime,
      });
    } catch (error) {
      const responseTime = Date.now() - startTime;
      dbLogger.error('Error incrementing failure count', {
        targetId,
        error: error instanceof Error ? error.message : 'Unknown error',
        responseTime,
      });
      throw error;
    }
  }

  /**
   * Reset failure count for a target
   */
  async resetFailureCount(targetId: number): Promise<void> {
    const startTime = Date.now();
    
    try {
      await this.prisma.notificationTarget.update({
        where: { id: targetId },
        data: {
          failureCount: 0,
          lastUsedAt: new Date(),
        },
      });

      const responseTime = Date.now() - startTime;
      dbLogger.debug('Reset failure count', {
        targetId,
        responseTime,
      });
    } catch (error) {
      const responseTime = Date.now() - startTime;
      dbLogger.error('Error resetting failure count', {
        targetId,
        error: error instanceof Error ? error.message : 'Unknown error',
        responseTime,
      });
      throw error;
    }
  }

  /**
   * Find notification logs by job ID
   */
  async findLogsByJobId(jobId: string): Promise<NotificationLog[]> {
    const startTime = Date.now();
    
    try {
      const logs = await this.prisma.notificationLog.findMany({
        where: { jobId },
        include: { target: true },
        orderBy: { createdAt: 'desc' },
      });

      const responseTime = Date.now() - startTime;
      dbLogger.debug('Found logs by job ID', {
        jobId,
        count: logs.length,
        responseTime,
      });

      return logs;
    } catch (error) {
      const responseTime = Date.now() - startTime;
      dbLogger.error('Error finding logs by job ID', {
        jobId,
        error: error instanceof Error ? error.message : 'Unknown error',
        responseTime,
      });
      throw error;
    }
  }

  /**
   * Find message template by name and platform
   */
  async findTemplate(name: string, platform: string): Promise<MessageTemplate | null> {
    const startTime = Date.now();
    
    try {
      const template = await this.prisma.messageTemplate.findFirst({
        where: { 
          name, 
          platform, 
          active: true 
        },
      });

      const responseTime = Date.now() - startTime;
      dbLogger.debug('Found template', {
        name,
        platform,
        found: !!template,
        responseTime,
      });

      return template;
    } catch (error) {
      const responseTime = Date.now() - startTime;
      dbLogger.error('Error finding template', {
        name,
        platform,
        error: error instanceof Error ? error.message : 'Unknown error',
        responseTime,
      });
      throw error;
    }
  }

  /**
   * Clean up expired deduplication records
   */
  async cleanupExpiredDeduplication(): Promise<number> {
    const startTime = Date.now();
    
    try {
      const result = await this.prisma.messageDeduplication.deleteMany({
        where: {
          expiresAt: {
            lt: new Date(),
          },
        },
      });

      const responseTime = Date.now() - startTime;
      dbLogger.info('Cleaned up expired deduplication records', {
        deletedCount: result.count,
        responseTime,
      });

      return result.count;
    } catch (error) {
      const responseTime = Date.now() - startTime;
      dbLogger.error('Error cleaning up expired deduplication records', {
        error: error instanceof Error ? error.message : 'Unknown error',
        responseTime,
      });
      throw error;
    }
  }

  /**
   * Get database health status
   */
  async getHealthStatus(): Promise<{ healthy: boolean; responseTime: number; error?: string }> {
    const startTime = Date.now();
    
    try {
      // Simple query to test database connectivity
      await this.prisma.$queryRaw`SELECT 1`;
      
      const responseTime = Date.now() - startTime;
      return { healthy: true, responseTime };
    } catch (error) {
      const responseTime = Date.now() - startTime;
      return {
        healthy: false,
        responseTime,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Close database connection
   */
  async disconnect(): Promise<void> {
    try {
      await this.prisma.$disconnect();
      dbLogger.info('Database connection closed');
    } catch (error) {
      dbLogger.error('Error closing database connection', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Setup Prisma event listeners for logging
   */
  private setupEventListeners(): void {
    this.prisma.$on('query', (e) => {
      dbLogger.debug('Database query', {
        query: e.query,
        params: e.params,
        duration: e.duration,
      });
    });

    this.prisma.$on('error', (e) => {
      dbLogger.error('Database error', {
        message: e.message,
        target: e.target,
      });
    });

    this.prisma.$on('info', (e) => {
      dbLogger.info('Database info', {
        message: e.message,
        target: e.target,
      });
    });

    this.prisma.$on('warn', (e) => {
      dbLogger.warn('Database warning', {
        message: e.message,
        target: e.target,
      });
    });

    dbLogger.info('Database event listeners setup complete');
  }
}

// Export singleton instance
export const databaseService = DatabaseService.getInstance();

export default DatabaseService;
