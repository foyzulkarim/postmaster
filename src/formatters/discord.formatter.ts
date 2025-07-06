import { BroadcastMessage } from '../api/v1/broadcast/broadcast.schema';
import { FormattedMessage, PlatformFormatter } from '../services/message-formatter.service';

export class DiscordFormatter implements PlatformFormatter {
  format(message: BroadcastMessage, format?: string): FormattedMessage {
    // Basic Discord message formatting
    const content = `**${message.title || 'Notification'}**\n${message.content}`;
    
    return {
      content,
      title: message.title || 'Notification',
      priority: message.priority || 'normal',
      tags: message.tags || [],
      platform: 'discord'
    };
  }

  formatWithTemplate(message: BroadcastMessage, template: any, variables?: Record<string, any>): FormattedMessage {
    // Basic template formatting for Discord
    return this.format(message);
  }
}
