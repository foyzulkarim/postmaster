import { NotificationTarget } from '@prisma/client';
import { BasePlatformAdapter } from './base.adapter';
import { FormattedMessage } from '../services/message-formatter.service';
import { PlatformError, ErrorType } from '../types/errors.types';

export interface TelegramMessage {
  chat_id: string | number;
  text: string;
  parse_mode?: 'Markdown' | 'MarkdownV2' | 'HTML';
  entities?: TelegramMessageEntity[];
  disable_web_page_preview?: boolean;
  disable_notification?: boolean;
  protect_content?: boolean;
  reply_to_message_id?: number;
  allow_sending_without_reply?: boolean;
  reply_markup?: TelegramReplyMarkup;
}

export interface TelegramMessageEntity {
  type: string;
  offset: number;
  length: number;
  url?: string;
  user?: TelegramUser;
  language?: string;
}

export interface TelegramUser {
  id: number;
  is_bot: boolean;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
}

export interface TelegramReplyMarkup {
  inline_keyboard?: TelegramInlineKeyboardButton[][];
  keyboard?: TelegramKeyboardButton[][];
  resize_keyboard?: boolean;
  one_time_keyboard?: boolean;
  input_field_placeholder?: string;
  selective?: boolean;
}

export interface TelegramInlineKeyboardButton {
  text: string;
  url?: string;
  callback_data?: string;
}

export interface TelegramKeyboardButton {
  text: string;
  request_contact?: boolean;
  request_location?: boolean;
}

export interface TelegramApiResponse {
  ok: boolean;
  result?: any;
  error_code?: number;
  description?: string;
}

export class TelegramAdapter extends BasePlatformAdapter {
  private botToken: string;

  constructor(targets: NotificationTarget[]) {
    super(targets, 'telegram');
    
    // Extract bot token from the first target's webhook URL or config
    this.botToken = this.extractBotToken();
    
    if (!this.botToken) {
      throw new Error('Telegram bot token not found in targets configuration');
    }
  }

  /**
   * Send message to Telegram chats
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
      this.logger.warn('Some Telegram channels failed', {
        totalChannels: channels.length,
        failedChannels: errors.length,
        successfulChannels: channels.length - errors.length,
      });
    }
  }

  /**
   * Send message to a specific Telegram chat
   */
  private async sendToChannel(message: FormattedMessage, channel: string): Promise<void> {
    try {
      const config = this.getTargetConfig(channel);
      
      // Build Telegram message payload
      const telegramMessage = this.buildTelegramMessage(message, channel, config);
      
      // Validate message size
      this.validateTelegramMessage(telegramMessage);

      // Send HTTP request to Telegram Bot API
      const apiUrl = `https://api.telegram.org/bot${this.botToken}/sendMessage`;
      
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(telegramMessage),
      });

      const responseData: TelegramApiResponse = await response.json() as TelegramApiResponse;

