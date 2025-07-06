import { NotificationTarget } from '@prisma/client';
import { FormattedMessage } from '../services/message-formatter.service';
import { RateLimiterService } from '../services/rate-limiter.service';
import { adapterLogger } from '../utils/logger';
import { ErrorType, PlatformError, RateLimitError } from '../types/errors.types';

export abstract class BasePlatformAdapter {
  protected targets: NotificationTarget[];
  protected rateLimiter: RateLimiterService;
  protected logger = adapterLogger;
  protected platform: string;

  constructor(targets: NotificationTarget[], platform: string) {
    this.targets = targets;
    this.platform = platform;
    this.rateLimiter = new RateLimiterService();
    
    this.logger.debug('Initialized platform adapter', {
      platform: this.platform,
      targetsCount: targets.length,
    });
  }

  /**
   * Abstract method to send message to channels
   * Must be implemented by each platform adapter
   */
  abstract send(message: FormattedMessage, channels: string[]): Promise<void>;

  /**
   * Get webhook URL for a specific channel/target
   */
  protected getWebhookUrl(channelOrTargetName: string): string {
    // First try to find by exact channel match in config
    for (const target of this.targets) {
      try {
        const config = JSON.parse(target.config);
        if (config.channel === channelOrTargetName || config.chat_id === channelOrTargetName) {
          return target.webhookUrl;
        }
      } catch (error) {
        this.logger.warn('Invalid target config JSON', {
          targetId: target.id,
          targetName: target.name,
        });
      }
    }

    // Then try to find by target name
    const target = this.targets.find(t => t.name === channelOrTargetName);
    if (target) {
      return target.webhookUrl;
    }

    // Finally, use the first available target as fallback
    if (this.targets.length > 0) {
      this.logger.warn('Using fallback target for channel', {
        channel: channelOrTargetName,
        fallbackTarget: this.targets[0].name,
      });
      return this.targets[0].webhookUrl;
    }

    throw new PlatformError(
      `No webhook URL found for channel: ${channelOrTargetName}`,
      this.platform,
      undefined,
      false,
      ErrorType.INVALID_WEBHOOK
    );
  }

  /**
   * Get target configuration for a specific channel
   */
  protected getTargetConfig(channelOrTargetName: string): any {
    const target = this.targets.find(t => 
      t.name === channelOrTargetName || 
      JSON.parse(t.config || '{}').channel === channelOrTargetName ||
      JSON.parse(t.config || '{}').chat_id === channelOrTargetName
    );

    if (target) {
      try {
        return JSON.parse(target.config || '{}');
      } catch (error) {
        this.logger.warn('Invalid target config JSON, using empty config', {
          targetName: target.name,
        });
        return {};
      }
    }

    return {};
  }

  /**
   * Handle rate limiting errors
   */
  protected async handleRateLimit(error: any): Promise<void> {
    if (this.isRateLimitError(error)) {
      const retryAfter = this.extractRetryAfter(error);
      
      this.logger.warn('Rate limit encountered', {
        platform: this.platform,
        retryAfter,
      });
      
      throw new RateLimitError(`Rate limited, retry after ${retryAfter}s`, retryAfter);
    }
  }

  /**
   * Check if error is a rate limit error
   */
  protected isRateLimitError(error: any): boolean {
    if (error.status === 429 || error.statusCode === 429) {
      return true;
    }
    
    const message = error.message?.toLowerCase() || '';
    return message.includes('rate limit') || message.includes('too many requests');
  }

  /**
   * Extract retry-after value from rate limit error
   */
  protected extractRetryAfter(error: any): number {
    // Try to get from headers
    if (error.response?.headers) {
      const retryAfter = error.response.headers['retry-after'] || 
                        error.response.headers['Retry-After'];
      if (retryAfter) {
        return parseInt(retryAfter, 10) || 60;
      }
    }

    // Try to parse from error message
    const message = error.message || '';
    const match = message.match(/retry.*?(\d+)/i);
    if (match) {
      return parseInt(match[1], 10) || 60;
    }

    // Default retry after 60 seconds
    return 60;
  }

