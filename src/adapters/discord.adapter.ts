import { NotificationTarget } from '@prisma/client';
import { BasePlatformAdapter } from './base.adapter';
import { FormattedMessage } from '../services/message-formatter.service';
import { PlatformError, ErrorType } from '../jobs/notification.worker';

export interface DiscordMessage {
  content?: string;
  username?: string;
  avatar_url?: string;
  tts?: boolean;
  embeds?: DiscordEmbed[];
  allowed_mentions?: DiscordAllowedMentions;
}

export interface DiscordEmbed {
  title?: string;
  type?: string;
  description?: string;
  url?: string;
  timestamp?: string;
  color?: number;
  footer?: DiscordEmbedFooter;
  image?: DiscordEmbedImage;
  thumbnail?: DiscordEmbedThumbnail;
  author?: DiscordEmbedAuthor;
  fields?: DiscordEmbedField[];
}

export interface DiscordEmbedFooter {
  text: string;
  icon_url?: string;
}

export interface DiscordEmbedImage {
  url: string;
  height?: number;
  width?: number;
}

export interface DiscordEmbedThumbnail {
  url: string;
  height?: number;
  width?: number;
}

export interface DiscordEmbedAuthor {
  name: string;
  url?: string;
  icon_url?: string;
}

export interface DiscordEmbedField {
  name: string;
  value: string;
  inline?: boolean;
}

export interface DiscordAllowedMentions {
  parse?: string[];
  roles?: string[];
  users?: string[];
  replied_user?: boolean;
}

export class DiscordAdapter extends BasePlatformAdapter {
  constructor(targets: NotificationTarget[]) {
    super(targets, 'discord');
  }

  /**
   * Send message to Discord channels
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
      this.logger.warn('Some Discord channels failed', {
        totalChannels: channels.length,
        failedChannels: errors.length,
        successfulChannels: channels.length - errors.length,
      });
    }
  }

  /**
   * Send message to a specific Discord channel
   */
  private async sendToChannel(message: FormattedMessage, channel: string): Promise<void> {
    try {
      const webhookUrl = this.getWebhookUrl(channel);
      const config = this.getTargetConfig(channel);
      
      // Build Discord message payload
      const discordMessage = this.buildDiscordMessage(message, channel, config);
      
      // Validate message size
      this.validateDiscordMessage(discordMessage);

      // Send HTTP request to Discord webhook
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(discordMessage),
      });

