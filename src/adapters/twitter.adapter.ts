import { NotificationTarget } from '@prisma/client';
import { TwitterApi, TweetV2PostTweetResult } from 'twitter-api-v2';
import { BasePlatformAdapter } from './base.adapter';
import { FormattedMessage } from '../services/message-formatter.service';
import { PlatformError, ErrorType } from '../types/errors.types';

export interface TwitterMessage {
  text: string;
  media?: {
    media_ids?: string[];
  };
  poll?: {
    options: string[];
    duration_minutes: number;
  };
  reply?: {
    in_reply_to_tweet_id: string;
  };
  quote_tweet_id?: string;
  geo?: {
    place_id: string;
  };
}

export interface TwitterCredentials {
  appKey: string;
  appSecret: string;
  accessToken: string;
  accessSecret: string;
  bearerToken?: string;
}

export class TwitterAdapter extends BasePlatformAdapter {
  private twitterClient: TwitterApi;
  private credentials: TwitterCredentials;

  constructor(targets: NotificationTarget[]) {
    super(targets, 'twitter');
    
    // Extract Twitter credentials from environment or target config
    this.credentials = this.extractCredentials();
    
    if (!this.credentials.appKey || !this.credentials.appSecret || 
        !this.credentials.accessToken || !this.credentials.accessSecret) {
      throw new Error('Twitter credentials not found in configuration');
    }

    // Initialize Twitter API client
    this.twitterClient = new TwitterApi({
      appKey: this.credentials.appKey,
      appSecret: this.credentials.appSecret,
      accessToken: this.credentials.accessToken,
      accessSecret: this.credentials.accessSecret,
    });
  }

  /**
   * Send message to Twitter (post tweets)
   */
  async send(message: FormattedMessage, channels: string[]): Promise<void> {
    this.validateMessage(message);

    const errors: Error[] = [];
    
    for (const channel of channels) {
      const startTime = Date.now();
      
      try {
        await this.sendToChannel(message, channel);
        this.logSuccess(channel, Date.now() - startTime);
      } catch (error) {
        this.logFailure(channel, error, Date.now() - startTime);
        errors.push(error instanceof Error ? error : new Error('Unknown error'));
      }
    }

    // If all channels failed, throw the first error
    if (errors.length === channels.length && errors.length > 0) {
      throw errors[0];
    }

    // If some channels failed, log warning but don't throw
    if (errors.length > 0) {
      this.logger.warn('Some Twitter channels failed', {
        totalChannels: channels.length,
        failedChannels: errors.length,
        successfulChannels: channels.length - errors.length,
      });
    }
  }

  /**
   * Send message to a specific Twitter channel (account/thread)
   */
  private async sendToChannel(message: FormattedMessage, channel: string): Promise<void> {
    try {
      const config = this.getTargetConfig(channel);
      
      // Build Twitter message payload
      const twitterMessage = this.buildTwitterMessage(message, channel, config);
      
      // Validate message constraints
      this.validateTwitterMessage(twitterMessage);

      // Post tweet using Twitter API v2
      const result: TweetV2PostTweetResult = await this.twitterClient.v2.tweet(twitterMessage);
      
      if (!result.data?.id) {
        throw new PlatformError(
          'Twitter API did not return tweet ID',
          this.platform,
          500,
          true,
          ErrorType.PLATFORM_DOWN
        );
      }

      this.logger.debug('Tweet posted successfully', {
        tweetId: result.data.id,
        channel,
        text: twitterMessage.text.substring(0, 50) + '...',
      });

    } catch (error) {
      if (error instanceof PlatformError) {
        throw error;
      }
      
      // Handle Twitter API specific errors
      if (error.code) {
        throw this.handleTwitterApiError(error, channel);
      }
      
      // Handle network errors
      if (error.message?.includes('fetch') || error.message?.includes('network')) {
        throw new PlatformError(
          `Network error sending to Twitter: ${error.message}`,
          this.platform,
          undefined,
          true,
          ErrorType.PLATFORM_DOWN
        );
      }
      
      throw this.createPlatformError(
        `Unexpected error sending to Twitter: ${error instanceof Error ? error.message : 'Unknown error'}`,
        undefined,
        error
      );
    }
  }

  /**
   * Build Twitter message from formatted message
   */
  private buildTwitterMessage(
    message: FormattedMessage,
    channel: string,
    config: any
  ): TwitterMessage {
    let text = message.content;
    
    // Add title if present and fits within character limit
    if (message.title && (message.title.length + text.length + 3) <= 280) {
      text = `${message.title}\n\n${text}`;
    }
    
    // Truncate if too long
    if (text.length > 280) {
      text = text.substring(0, 277) + '...';
    }

    const twitterMessage: TwitterMessage = {
      text,
    };

    // Add reply configuration if specified
    if (config.reply_to_tweet_id) {
      twitterMessage.reply = {
        in_reply_to_tweet_id: config.reply_to_tweet_id,
      };
    }

    // Add quote tweet if specified
    if (config.quote_tweet_id) {
      twitterMessage.quote_tweet_id = config.quote_tweet_id;
    }

    // Add location if specified
    if (config.place_id) {
      twitterMessage.geo = {
        place_id: config.place_id,
      };
    }

    return twitterMessage;
  }