  /**
   * Categorize error type for proper handling
   */
  protected categorizeError(error: any): ErrorType {
    if (error.status || error.statusCode) {
      const statusCode = error.status || error.statusCode;
      
      if (statusCode === 429) {
        return ErrorType.RATE_LIMITED;
      }
      
      if (statusCode >= 400 && statusCode < 500) {
        // Client errors are usually permanent
        if (statusCode === 404) {
          return ErrorType.INVALID_WEBHOOK;
        }
        return ErrorType.PERMANENT_FAILURE;
      }
      
      if (statusCode >= 500) {
        // Server errors are usually retryable
        return ErrorType.PLATFORM_DOWN;
      }
    }

    // Check error message for common patterns
    const message = error.message?.toLowerCase() || '';
    
    if (message.includes('rate limit') || message.includes('too many requests')) {
      return ErrorType.RATE_LIMITED;
    }
    
    if (message.includes('webhook') && (message.includes('invalid') || message.includes('not found'))) {
      return ErrorType.INVALID_WEBHOOK;
    }
    
    if (message.includes('payload too large') || message.includes('message too long')) {
      return ErrorType.MESSAGE_TOO_LARGE;
    }
    
    if (message.includes('network') || message.includes('timeout') || message.includes('connection')) {
      return ErrorType.PLATFORM_DOWN;
    }

    return ErrorType.UNKNOWN_ERROR;
  }

  /**
   * Check if error is retryable
   */
  protected isRetryable(error: any): boolean {
    const errorType = this.categorizeError(error);
    
    switch (errorType) {
      case ErrorType.RATE_LIMITED:
      case ErrorType.PLATFORM_DOWN:
      case ErrorType.UNKNOWN_ERROR:
        return true;
      case ErrorType.INVALID_WEBHOOK:
      case ErrorType.MESSAGE_TOO_LARGE:
      case ErrorType.PERMANENT_FAILURE:
        return false;
      default:
        return false;
    }
  }

  /**
   * Create platform-specific error
   */
  protected createPlatformError(
    message: string,
    statusCode?: number,
    originalError?: any
  ): PlatformError {
    const errorType = this.categorizeError(originalError || { statusCode });
    const retryable = this.isRetryable(originalError || { statusCode });
    
    return new PlatformError(
      message,
      this.platform,
      statusCode,
      retryable,
      errorType
    );
  }

  /**
   * Validate message before sending
   */
  protected validateMessage(message: FormattedMessage): void {
    if (!message.content || message.content.trim().length === 0) {
      throw new PlatformError(
        'Message content cannot be empty',
        this.platform,
        400,
        false,
        ErrorType.PERMANENT_FAILURE
      );
    }
  }

  /**
   * Log successful send
   */
  protected logSuccess(channel: string, responseTime: number): void {
    this.logger.debug('Message sent successfully', {
      platform: this.platform,
      channel,
      responseTime,
    });
  }

  /**
   * Log send failure
   */
  protected logFailure(channel: string, error: any, responseTime: number): void {
    this.logger.error('Failed to send message', {
      platform: this.platform,
      channel,
      error: error instanceof Error ? error.message : 'Unknown error',
      responseTime,
    });
  }

  /**
   * Get adapter statistics
   */
  getStats() {
    return {
      platform: this.platform,
      targetsCount: this.targets.length,
      targets: this.targets.map(t => ({
        name: t.name,
        active: t.active,
        failureCount: t.failureCount,
        lastUsedAt: t.lastUsedAt,
      })),
    };
  }

  /**
   * Close adapter resources
   */
  async close(): Promise<void> {
    try {
      // Close rate limiter if needed
      await this.rateLimiter.close();
      
      this.logger.debug('Platform adapter closed', {
        platform: this.platform,
      });
    } catch (error) {
      this.logger.error('Error closing platform adapter', {
        platform: this.platform,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
}

export default BasePlatformAdapter;
