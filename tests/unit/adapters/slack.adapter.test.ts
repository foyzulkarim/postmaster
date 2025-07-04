import { SlackAdapter } from '../../../src/adapters/slack.adapter';
import { NotificationTarget } from '@prisma/client';
import { FormattedMessage } from '../../../src/services/message-formatter.service';
import { PlatformError, ErrorType } from '../../../src/types/errors.types';

// Mock fetch
const mockFetch = global.fetch as jest.MockedFunction<typeof fetch>;

describe('SlackAdapter', () => {
  let adapter: SlackAdapter;
  let mockTargets: NotificationTarget[];

  beforeEach(() => {
    mockTargets = [
      {
        id: 1,
        name: 'general-slack',
        platform: 'slack',
        webhookUrl: 'https://hooks.slack.com/services/TEST/TEST/TEST',
        config: JSON.stringify({
          channel: '#general',
          username: 'Postmaster',
          icon_emoji: ':postbox:',
        }),
        active: true,
        rateLimitPerMinute: 60,
        lastUsedAt: null,
        failureCount: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];

    adapter = new SlackAdapter(mockTargets);
    mockFetch.mockClear();
  });

  describe('send', () => {
    const testMessage: FormattedMessage = {
      content: 'Test message content',
    };

    it('should send message successfully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: 'OK',
        text: jest.fn().mockResolvedValue('ok'),
      } as any);

      await expect(adapter.send(testMessage, ['#general'])).resolves.not.toThrow();

      expect(mockFetch).toHaveBeenCalledWith(
        'https://hooks.slack.com/services/TEST/TEST/TEST',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: expect.stringContaining('Test message content'),
        })
      );
    });

    it('should handle multiple channels', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        text: jest.fn().mockResolvedValue('ok'),
      } as any);

      await expect(adapter.send(testMessage, ['#general', '#alerts'])).resolves.not.toThrow();

      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should throw error for empty message', async () => {
      const emptyMessage: FormattedMessage = { content: '' };

      await expect(adapter.send(emptyMessage, ['#general'])).rejects.toThrow(PlatformError);
    });

    it('should throw error for message too large', async () => {
      const largeMessage: FormattedMessage = {
        content: 'x'.repeat(5000),
      };

      await expect(adapter.send(largeMessage, ['#general'])).rejects.toThrow(PlatformError);
    });

    it('should handle Slack API errors', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        text: jest.fn().mockResolvedValue('invalid_payload'),
      } as any);

      await expect(adapter.send(testMessage, ['#general'])).rejects.toThrow(PlatformError);
    });

    it('should handle rate limiting', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 429,
        statusText: 'Too Many Requests',
        text: jest.fn().mockResolvedValue('rate_limited'),
      } as any);

      await expect(adapter.send(testMessage, ['#general'])).rejects.toThrow();
    });

    it('should handle network errors', async () => {
      mockFetch.mockRejectedValueOnce(new TypeError('fetch failed'));

      await expect(adapter.send(testMessage, ['#general'])).rejects.toThrow(PlatformError);
    });

    it('should handle channel not found error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 200,
        statusText: 'OK',
        text: jest.fn().mockResolvedValue('channel_not_found'),
      } as any);

      await expect(adapter.send(testMessage, ['#nonexistent'])).rejects.toThrow(PlatformError);
    });
  });

  describe('validateMessage', () => {
    it('should validate normal message', () => {
      const message: FormattedMessage = {
        content: 'Normal message',
      };

      expect(() => adapter['validateMessage'](message)).not.toThrow();
    });

    it('should reject empty message', () => {
      const message: FormattedMessage = {
        content: '',
      };

      expect(() => adapter['validateMessage'](message)).toThrow(PlatformError);
    });

    it('should reject message too long', () => {
      const message: FormattedMessage = {
        content: 'x'.repeat(5000),
      };

      expect(() => adapter['validateMessage'](message)).toThrow(PlatformError);
    });

    it('should reject too many blocks', () => {
      const message: FormattedMessage = {
        content: 'Test',
        blocks: new Array(60).fill({ type: 'section', text: { type: 'plain_text', text: 'test' } }),
      };

      expect(() => adapter['validateMessage'](message)).toThrow(PlatformError);
    });

    it('should reject too many attachments', () => {
      const message: FormattedMessage = {
        content: 'Test',
        attachments: new Array(25).fill({ text: 'test' }),
      };

      expect(() => adapter['validateMessage'](message)).toThrow(PlatformError);
    });
  });

  describe('buildSlackMessage', () => {
    it('should build basic Slack message', () => {
      const message: FormattedMessage = {
        content: 'Test message',
      };

      const slackMessage = adapter['buildSlackMessage'](message, '#general', {
        channel: '#general',
        username: 'Postmaster',
      });

      expect(slackMessage.text).toBe('Test message');
      expect(slackMessage.channel).toBe('#general');
      expect(slackMessage.username).toBe('Postmaster');
    });

    it('should include attachments if present', () => {
      const message: FormattedMessage = {
        content: 'Test message',
        attachments: [{ text: 'Attachment text' }],
      };

      const slackMessage = adapter['buildSlackMessage'](message, '#general', {});

      expect(slackMessage.attachments).toEqual([{ text: 'Attachment text' }]);
    });

    it('should include blocks if present', () => {
      const message: FormattedMessage = {
        content: 'Test message',
        blocks: [{ type: 'section', text: { type: 'plain_text', text: 'Block text' } }],
      };

      const slackMessage = adapter['buildSlackMessage'](message, '#general', {});

      expect(slackMessage.blocks).toEqual([{ type: 'section', text: { type: 'plain_text', text: 'Block text' } }]);
    });
  });

  describe('getStats', () => {
    it('should return adapter statistics', () => {
      const stats = adapter.getStats();

      expect(stats.platform).toBe('slack');
      expect(stats.targetsCount).toBe(1);
      expect(stats.targets).toHaveLength(1);
      expect(stats.slackSpecific).toBeDefined();
      expect(stats.slackSpecific.maxMessageLength).toBe(4000);
    });
  });

  describe('close', () => {
    it('should close adapter resources', async () => {
      await expect(adapter.close()).resolves.not.toThrow();
    });
  });
});
