import { BroadcastMessage } from '../api/v1/broadcast/broadcast.schema';
import { FormattedMessage, PlatformFormatter } from '../services/message-formatter.service';

export class TelegramFormatter implements PlatformFormatter {
  format(message: BroadcastMessage, format?: string): FormattedMessage {
    // Basic Telegram message formatting
    const content = `<b>${message.title || 'Notification'}</b>\n${message.content}`;
    
    return {
      content,
      title: message.title || 'Notification',
      priority: message.priority || 'normal',
      tags: message.tags || [],
      platform: 'telegram'
    };
  }

  formatWithTemplate(message: BroadcastMessage, template: any, variables?: Record<string, any>): FormattedMessage {
    // Basic template formatting for Telegram
    return this.format(message);
  }
}