      if (!response.ok || !responseData.ok) {
        await this.handleRateLimit({ status: response.status, response });
        
        // Handle Telegram-specific errors
        const errorCode = responseData.error_code || response.status;
        const errorDescription = responseData.description || 'Unknown error';
        
        if (errorCode === 400) {
          if (errorDescription.includes('chat not found')) {
            throw new PlatformError(
              `Telegram chat not found: ${channel}`,
              this.platform,
              400,
              false,
              ErrorType.INVALID_WEBHOOK
            );
          }
          
          if (errorDescription.includes('message is too long')) {
            throw new PlatformError(
              `Telegram message too long: ${errorDescription}`,
              this.platform,
              400,
              false,
              ErrorType.MESSAGE_TOO_LARGE
            );
          }
          
          throw new PlatformError(
            `Telegram API validation error: ${errorDescription}`,
            this.platform,
            400,
            false,
            ErrorType.PERMANENT_FAILURE
          );
        }
        
        if (errorCode === 401) {
          throw new PlatformError(
            `Telegram bot token invalid: ${errorDescription}`,
            this.platform,
            401,
            false,
            ErrorType.INVALID_WEBHOOK
          );
        }
        
        if (errorCode === 403) {
          throw new PlatformError(
            `Telegram bot forbidden in chat ${channel}: ${errorDescription}`,
            this.platform,
            403,
            false,
            ErrorType.INVALID_WEBHOOK
          );
        }
        
        throw this.createPlatformError(
          `Telegram API error: ${errorCode} - ${errorDescription}`,
          errorCode,
          responseData
        );
      }

    } catch (error) {
      if (error instanceof PlatformError) {
        throw error;
      }
      
      // Handle network errors
      if (error instanceof TypeError && error.message.includes('fetch')) {
        throw new PlatformError(
          `Network error sending to Telegram: ${error.message}`,
          this.platform,
          undefined,
          true,
          ErrorType.PLATFORM_DOWN
        );
      }
      
      throw this.createPlatformError(
        `Unexpected error sending to Telegram: ${error instanceof Error ? error.message : 'Unknown error'}`,
        undefined,
        error
      );
    }
  }

  /**
   * Build Telegram message from formatted message
   */
  private buildTelegramMessage(
    message: FormattedMessage,
    channel: string,
    config: any
  ): TelegramMessage {
    const telegramMessage: TelegramMessage = {
      chat_id: config.chat_id || channel,
      text: message.content,
    };

    // Add parse mode if specified
    if (message.parseMode) {
      telegramMessage.parse_mode = message.parseMode as 'Markdown' | 'MarkdownV2' | 'HTML';
    } else if (config.parse_mode) {
      telegramMessage.parse_mode = config.parse_mode;
    }

    // Add other configuration options
    if (config.disable_web_page_preview !== undefined) {
      telegramMessage.disable_web_page_preview = config.disable_web_page_preview;
    }
    
    if (config.disable_notification !== undefined) {
      telegramMessage.disable_notification = config.disable_notification;
    }
    
    if (config.protect_content !== undefined) {
      telegramMessage.protect_content = config.protect_content;
    }

    return telegramMessage;
  }

  /**
   * Extract bot token from targets configuration
   */
  private extractBotToken(): string {
    // Try to get from environment variable first
    const envToken = process.env.TELEGRAM_BOT_TOKEN;
    if (envToken) {
      return envToken;
    }

    // Try to extract from webhook URLs
    for (const target of this.targets) {
      if (target.webhookUrl.includes('bot')) {
        const match = target.webhookUrl.match(/bot(\d+:[A-Za-z0-9_-]+)/);
        if (match) {
          return match[1];
        }
      }
      
      // Try to get from config
      try {
        const config = JSON.parse(target.config);
        if (config.bot_token) {
          return config.bot_token;
        }
      } catch {
        // Ignore JSON parse errors
      }
    }

    return '';
  }

  /**
   * Validate Telegram-specific message constraints
   */
  private validateTelegramMessage(message: TelegramMessage): void {
    // Validate message text length
    if (message.text.length > 4096) {
      throw new PlatformError(
        `Telegram message too long: ${message.text.length} characters (max 4096)`,
        this.platform,
        413,
        false,
        ErrorType.MESSAGE_TOO_LARGE
      );
    }

    // Validate chat_id
    if (!message.chat_id) {
      throw new PlatformError(
        'Telegram chat_id is required',
        this.platform,
        400,
        false,
        ErrorType.PERMANENT_FAILURE
      );
    }

    // Validate parse_mode
    if (message.parse_mode && !['Markdown', 'MarkdownV2', 'HTML'].includes(message.parse_mode)) {
      throw new PlatformError(
        `Invalid Telegram parse_mode: ${message.parse_mode}`,
        this.platform,
        400,
        false,
        ErrorType.PERMANENT_FAILURE
      );
    }
  }

  /**
   * Validate Telegram-specific message constraints
   */
  protected override validateMessage(message: FormattedMessage): void {
    super.validateMessage(message);
    
    // Telegram-specific validations
    if (message.content.length > 4096) {
      throw new PlatformError(
        `Telegram message too long: ${message.content.length} characters (max 4096)`,
        this.platform,
        413,
        false,
        ErrorType.MESSAGE_TOO_LARGE
      );
    }
  }

  /**
   * Get webhook URL for Telegram (not used, but required by base class)
   */
  protected override getWebhookUrl(channel: string): string {
    // Telegram uses Bot API, not webhooks, but we need to implement this
    return `https://api.telegram.org/bot${this.botToken}/sendMessage`;
  }

  /**
   * Get Telegram-specific adapter statistics
   */
  override getStats() {
    const baseStats = super.getStats();
    
    return {
      ...baseStats,
      telegramSpecific: {
        maxMessageLength: 4096,
        botToken: this.botToken ? '***' + this.botToken.slice(-4) : 'Not configured',
        supportedParseModes: ['Markdown', 'MarkdownV2', 'HTML'],
      },
    };
  }
}

export default TelegramAdapter;
