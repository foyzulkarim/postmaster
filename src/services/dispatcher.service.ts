import { BroadcastRequest, BroadcastTarget } from '../api/v1/broadcast/broadcast.schema';
import { BasePlatformAdapter } from '../adapters/base.adapter';
import { SlackAdapter } from '../adapters/slack.adapter';
import { DiscordAdapter } from '../adapters/discord.adapter';
import { TelegramAdapter } from '../adapters/telegram.adapter';
import { MessageFormatterService, FormattedMessage } from './message-formatter.service';
import { RateLimiterService } from './rate-limiter.service';
import { databaseService } from './db.service';
import { platformConfigManager, PlatformTargetConfig } from '../config/platforms.config';
import { workerLogger } from '../utils/logger';
import { NotificationTarget } from '@prisma/client';

export class NoProvidersConfiguredError extends Error {
  constructor(message: string = 'No notification providers are configured') {
    super(message);
    this.name = 'NoProvidersConfiguredError';
  }
}

export class PlatformNotConfiguredError extends Error {
  constructor(platform: string) {
    super(`Platform "${platform}" is not configured`);
    this.name = 'PlatformNotConfiguredError';
  }
}

export interface DispatchResult {
  platform: string;
  status: 'success' | 'failed' | 'skipped';
  error?: string;
  responseTime?: number;
}

export class DispatcherService {
  private adapters = new Map<string, BasePlatformAdapter>();
  private formatter: MessageFormatterService;
  private rateLimiter: RateLimiterService;

  constructor() {
    this.formatter = new MessageFormatterService();
    this.rateLimiter = new RateLimiterService();
    this.initializeAdapters();
  }

  /**
   * Dispatch message to all specified platforms
   */
  async dispatch(payload: BroadcastRequest): Promise<DispatchResult[]> {
    const results: DispatchResult[] = [];
    
    workerLogger.info('Starting message dispatch', {
      targetsCount: payload.targets.length,
      platforms: payload.targets.map(t => t.platform),
    });

    // Validate that all requested platforms are configured
    for (const target of payload.targets) {
      if (!this.adapters.has(target.platform)) {
        throw new PlatformNotConfiguredError(target.platform);
      }
    }

    for (const target of payload.targets) {
      const result = await this.dispatchToTarget(payload, target);
      results.push(result);
    }

    // Check if all platforms failed
    const failedCount = results.filter(r => r.status === 'failed').length;
    const successCount = results.filter(r => r.status === 'success').length;
    
    workerLogger.info('Message dispatch completed', {
      totalTargets: results.length,
      successful: successCount,
      failed: failedCount,
      skipped: results.length - successCount - failedCount,
    });

    // If all platforms failed, throw error to trigger retry
    if (failedCount === results.length && results.length > 0) {
      throw new Error(`All ${results.length} platforms failed`);
    }

    return results;
  }

  /**
   * Dispatch message to a specific target
   */
  private async dispatchToTarget(
    payload: BroadcastRequest, 
    target: BroadcastTarget
  ): Promise<DispatchResult> {
    const startTime = Date.now();
    
    try {
      workerLogger.debug('Dispatching to target', {
        platform: target.platform,
        channelsCount: target.channels.length,
      });

      // Get platform adapter
      const adapter = this.getAdapter(target.platform);
      if (!adapter) {
        return {
          platform: target.platform,
          status: 'failed',
          error: `No adapter found for platform: ${target.platform}`,
          responseTime: Date.now() - startTime,
        };
      }

      // Check rate limits before sending
      try {
        await this.rateLimiter.checkLimit(target.platform);
      } catch (rateLimitError) {
        workerLogger.warn('Rate limit exceeded for platform', {
          platform: target.platform,
          error: rateLimitError instanceof Error ? rateLimitError.message : 'Unknown error',
        });
        
        return {
          platform: target.platform,
          status: 'failed',
          error: `Rate limit exceeded: ${rateLimitError instanceof Error ? rateLimitError.message : 'Unknown error'}`,
          responseTime: Date.now() - startTime,
        };
      }

      // Format message for the platform
      const formattedMessage = await this.formatMessage(payload, target);

      // Send message through adapter
      await adapter.send(formattedMessage, target.channels);

      const responseTime = Date.now() - startTime;
      
      workerLogger.debug('Successfully dispatched to target', {
        platform: target.platform,
        channelsCount: target.channels.length,
        responseTime,
      });

      return {
        platform: target.platform,
        status: 'success',
        responseTime,
      };

    } catch (error) {
      const responseTime = Date.now() - startTime;
      
      workerLogger.error('Failed to dispatch to target', {
        platform: target.platform,
        error: error instanceof Error ? error.message : 'Unknown error',
        responseTime,
      });

      return {
        platform: target.platform,
        status: 'failed',
        error: error instanceof Error ? error.message : 'Unknown error',
        responseTime,
      };
    }
  }

  /**
   * Get platform adapter
   */
  private getAdapter(platform: string): BasePlatformAdapter | undefined {
    return this.adapters.get(platform);
  }

  /**
   * Format message for specific platform and target
   */
  private async formatMessage(payload: BroadcastRequest, target: BroadcastTarget): Promise<FormattedMessage> {
    const format = target.format_override || payload.message.format || 'plain';
    
    return await this.formatter.formatForPlatform(
      payload.message,
      target.platform,
      format,
      target.template
    );
  }