  /**
   * Extract Twitter credentials from environment or config
   */
  private extractCredentials(): TwitterCredentials {
    // Try environment variables first
    const envCredentials = {
      appKey: process.env.TWITTER_API_KEY || process.env.TWITTER_APP_KEY || '',
      appSecret: process.env.TWITTER_API_SECRET || process.env.TWITTER_APP_SECRET || '',
      accessToken: process.env.TWITTER_ACCESS_TOKEN || '',
      accessSecret: process.env.TWITTER_ACCESS_SECRET || '',
      bearerToken: process.env.TWITTER_BEARER_TOKEN,
    };

    if (envCredentials.appKey && envCredentials.appSecret && 
        envCredentials.accessToken && envCredentials.accessSecret) {
      return envCredentials;
    }

    // Try to get from target configuration
    for (const target of this.targets) {
      try {
        const config = JSON.parse(target.config);
        if (config.credentials) {
          return {
            appKey: config.credentials.appKey || '',
            appSecret: config.credentials.appSecret || '',
            accessToken: config.credentials.accessToken || '',
            accessSecret: config.credentials.accessSecret || '',
            bearerToken: config.credentials.bearerToken,
          };
        }
      } catch {
        // Ignore JSON parse errors
      }
    }

    return envCredentials;
  }

  /**
   * Handle Twitter API specific errors
   */
  private handleTwitterApiError(error: any, channel: string): PlatformError {
    const errorCode = error.code || error.status || 0;
    const errorMessage = error.message || 'Unknown Twitter API error';
    
    // Rate limiting
    if (errorCode === 429 || errorMessage.includes('rate limit')) {
      const retryAfter = this.extractRetryAfter(error) || 900; // Default 15 minutes for Twitter
      throw new PlatformError(
        `Twitter rate limit exceeded: ${errorMessage}`,
        this.platform,
        429,
        true,
        ErrorType.RATE_LIMITED,
        { retryAfter, channel }
      );
    }

    // Authentication errors
    if (errorCode === 401 || errorCode === 403) {
      throw new PlatformError(
        `Twitter authentication error: ${errorMessage}`,
        this.platform,
        errorCode,
        false,
        ErrorType.UNAUTHORIZED,
        { channel }
      );
    }

    // Duplicate tweet
    if (errorCode === 403 && errorMessage.includes('duplicate')) {
      throw new PlatformError(
        `Duplicate tweet detected: ${errorMessage}`,
        this.platform,
        403,
        false,
        ErrorType.PERMANENT_FAILURE,
        { channel }
      );
    }

    // Tweet too long or other validation errors
    if (errorCode >= 400 && errorCode < 500) {
      throw new PlatformError(
        `Twitter validation error: ${errorMessage}`,
        this.platform,
        errorCode,
        false,
        ErrorType.PERMANENT_FAILURE,
        { channel }
      );
    }

    // Server errors
    if (errorCode >= 500) {
      throw new PlatformError(
        `Twitter server error: ${errorMessage}`,
        this.platform,
        errorCode,
        true,
        ErrorType.PLATFORM_DOWN,
        { channel }
      );
    }

    // Unknown error
    throw new PlatformError(
      `Twitter API error: ${errorMessage}`,
      this.platform,
      errorCode,
      true,
      ErrorType.UNKNOWN_ERROR,
      { channel }
    );
  }

  /**
   * Validate Twitter-specific message constraints
   */
  private validateTwitterMessage(message: TwitterMessage): void {
    // Validate tweet text length
    if (message.text.length > 280) {
      throw new PlatformError(
        `Twitter message too long: ${message.text.length} characters (max 280)`,
        this.platform,
        413,
        false,
        ErrorType.MESSAGE_TOO_LARGE
      );
    }

    // Validate text is not empty
    if (!message.text.trim()) {
      throw new PlatformError(
        'Twitter message text cannot be empty',
        this.platform,
        400,
        false,
        ErrorType.PERMANENT_FAILURE
      );
    }

    // Validate poll options if present
    if (message.poll) {
      if (message.poll.options.length < 2 || message.poll.options.length > 4) {
        throw new PlatformError(
          `Twitter poll must have 2-4 options, got ${message.poll.options.length}`,
          this.platform,
          400,
          false,
          ErrorType.PERMANENT_FAILURE
        );
      }

      if (message.poll.duration_minutes < 5 || message.poll.duration_minutes > 10080) {
        throw new PlatformError(
          `Twitter poll duration must be 5-10080 minutes, got ${message.poll.duration_minutes}`,
          this.platform,
          400,
          false,
          ErrorType.PERMANENT_FAILURE
        );
      }
    }
  }

  /**
   * Validate Twitter-specific message constraints
   */
  protected validateMessage(message: FormattedMessage): void {
    super.validateMessage(message);
    
    // Twitter-specific validations
    if (message.content.length > 280) {
      // Allow longer messages that will be truncated
      this.logger.warn('Message will be truncated for Twitter', {
        originalLength: message.content.length,
        maxLength: 280,
      });
    }
  }

  /**
   * Get Twitter-specific adapter statistics
   */
  getStats() {
    const baseStats = super.getStats();
    
    return {
      ...baseStats,
      twitterSpecific: {
        maxTweetLength: 280,
        maxPollOptions: 4,
        minPollOptions: 2,
        maxPollDuration: 10080, // minutes
        minPollDuration: 5, // minutes
        rateLimitWindow: 900, // 15 minutes
        credentials: {
          configured: !!(this.credentials.appKey && this.credentials.appSecret),
          hasAccessToken: !!this.credentials.accessToken,
          hasBearerToken: !!this.credentials.bearerToken,
        },
      },
    };
  }

  /**
   * Test Twitter API connection
   */
  async testConnection(): Promise<boolean> {
    try {
      const me = await this.twitterClient.v2.me();
      this.logger.info('Twitter API connection test successful', {
        userId: me.data?.id,
        username: me.data?.username,
      });
      return true;
    } catch (error) {
      this.logger.error('Twitter API connection test failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return false;
    }
  }
}

export default TwitterAdapter;
