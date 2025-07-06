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
   * Health check method (alias for getHealthStatus for compatibility)
   */
  async healthCheck(): Promise<void> {
    const result = await this.getHealthStatus();
    if (!result.healthy) {
      throw new Error(result.error || 'Database health check failed');
    }
  }

  /**
   * Count total targets
   */
  async countTargets(): Promise<number> {
    const startTime = Date.now();
    
    try {
      const count = await this.prisma.notificationTarget.count();
      
      const responseTime = Date.now() - startTime;
      dbLogger.debug('Counted targets', {
        count,
        responseTime,
      });
      
      return count;
    } catch (error) {
      const responseTime = Date.now() - startTime;
      dbLogger.error('Error counting targets', {
        error: error instanceof Error ? error.message : 'Unknown error',
        responseTime,
      });
      throw error;
    }
  }

  /**
   * Count active targets
   */
  async countActiveTargets(): Promise<number> {
    const startTime = Date.now();
    
    try {
      const count = await this.prisma.notificationTarget.count({
        where: { active: true },
      });
      
      const responseTime = Date.now() - startTime;
      dbLogger.debug('Counted active targets', {
        count,
        responseTime,
      });
      
      return count;
    } catch (error) {
      const responseTime = Date.now() - startTime;
      dbLogger.error('Error counting active targets', {
        error: error instanceof Error ? error.message : 'Unknown error',
        responseTime,
      });
      throw error;
    }
  }

  /**
   * Count total logs
   */
  async countLogs(): Promise<number> {
    const startTime = Date.now();
    
    try {
      const count = await this.prisma.notificationLog.count();
      
      const responseTime = Date.now() - startTime;
      dbLogger.debug('Counted logs', {
        count,
        responseTime,
      });
      
      return count;
    } catch (error) {
      const responseTime = Date.now() - startTime;
      dbLogger.error('Error counting logs', {
        error: error instanceof Error ? error.message : 'Unknown error',
        responseTime,
      });
      throw error;
    }
  }

  /**
   * Count recent jobs within specified hours
   */
  async countRecentJobs(hours: number = 24): Promise<number> {
    const startTime = Date.now();
    
    try {
      const since = new Date(Date.now() - hours * 60 * 60 * 1000);
      
      // Get distinct job IDs for recent jobs
      const distinctJobs = await this.prisma.notificationLog.findMany({
        where: {
          createdAt: {
            gte: since,
          },
        },
        select: {
          jobId: true,
        },
        distinct: ['jobId'],
      });

      const count = distinctJobs.length;
      
      const responseTime = Date.now() - startTime;
      dbLogger.debug('Counted recent jobs', {
        hours,
        count,
        responseTime,
      });
      
      return count;
    } catch (error) {
      const responseTime = Date.now() - startTime;
      dbLogger.error('Error counting recent jobs', {
        hours,
        error: error instanceof Error ? error.message : 'Unknown error',
        responseTime,
      });
      throw error;
    }
  }

  /**
   * Get job logs (alias for findLogsByJobId for compatibility)
   */
  async getJobLogs(jobId: string): Promise<NotificationLog[]> {
    return this.findLogsByJobId(jobId);
  }

  /**
   * Find templates by platform
   */
  async findTemplatesByPlatform(platform?: string): Promise<MessageTemplate[]> {
    const startTime = Date.now();
    
    try {
      const whereClause = platform ? { platform, active: true } : { active: true };
      
      const templates = await this.prisma.messageTemplate.findMany({
        where: whereClause,
        orderBy: [
          { platform: 'asc' },
          { name: 'asc' },
        ],
      });

      const responseTime = Date.now() - startTime;
      dbLogger.debug('Found templates by platform', {
        platform: platform || 'all',
        count: templates.length,
        responseTime,
      });

      return templates;
    } catch (error) {
      const responseTime = Date.now() - startTime;
      dbLogger.error('Error finding templates by platform', {
        platform: platform || 'all',
        error: error instanceof Error ? error.message : 'Unknown error',
        responseTime,
      });
      throw error;
    }
  }

  /**
   * Create a new template
   */
  async createTemplate(templateData: {
    name: string;
    platform: string;
    template: string;
    variables: string;
    active: boolean;
  }): Promise<MessageTemplate> {
    const startTime = Date.now();
    
    try {
      const template = await this.prisma.messageTemplate.create({
        data: templateData,
      });

      const responseTime = Date.now() - startTime;
      dbLogger.debug('Created template', {
        templateId: template.id,
        name: template.name,
        platform: template.platform,
        responseTime,
      });

      return template;
    } catch (error) {
      const responseTime = Date.now() - startTime;
      dbLogger.error('Error creating template', {
        name: templateData.name,
        platform: templateData.platform,
        error: error instanceof Error ? error.message : 'Unknown error',
        responseTime,
      });
      throw error;
    }
  }

  /**
   * Update an existing template
   */
  async updateTemplate(
    name: string,
    platform: string,
    updateData: Partial<{
      template: string;
      variables: string;
      active: boolean;
    }>
  ): Promise<MessageTemplate> {
    const startTime = Date.now();
    
    try {
      const template = await this.prisma.messageTemplate.updateMany({
        where: { name, platform },
        data: {
          ...updateData,
          updatedAt: new Date(),
        },
      });

      if (template.count === 0) {
        throw new Error(`Template not found: ${name} for platform ${platform}`);
      }

      // Fetch the updated template
      const updatedTemplate = await this.prisma.messageTemplate.findFirst({
        where: { name, platform },
      });

      if (!updatedTemplate) {
        throw new Error(`Template not found after update: ${name} for platform ${platform}`);
      }

      const responseTime = Date.now() - startTime;
      dbLogger.debug('Updated template', {
        templateId: updatedTemplate.id,
        name,
        platform,
        responseTime,
      });

      return updatedTemplate;
    } catch (error) {
      const responseTime = Date.now() - startTime;
      dbLogger.error('Error updating template', {
        name,
        platform,
        error: error instanceof Error ? error.message : 'Unknown error',
        responseTime,
      });
      throw error;
    }
  }

  /**
   * Delete a template
   */
  async deleteTemplate(name: string, platform: string): Promise<void> {
    const startTime = Date.now();
    
    try {
      const result = await this.prisma.messageTemplate.deleteMany({
        where: { name, platform },
      });

      if (result.count === 0) {
        throw new Error(`Template not found: ${name} for platform ${platform}`);
      }

      const responseTime = Date.now() - startTime;
      dbLogger.debug('Deleted template', {
        name,
        platform,
        responseTime,
      });
    } catch (error) {
      const responseTime = Date.now() - startTime;
      dbLogger.error('Error deleting template', {
        name,
        platform,
        error: error instanceof Error ? error.message : 'Unknown error',
        responseTime,
      });
      throw error;
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
}

// Export singleton instance
export const databaseService = DatabaseService.getInstance();

export default DatabaseService;
