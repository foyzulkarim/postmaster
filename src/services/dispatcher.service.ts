import { BroadcastRequest, BroadcastTarget } from '../api/v1/broadcast/broadcast.schema';
import { BasePlatformAdapter } from '../adapters/base.adapter';
import { SlackAdapter } from '../adapters/slack.adapter';
import { DiscordAdapter } from '../adapters/discord.adapter';
import { TelegramAdapter } from '../adapters/telegram.adapter';
import { MessageFormatterService, FormattedMessage } from './message-formatter.service';
import { RateLimiterService } from './rate-limiter.service';
import { databaseService } from './db.service';
import { workerLogger } from '../utils/logger';

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
      const formattedMessage = this.formatMessage(payload, target);

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
  private formatMessage(payload: BroadcastRequest, target: BroadcastTarget): FormattedMessage {
    const format = target.format_override || payload.message.format || 'plain';
    
    return this.formatter.formatForPlatform(
      payload.message,
      target.platform,
      format,
      target.template
    );
  }

  /**
   * Initialize platform adapters
   */
  private async initializeAdapters(): Promise<void> {
    try {
      // Get active targets from database to configure adapters
      const activeTargets = await databaseService.findAllActiveTargets();
      
      // Group targets by platform
      const platformTargets = new Map<string, any[]>();
      for (const target of activeTargets) {
        if (!platformTargets.has(target.platform)) {
          platformTargets.set(target.platform, []);
        }
        platformTargets.get(target.platform)!.push(target);
      }

      // Initialize adapters for each platform
      for (const [platform, targets] of platformTargets) {
        try {
          let adapter: BasePlatformAdapter;
          
          switch (platform) {
            case 'slack':
              adapter = new SlackAdapter(targets);
              break;
            case 'discord':
              adapter = new DiscordAdapter(targets);
              break;
            case 'telegram':
              adapter = new TelegramAdapter(targets);
              break;
            default:
              workerLogger.warn('Unknown platform, skipping adapter initialization', {
                platform,
              });
              continue;
          }

          this.adapters.set(platform, adapter);
          
          workerLogger.debug('Initialized adapter for platform', {
            platform,
            targetsCount: targets.length,
          });
          
        } catch (error) {
          workerLogger.error('Failed to initialize adapter for platform', {
            platform,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      }

      workerLogger.info('Platform adapters initialized', {
        platforms: Array.from(this.adapters.keys()),
        totalAdapters: this.adapters.size,
      });

    } catch (error) {
      workerLogger.error('Failed to initialize adapters', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
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
