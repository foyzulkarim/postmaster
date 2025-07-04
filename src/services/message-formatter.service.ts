import { BroadcastMessage } from '../api/v1/broadcast/broadcast.schema';
import { SlackFormatter } from '../formatters/slack.formatter';
import { DiscordFormatter } from '../formatters/discord.formatter';
import { TelegramFormatter } from '../formatters/telegram.formatter';
import { databaseService } from './db.service';
import { workerLogger } from '../utils/logger';

export interface FormattedMessage {
  content: string;
  // Platform-specific fields
  attachments?: any[]; // Slack
  embeds?: any[]; // Discord
  parseMode?: string; // Telegram
  blocks?: any[]; // Slack blocks
  [key: string]: any; // Allow additional platform-specific fields
}

export interface PlatformFormatter {
  format(message: BroadcastMessage, format?: string): FormattedMessage;
  formatWithTemplate(message: BroadcastMessage, template: any, variables?: Record<string, any>): FormattedMessage;
}

export class MessageFormatterService {
  private formatters = new Map<string, PlatformFormatter>();

  constructor() {
    this.initializeFormatters();
  }

  /**
   * Format message for a specific platform
   */
  formatForPlatform(
    message: BroadcastMessage,
    platform: string,
    format?: string,
    templateName?: string
  ): FormattedMessage {
    try {
      const formatter = this.getFormatter(platform);
      
      // If template is specified, try to use it
      if (templateName) {
        return this.formatWithTemplate(message, platform, templateName);
      }

      // Use regular formatting
      return formatter.format(message, format);
      
    } catch (error) {
      workerLogger.error('Error formatting message for platform', {
        platform,
        format,
        templateName,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      
      // Fallback to plain text formatting
      return this.createFallbackMessage(message);
    }
  }

  /**
   * Format message using a template
   */
  private async formatWithTemplate(
    message: BroadcastMessage,
    platform: string,
    templateName: string
  ): Promise<FormattedMessage> {
    try {
      // Get template from database
      const template = await databaseService.findTemplate(templateName, platform);
      
      if (!template) {
        workerLogger.warn('Template not found, using default formatting', {
          templateName,
          platform,
        });
        return this.getFormatter(platform).format(message);
      }

      const templateData = JSON.parse(template.template);
      const requiredVars = JSON.parse(template.variables);
      
      // Create variables from message
      const variables = this.createTemplateVariables(message);
      
      // Validate required variables
      this.validateTemplateVariables(requiredVars, variables, templateName);
      
      // Use formatter to apply template
      const formatter = this.getFormatter(platform);
      return formatter.formatWithTemplate(message, templateData, variables);
      
    } catch (error) {
      workerLogger.error('Error formatting with template', {
        templateName,
        platform,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      
      // Fallback to regular formatting
      return this.getFormatter(platform).format(message);
    }
  }

  /**
   * Get formatter for platform
   */
  private getFormatter(platform: string): PlatformFormatter {
    const formatter = this.formatters.get(platform);
    if (!formatter) {
      throw new Error(`No formatter found for platform: ${platform}`);
    }
    return formatter;
  }

  /**
   * Initialize platform formatters
   */
  private initializeFormatters(): void {
    this.formatters.set('slack', new SlackFormatter());
    this.formatters.set('discord', new DiscordFormatter());
    this.formatters.set('telegram', new TelegramFormatter());
    
    workerLogger.debug('Message formatters initialized', {
      platforms: Array.from(this.formatters.keys()),
    });
  }

  /**
   * Create template variables from message
   */
  private createTemplateVariables(message: BroadcastMessage): Record<string, any> {
    return {
      title: message.title || '',
      content: message.content,
      format: message.format || 'plain',
      timestamp: new Date().toISOString(),
      // Add more variables as needed
    };
  }

  /**
   * Validate template variables
   */
  private validateTemplateVariables(
    required: string[],
    provided: Record<string, any>,
    templateName: string
  ): void {
    const missing = required.filter(key => !(key in provided) || provided[key] === undefined);
    
    if (missing.length > 0) {
      throw new Error(`Missing required template variables for ${templateName}: ${missing.join(', ')}`);
    }
  }

  /**
   * Create fallback message when formatting fails
   */
  private createFallbackMessage(message: BroadcastMessage): FormattedMessage {
    let content = message.content;
    
    if (message.title) {
      content = `${message.title}\n\n${content}`;
    }
    
    return {
      content,
    };
  }

  /**
   * Validate message size for platform
   */
  validateMessageSize(message: FormattedMessage, platform: string): boolean {
    const limits = {
      slack: 4000,
      discord: 2000,
      telegram: 4096,
    };

    const limit = limits[platform as keyof typeof limits] || 1000;
    return message.content.length <= limit;
  }

  /**
   * Truncate message if too long
   */
  truncateMessage(message: FormattedMessage, platform: string): FormattedMessage {
    const limits = {
      slack: 4000,
      discord: 2000,
      telegram: 4096,
    };

    const limit = limits[platform as keyof typeof limits] || 1000;
    
    if (message.content.length <= limit) {
      return message;
    }

    const truncated = message.content.substring(0, limit - 10) + '... (truncated)';
    
    return {
      ...message,
      content: truncated,
    };
  }

  /**
   * Get supported platforms
   */
  getSupportedPlatforms(): string[] {
    return Array.from(this.formatters.keys());
  }

  /**
   * Get formatter statistics
   */
  getStats() {
    return {
      supportedPlatforms: this.getSupportedPlatforms(),
      formattersCount: this.formatters.size,
    };
  }
}

export default MessageFormatterService;
