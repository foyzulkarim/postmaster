import { NotificationTarget } from '@prisma/client';
import { BasePlatformAdapter } from './base.adapter';
import { FormattedMessage } from '../services/message-formatter.service';
import { PlatformError, ErrorType } from '../jobs/notification.worker';

export interface SlackMessage {
  text?: string;
  channel?: string;
  username?: string;
  icon_emoji?: string;
  icon_url?: string;
  attachments?: SlackAttachment[];
  blocks?: SlackBlock[];
}

export interface SlackAttachment {
  color?: string;
  text?: string;
  title?: string;
  title_link?: string;
  fields?: SlackField[];
  mrkdwn_in?: string[];
  footer?: string;
  ts?: number;
}

export interface SlackField {
  title: string;
  value: string;
  short?: boolean;
}

export interface SlackBlock {
  type: string;
  text?: {
    type: string;
    text: string;
  };
  elements?: any[];
  fields?: any[];
}

export class SlackAdapter extends BasePlatformAdapter {
  constructor(targets: NotificationTarget[]) {
    super(targets, 'slack');
  }

  /**
   * Send message to Slack channels
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
      this.logger.warn('Some Slack channels failed', {
        totalChannels: channels.length,
        failedChannels: errors.length,
        successfulChannels: channels.length - errors.length,
      });
    }
  }

  /**
   * Send message to a specific Slack channel
   */
  private async sendToChannel(message: FormattedMessage, channel: string): Promise<void> {
    try {
      const webhookUrl = this.getWebhookUrl(channel);
      const config = this.getTargetConfig(channel);
      
      // Build Slack message payload
      const slackMessage = this.buildSlackMessage(message, channel, config);
      
      // Validate message size
      const messageSize = JSON.stringify(slackMessage).length;
      if (messageSize > 4000) {
        throw new PlatformError(
          `Message too large for Slack: ${messageSize} bytes (max 4000)`,
          this.platform,
          413,
          false,
          ErrorType.MESSAGE_TOO_LARGE
        );
      }

      // Send HTTP request to Slack webhook
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(slackMessage),
      });

      if (!response.ok) {
        await this.handleRateLimit({ status: response.status, response });
        
        const errorText = await response.text().catch(() => 'Unknown error');
        
        throw this.createPlatformError(
          `Slack API error: ${response.status} ${response.statusText} - ${errorText}`,
          response.status,
          { status: response.status, message: errorText }
        );
      }

      // Check for Slack-specific error responses
      const responseText = await response.text();
      if (responseText !== 'ok') {
        // Slack webhook returns specific error messages
        if (responseText.includes('channel_not_found')) {
          throw new PlatformError(
            `Slack channel not found: ${channel}`,
            this.platform,
            404,
            false,
            ErrorType.INVALID_WEBHOOK
          );
        }
        
        if (responseText.includes('invalid_payload')) {
          throw new PlatformError(
            `Invalid Slack payload: ${responseText}`,
            this.platform,
            400,
            false,
            ErrorType.PERMANENT_FAILURE
          );
        }
        
        throw new PlatformError(
          `Slack webhook error: ${responseText}`,
          this.platform,
          400,
          this.isSlackRetryableError(responseText)
        );
      }

    } catch (error) {
      if (error instanceof PlatformError) {
        throw error;
      }
      
      // Handle network errors
      if (error instanceof TypeError && error.message.includes('fetch')) {
        throw new PlatformError(
          `Network error sending to Slack: ${error.message}`,
          this.platform,
          undefined,
          true,
          ErrorType.PLATFORM_DOWN
        );
      }
      
      throw this.createPlatformError(
        `Unexpected error sending to Slack: ${error instanceof Error ? error.message : 'Unknown error'}`,
        undefined,
        error
      );
    }
  }

  /**
   * Build Slack message from formatted message
   */
  private buildSlackMessage(
    message: FormattedMessage,
    channel: string,
    config: any
  ): SlackMessage {
    const slackMessage: SlackMessage = {
      text: message.content,
    };

    // Add channel if specified in config
    if (config.channel) {
      slackMessage.channel = config.channel;
    }

    // Add bot configuration
    if (config.username) {
      slackMessage.username = config.username;
    }
    
    if (config.icon_emoji) {
      slackMessage.icon_emoji = config.icon_emoji;
    }
    
    if (config.icon_url) {
      slackMessage.icon_url = config.icon_url;
    }

    // Add attachments if present in formatted message
    if (message.attachments && Array.isArray(message.attachments)) {
      slackMessage.attachments = message.attachments;
    }

    // Add blocks if present in formatted message
    if (message.blocks && Array.isArray(message.blocks)) {
      slackMessage.blocks = message.blocks;
    }

    return slackMessage;
  }

  /**
   * Check if Slack error is retryable
   */
  private isSlackRetryableError(errorMessage: string): boolean {
    const retryableErrors = [
      'rate_limited',
      'timeout',
      'server_error',
      'service_unavailable',
    ];
    
    return retryableErrors.some(error => errorMessage.includes(error));
  }

  /**
   * Validate Slack-specific message constraints
   */
  protected validateMessage(message: FormattedMessage): void {
    super.validateMessage(message);
    
    // Slack-specific validations
    if (message.content.length > 4000) {
      throw new PlatformError(
        `Slack message too long: ${message.content.length} characters (max 4000)`,
        this.platform,
        413,
        false,
        ErrorType.MESSAGE_TOO_LARGE
      );
    }

    // Validate blocks if present
    if (message.blocks && Array.isArray(message.blocks)) {
      if (message.blocks.length > 50) {
        throw new PlatformError(
          `Too many Slack blocks: ${message.blocks.length} (max 50)`,
          this.platform,
          413,
          false,
          ErrorType.MESSAGE_TOO_LARGE
        );
      }
    }

    // Validate attachments if present
    if (message.attachments && Array.isArray(message.attachments)) {
      if (message.attachments.length > 20) {
        throw new PlatformError(
          `Too many Slack attachments: ${message.attachments.length} (max 20)`,
          this.platform,
          413,
          false,
          ErrorType.MESSAGE_TOO_LARGE
        );
      }
    }
  }

  /**
   * Get Slack-specific adapter statistics
   */
  getStats() {
    const baseStats = super.getStats();
    
    return {
      ...baseStats,
      slackSpecific: {
        maxMessageLength: 4000,
        maxBlocks: 50,
        maxAttachments: 20,
      },
    };
  }
}

export default SlackAdapter;
