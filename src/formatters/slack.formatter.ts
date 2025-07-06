import { BroadcastMessage } from '../api/v1/broadcast/broadcast.schema';
import { FormattedMessage, PlatformFormatter } from '../services/message-formatter.service';

export class SlackFormatter implements PlatformFormatter {
  format(message: BroadcastMessage, format?: string): FormattedMessage {
    // Basic Slack message formatting
    const content = `*${message.title || 'Notification'}*\n${message.content}`;
    
    return {
      content,
      title: message.title || 'Notification',
      priority: message.priority || 'normal',
      tags: message.tags || [],
      platform: 'slack'
    };
  }

  formatWithTemplate(message: BroadcastMessage, template: any, variables?: Record<string, any>): FormattedMessage {
    // Basic template formatting for Slack
    return this.format(message);
  }
}