  /**
   * Initialize platform adapters from configuration file
   */
  private async initializeAdapters(): Promise<void> {
    try {
      workerLogger.info('Initializing platform adapters from configuration file');

      // Check if any platforms are configured
      if (!platformConfigManager.hasConfiguredPlatforms()) {
        const error = new NoProvidersConfiguredError(
          'No notification providers are configured. Please check your platforms.yml configuration file.'
        );
        workerLogger.error('No providers configured', {
          configSummary: platformConfigManager.getConfigSummary(),
        });
        throw error;
      }

      const activePlatforms = platformConfigManager.getActivePlatforms();
      workerLogger.info('Found active platforms in configuration', {
        platforms: activePlatforms,
        totalPlatforms: activePlatforms.length,
      });

      // Initialize adapters for each configured platform
      for (const platform of activePlatforms) {
        try {
          const platformTargets = platformConfigManager.getPlatformConfig(platform);
          const activeTargets = platformTargets.filter(target => target.active !== false);

          if (activeTargets.length === 0) {
            workerLogger.warn(`No active targets found for platform: ${platform}`);
            continue;
          }

          // Convert config targets to NotificationTarget format for adapters
          const adapterTargets: NotificationTarget[] = activeTargets.map((target, index) => ({
            id: index + 1,
            name: target.name,
            platform: platform,
            webhookUrl: this.getWebhookUrl(platform, target),
            config: JSON.stringify(target.config || {}),
            active: true,
            rateLimitPerMinute: target.rate_limit || this.getDefaultRateLimit(platform),
            lastUsedAt: null,
            failureCount: 0,
            createdAt: new Date(),
            updatedAt: new Date(),
          }));

          // Initialize platform adapter
          const adapter = this.createPlatformAdapter(platform, adapterTargets, activeTargets);
          this.adapters.set(platform, adapter);

          workerLogger.info(`Initialized ${platform} adapter`, {
            platform,
            targetsCount: activeTargets.length,
            targetNames: activeTargets.map(t => t.name),
          });

        } catch (error) {
          workerLogger.error(`Failed to initialize adapter for platform: ${platform}`, {
            platform,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
          
          // Don't throw here - continue with other platforms
          // But log the error for debugging
        }
      }

      // Final check - ensure at least one adapter was initialized
      if (this.adapters.size === 0) {
        const error = new NoProvidersConfiguredError(
          'Failed to initialize any notification providers. Check your configuration and credentials.'
        );
        workerLogger.error('No adapters initialized', {
          configSummary: platformConfigManager.getConfigSummary(),
        });
        throw error;
      }

      workerLogger.info('Platform adapters initialization completed', {
        initializedPlatforms: Array.from(this.adapters.keys()),
        totalAdapters: this.adapters.size,
        configSummary: platformConfigManager.getConfigSummary(),
      });

    } catch (error) {
      if (error instanceof NoProvidersConfiguredError) {
        throw error; // Re-throw our custom errors
      }
      
      workerLogger.error('Failed to initialize adapters', {
        error: error instanceof Error ? error.message : 'Unknown error',
        configSummary: platformConfigManager.getConfigSummary(),
      });
      throw new Error(`Adapter initialization failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Create platform-specific adapter
   */
  private createPlatformAdapter(
    platform: string, 
    adapterTargets: NotificationTarget[], 
    configTargets: PlatformTargetConfig[]
  ): BasePlatformAdapter {
    switch (platform) {
      case 'slack':
        return new SlackAdapter(adapterTargets);
      
      case 'discord':
        return new DiscordAdapter(adapterTargets);
      
      case 'telegram':
        return new TelegramAdapter(adapterTargets);
      
      default:
        throw new Error(`Unsupported platform: ${platform}`);
    }
  }

  /**
   * Get webhook URL for platform target
   */
  private getWebhookUrl(platform: string, target: PlatformTargetConfig): string {
    switch (platform) {
      case 'slack':
      case 'discord':
        return target.webhook_url || '';
      
      case 'telegram':
        return `https://api.telegram.org/bot${target.bot_token}/sendMessage`;
      
      case 'twitter':
        return 'https://api.twitter.com/2/tweets';
      
      default:
        return target.webhook_url || '';
    }
  }

  /**
   * Get default rate limit for platform
   */
  private getDefaultRateLimit(platform: string): number {
    const defaults = {
      slack: 60,
      discord: 30,
      telegram: 30,
      twitter: 15,
    };
    return defaults[platform as keyof typeof defaults] || 30;
  }

  /**
   * Get dispatcher statistics
   */
  async getStats() {
    const rateLimiterStats = await this.rateLimiter.getStats();
    
    return {
      adapters: {
        total: this.adapters.size,
        platforms: Array.from(this.adapters.keys()),
      },
      rateLimiter: rateLimiterStats,
    };
  }

  /**
   * Close dispatcher resources
   */
  async close(): Promise<void> {
    try {
      // Close all adapters
      for (const [platform, adapter] of this.adapters) {
        try {
          await adapter.close();
          workerLogger.debug('Closed adapter', { platform });
        } catch (error) {
          workerLogger.warn('Error closing adapter', {
            platform,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      }

      // Close rate limiter
      await this.rateLimiter.close();

      workerLogger.info('DispatcherService resources closed');
    } catch (error) {
      workerLogger.error('Error closing DispatcherService resources', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
}

export default DispatcherService;