      if (!response.ok) {
        await this.handleRateLimit({ status: response.status, response });
        
        let errorData: any = {};
        try {
          errorData = await response.json();
        } catch {
          errorData = { message: await response.text().catch(() => 'Unknown error') };
        }
        
        // Handle Discord-specific errors
        if (response.status === 404) {
          throw new PlatformError(
            `Discord webhook not found: ${channel}`,
            this.platform,
            404,
            false,
            ErrorType.INVALID_WEBHOOK
          );
        }
        
        if (response.status === 400) {
          const errorMessage = errorData.message || 'Bad request';
          throw new PlatformError(
            `Discord API validation error: ${errorMessage}`,
            this.platform,
            400,
            false,
            ErrorType.PERMANENT_FAILURE
          );
        }
        
        throw this.createPlatformError(
          `Discord API error: ${response.status} ${response.statusText} - ${errorData.message || 'Unknown error'}`,
          response.status,
          errorData
        );
      }

    } catch (error) {
      if (error instanceof PlatformError) {
        throw error;
      }
      
      // Handle network errors
      if (error instanceof TypeError && error.message.includes('fetch')) {
        throw new PlatformError(
          `Network error sending to Discord: ${error.message}`,
          this.platform,
          undefined,
          true,
          ErrorType.PLATFORM_DOWN
        );
      }
      
      throw this.createPlatformError(
        `Unexpected error sending to Discord: ${error instanceof Error ? error.message : 'Unknown error'}`,
        undefined,
        error
      );
    }
  }

  /**
   * Build Discord message from formatted message
   */
  private buildDiscordMessage(
    message: FormattedMessage,
    channel: string,
    config: any
  ): DiscordMessage {
    const discordMessage: DiscordMessage = {};

    // Add content if it fits Discord's limits
    if (message.content && message.content.length <= 2000) {
      discordMessage.content = message.content;
    }

    // Add bot configuration
    if (config.username) {
      discordMessage.username = config.username;
    }
    
    if (config.avatar_url) {
      discordMessage.avatar_url = config.avatar_url;
    }

    // Add embeds if present in formatted message
    if (message.embeds && Array.isArray(message.embeds)) {
      discordMessage.embeds = message.embeds;
    } else if (message.content && message.content.length > 2000) {
      // If content is too long for content field, put it in an embed
      discordMessage.embeds = [{
        description: message.content.substring(0, 4096), // Discord embed description limit
        color: 0x5865F2, // Discord blurple color
      }];
      discordMessage.content = undefined;
    }

    // Configure allowed mentions to be safe by default
    discordMessage.allowed_mentions = {
      parse: [], // Don't parse any mentions by default
    };

    return discordMessage;
  }

  /**
   * Validate Discord-specific message constraints
   */
  private validateDiscordMessage(message: DiscordMessage): void {
    // Validate content length
    if (message.content && message.content.length > 2000) {
      throw new PlatformError(
        `Discord message content too long: ${message.content.length} characters (max 2000)`,
        this.platform,
        413,
        false,
        ErrorType.MESSAGE_TOO_LARGE
      );
    }

    // Validate embeds
    if (message.embeds && Array.isArray(message.embeds)) {
      if (message.embeds.length > 10) {
        throw new PlatformError(
          `Too many Discord embeds: ${message.embeds.length} (max 10)`,
          this.platform,
          413,
          false,
          ErrorType.MESSAGE_TOO_LARGE
        );
      }

      // Validate each embed
      for (const embed of message.embeds) {
        this.validateDiscordEmbed(embed);
      }
    }

    // Validate total message size
    const messageSize = JSON.stringify(message).length;
    if (messageSize > 8000) {
      throw new PlatformError(
        `Discord message too large: ${messageSize} bytes (max ~8000)`,
        this.platform,
        413,
        false,
        ErrorType.MESSAGE_TOO_LARGE
      );
    }
  }

  /**
   * Validate Discord embed constraints
   */
  private validateDiscordEmbed(embed: DiscordEmbed): void {
    if (embed.title && embed.title.length > 256) {
      throw new PlatformError(
        `Discord embed title too long: ${embed.title.length} characters (max 256)`,
        this.platform,
        413,
        false,
        ErrorType.MESSAGE_TOO_LARGE
      );
    }

    if (embed.description && embed.description.length > 4096) {
      throw new PlatformError(
        `Discord embed description too long: ${embed.description.length} characters (max 4096)`,
        this.platform,
        413,
        false,
        ErrorType.MESSAGE_TOO_LARGE
      );
    }

    if (embed.fields && embed.fields.length > 25) {
      throw new PlatformError(
        `Too many Discord embed fields: ${embed.fields.length} (max 25)`,
        this.platform,
        413,
        false,
        ErrorType.MESSAGE_TOO_LARGE
      );
    }

    if (embed.fields) {
      for (const field of embed.fields) {
        if (field.name.length > 256) {
          throw new PlatformError(
            `Discord embed field name too long: ${field.name.length} characters (max 256)`,
            this.platform,
            413,
            false,
            ErrorType.MESSAGE_TOO_LARGE
          );
        }
        
        if (field.value.length > 1024) {
          throw new PlatformError(
            `Discord embed field value too long: ${field.value.length} characters (max 1024)`,
            this.platform,
            413,
            false,
            ErrorType.MESSAGE_TOO_LARGE
          );
        }
      }
    }

    if (embed.footer && embed.footer.text.length > 2048) {
      throw new PlatformError(
        `Discord embed footer too long: ${embed.footer.text.length} characters (max 2048)`,
        this.platform,
        413,
        false,
        ErrorType.MESSAGE_TOO_LARGE
      );
    }

    if (embed.author && embed.author.name.length > 256) {
      throw new PlatformError(
        `Discord embed author name too long: ${embed.author.name.length} characters (max 256)`,
        this.platform,
        413,
        false,
        ErrorType.MESSAGE_TOO_LARGE
      );
    }
  }

  /**
   * Validate Discord-specific message constraints
   */
  protected validateMessage(message: FormattedMessage): void {
    super.validateMessage(message);
    
    // Discord-specific validations
    if (message.content.length > 2000 && (!message.embeds || message.embeds.length === 0)) {
      throw new PlatformError(
        `Discord message too long: ${message.content.length} characters (max 2000 for content, use embeds for longer messages)`,
        this.platform,
        413,
        false,
        ErrorType.MESSAGE_TOO_LARGE
      );
    }
  }

  /**
   * Get Discord-specific adapter statistics
   */
  getStats() {
    const baseStats = super.getStats();
    
    return {
      ...baseStats,
      discordSpecific: {
        maxContentLength: 2000,
        maxEmbeds: 10,
        maxEmbedDescription: 4096,
        maxEmbedFields: 25,
        maxFieldNameLength: 256,
        maxFieldValueLength: 1024,
      },
    };
  }
}

export default DiscordAdapter;
