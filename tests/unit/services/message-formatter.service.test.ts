import { MessageFormatterService } from '../../../src/services/message-formatter.service';
import { BroadcastMessage } from '../../../src/api/v1/broadcast/broadcast.schema';

describe('MessageFormatterService', () => {
  let service: MessageFormatterService;

  beforeEach(() => {
    service = new MessageFormatterService();
  });

  describe('formatForPlatform', () => {
    const testMessage: BroadcastMessage = {
      title: 'Test Title',
      content: 'Test content message',
      format: 'plain',
    };

    it('should format message for Slack', () => {
      const result = service.formatForPlatform(testMessage, 'slack');
      
      expect(result).toBeDefined();
      expect(result.content).toBe(testMessage.content);
    });

    it('should format message for Discord', () => {
      const result = service.formatForPlatform(testMessage, 'discord');
      
      expect(result).toBeDefined();
      expect(result.content).toBe(testMessage.content);
    });

    it('should format message for Telegram', () => {
      const result = service.formatForPlatform(testMessage, 'telegram');
      
      expect(result).toBeDefined();
      expect(result.content).toBe(testMessage.content);
    });

    it('should throw error for unsupported platform', () => {
      expect(() => {
        service.formatForPlatform(testMessage, 'unsupported');
      }).toThrow('No formatter found for platform: unsupported');
    });

    it('should handle message with only content', () => {
      const simpleMessage: BroadcastMessage = {
        content: 'Simple message',
      };

      const result = service.formatForPlatform(simpleMessage, 'slack');
      
      expect(result).toBeDefined();
      expect(result.content).toBe('Simple message');
    });

    it('should handle message with title and content', () => {
      const messageWithTitle: BroadcastMessage = {
        title: 'Important Notice',
        content: 'This is the message body',
      };

      const result = service.formatForPlatform(messageWithTitle, 'slack');
      
      expect(result).toBeDefined();
      expect(result.content).toBe('This is the message body');
    });
  });

  describe('validateMessageSize', () => {
    it('should validate Slack message size', () => {
      const shortMessage = { content: 'Short message' };
      const longMessage = { content: 'x'.repeat(5000) };

      expect(service.validateMessageSize(shortMessage, 'slack')).toBe(true);
      expect(service.validateMessageSize(longMessage, 'slack')).toBe(false);
    });

    it('should validate Discord message size', () => {
      const shortMessage = { content: 'Short message' };
      const longMessage = { content: 'x'.repeat(2500) };

      expect(service.validateMessageSize(shortMessage, 'discord')).toBe(true);
      expect(service.validateMessageSize(longMessage, 'discord')).toBe(false);
    });

    it('should validate Telegram message size', () => {
      const shortMessage = { content: 'Short message' };
      const longMessage = { content: 'x'.repeat(5000) };

      expect(service.validateMessageSize(shortMessage, 'telegram')).toBe(true);
      expect(service.validateMessageSize(longMessage, 'telegram')).toBe(false);
    });
  });

  describe('truncateMessage', () => {
    it('should truncate long Slack message', () => {
      const longMessage = { content: 'x'.repeat(5000) };
      const result = service.truncateMessage(longMessage, 'slack');

      expect(result.content.length).toBeLessThanOrEqual(4000);
      expect(result.content).toContain('... (truncated)');
    });

    it('should not truncate short message', () => {
      const shortMessage = { content: 'Short message' };
      const result = service.truncateMessage(shortMessage, 'slack');

      expect(result.content).toBe('Short message');
    });

    it('should truncate Discord message correctly', () => {
      const longMessage = { content: 'x'.repeat(2500) };
      const result = service.truncateMessage(longMessage, 'discord');

      expect(result.content.length).toBeLessThanOrEqual(2000);
      expect(result.content).toContain('... (truncated)');
    });
  });

  describe('getSupportedPlatforms', () => {
    it('should return list of supported platforms', () => {
      const platforms = service.getSupportedPlatforms();

      expect(platforms).toContain('slack');
      expect(platforms).toContain('discord');
      expect(platforms).toContain('telegram');
      expect(platforms.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe('createTemplateVariables', () => {
    it('should create template variables from message', () => {
      const message: BroadcastMessage = {
        title: 'Test Title',
        content: 'Test content',
        format: 'markdown',
      };

      const variables = service.createTemplateVariables(message);

      expect(variables.title).toBe('Test Title');
      expect(variables.content).toBe('Test content');
      expect(variables.format).toBe('markdown');
      expect(variables.timestamp).toBeDefined();
      expect(variables.date).toBeDefined();
      expect(variables.time).toBeDefined();
    });

    it('should handle message without title', () => {
      const message: BroadcastMessage = {
        content: 'Test content',
      };

      const variables = service.createTemplateVariables(message);

      expect(variables.title).toBe('');
      expect(variables.content).toBe('Test content');
      expect(variables.format).toBe('plain');
    });

    it('should include metadata in variables', () => {
      const message: BroadcastMessage = {
        content: 'Test content',
      };
      const metadata = {
        source: 'test-app',
        user_id: '123',
      };

      const variables = service.createTemplateVariables(message, metadata);

      expect(variables.source).toBe('test-app');
      expect(variables.user_id).toBe('123');
    });
  });

  describe('getStats', () => {
    it('should return service statistics', () => {
      const stats = service.getStats();

      expect(stats.supportedPlatforms).toContain('slack');
      expect(stats.supportedPlatforms).toContain('discord');
      expect(stats.supportedPlatforms).toContain('telegram');
      expect(stats.formattersCount).toBeGreaterThanOrEqual(3);
    });
  });
});
