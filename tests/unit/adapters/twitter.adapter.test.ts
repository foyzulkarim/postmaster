import { TwitterAdapter } from '../../../src/adapters/twitter.adapter';
import { NotificationTarget } from '@prisma/client';
import { FormattedMessage } from '../../../src/services/message-formatter.service';
import { PlatformError, ErrorType } from '../../../src/types/errors.types';

// Mock twitter-api-v2
jest.mock('twitter-api-v2', () => ({
  TwitterApi: jest.fn().mockImplementation(() => ({
    v2: {
      tweet: jest.fn(),
      me: jest.fn(),
    },
  })),
}));

describe('TwitterAdapter', () => {
  let adapter: TwitterAdapter;
  let mockTargets: NotificationTarget[];
  let mockTwitterClient: any;

  beforeEach(() => {
    // Set up environment variables for Twitter credentials
    process.env.TWITTER_API_KEY = 'test-api-key';
    process.env.TWITTER_API_SECRET = 'test-api-secret';
    process.env.TWITTER_ACCESS_TOKEN = 'test-access-token';
    process.env.TWITTER_ACCESS_SECRET = 'test-access-secret';

    mockTargets = [
      {
        id: 1,
        name: 'twitter-main',
        platform: 'twitter',
        webhookUrl: 'https://api.twitter.com/2/tweets',
        config: JSON.stringify({
          account: 'main',
        }),
        active: true,
        rateLimitPerMinute: 15,
        lastUsedAt: null,
        failureCount: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];

    const { TwitterApi } = require('twitter-api-v2');
    mockTwitterClient = {
      v2: {
        tweet: jest.fn(),
        me: jest.fn(),
      },
    };
    TwitterApi.mockImplementation(() => mockTwitterClient);

    adapter = new TwitterAdapter(mockTargets);
  });

  afterEach(() => {
    jest.clearAllMocks();
    delete process.env.TWITTER_API_KEY;
    delete process.env.TWITTER_API_SECRET;
    delete process.env.TWITTER_ACCESS_TOKEN;
    delete process.env.TWITTER_ACCESS_SECRET;
  });

  describe('constructor', () => {
    it('should initialize with valid credentials', () => {
      expect(adapter).toBeInstanceOf(TwitterAdapter);
    });

    it('should throw error without credentials', () => {
      delete process.env.TWITTER_API_KEY;
      
      expect(() => {
        new TwitterAdapter(mockTargets);
      }).toThrow('Twitter credentials not found in configuration');
    });
  });

  describe('send', () => {
    const testMessage: FormattedMessage = {
      content: 'Test tweet content',
    };

    it('should send tweet successfully', async () => {
      mockTwitterClient.v2.tweet.mockResolvedValueOnce({
        data: { id: '1234567890' },
      });

      await expect(adapter.send(testMessage, ['main'])).resolves.not.toThrow();

      expect(mockTwitterClient.v2.tweet).toHaveBeenCalledWith({
        text: 'Test tweet content',
      });
    });

    it('should handle multiple channels', async () => {
      mockTwitterClient.v2.tweet.mockResolvedValue({
        data: { id: '1234567890' },
      });

      await expect(adapter.send(testMessage, ['main', 'backup'])).resolves.not.toThrow();

      expect(mockTwitterClient.v2.tweet).toHaveBeenCalledTimes(2);
    });

    it('should throw error for empty message', async () => {
      const emptyMessage: FormattedMessage = { content: '' };

      await expect(adapter.send(emptyMessage, ['main'])).rejects.toThrow(PlatformError);
    });

    it('should truncate long messages', async () => {
      const longMessage: FormattedMessage = {
        content: 'x'.repeat(300),
      };

      mockTwitterClient.v2.tweet.mockResolvedValueOnce({
        data: { id: '1234567890' },
      });

      await expect(adapter.send(longMessage, ['main'])).resolves.not.toThrow();

      const tweetCall = mockTwitterClient.v2.tweet.mock.calls[0][0];
      expect(tweetCall.text.length).toBeLessThanOrEqual(280);
      expect(tweetCall.text).toContain('...');
    });

    it('should handle Twitter API errors', async () => {
      mockTwitterClient.v2.tweet.mockRejectedValueOnce({
        code: 403,
        message: 'Forbidden',
      });

      await expect(adapter.send(testMessage, ['main'])).rejects.toThrow(PlatformError);
    });

    it('should handle rate limiting', async () => {
      mockTwitterClient.v2.tweet.mockRejectedValueOnce({
        code: 429,
        message: 'Rate limit exceeded',
      });

      await expect(adapter.send(testMessage, ['main'])).rejects.toThrow(PlatformError);
    });

    it('should handle duplicate tweet error', async () => {
      mockTwitterClient.v2.tweet.mockRejectedValueOnce({
        code: 403,
        message: 'Status is a duplicate',
      });

      await expect(adapter.send(testMessage, ['main'])).rejects.toThrow(PlatformError);
    });

    it('should handle network errors', async () => {
      mockTwitterClient.v2.tweet.mockRejectedValueOnce(new Error('Network error'));

      await expect(adapter.send(testMessage, ['main'])).rejects.toThrow(PlatformError);
    });
  });

  describe('buildTwitterMessage', () => {
    it('should build basic Twitter message', () => {
      const message: FormattedMessage = {
        content: 'Test tweet',
      };

      const twitterMessage = adapter['buildTwitterMessage'](message, 'main', {});

      expect(twitterMessage.text).toBe('Test tweet');
    });

    it('should include title if it fits', () => {
      const message: FormattedMessage = {
        title: 'Short Title',
        content: 'Test content',
      };

      const twitterMessage = adapter['buildTwitterMessage'](message, 'main', {});

      expect(twitterMessage.text).toBe('Short Title\n\nTest content');
    });

    it('should skip title if combined message is too long', () => {
      const message: FormattedMessage = {
        title: 'Very long title that would make the combined message exceed the character limit',
        content: 'x'.repeat(250),
      };

      const twitterMessage = adapter['buildTwitterMessage'](message, 'main', {});

      expect(twitterMessage.text).not.toContain('Very long title');
      expect(twitterMessage.text.length).toBeLessThanOrEqual(280);
    });

    it('should include reply configuration', () => {
      const message: FormattedMessage = {
        content: 'Reply tweet',
      };
      const config = {
        reply_to_tweet_id: '1234567890',
      };

      const twitterMessage = adapter['buildTwitterMessage'](message, 'main', config);

      expect(twitterMessage.reply).toEqual({
        in_reply_to_tweet_id: '1234567890',
      });
    });

    it('should include quote tweet configuration', () => {
      const message: FormattedMessage = {
        content: 'Quote tweet',
      };
      const config = {
        quote_tweet_id: '1234567890',
      };

      const twitterMessage = adapter['buildTwitterMessage'](message, 'main', config);

      expect(twitterMessage.quote_tweet_id).toBe('1234567890');
    });
  });

  describe('validateTwitterMessage', () => {
    it('should validate normal message', () => {
      const message = {
        text: 'Normal tweet',
      };

      expect(() => adapter['validateTwitterMessage'](message)).not.toThrow();
    });

    it('should reject empty message', () => {
      const message = {
        text: '',
      };

      expect(() => adapter['validateTwitterMessage'](message)).toThrow(PlatformError);
    });

    it('should reject message too long', () => {
      const message = {
        text: 'x'.repeat(300),
      };

      expect(() => adapter['validateTwitterMessage'](message)).toThrow(PlatformError);
    });

    it('should validate poll options', () => {
      const messageWithValidPoll = {
        text: 'Poll tweet',
        poll: {
          options: ['Option 1', 'Option 2'],
          duration_minutes: 60,
        },
      };

      expect(() => adapter['validateTwitterMessage'](messageWithValidPoll)).not.toThrow();
    });

    it('should reject poll with too few options', () => {
      const messageWithInvalidPoll = {
        text: 'Poll tweet',
        poll: {
          options: ['Only one option'],
          duration_minutes: 60,
        },
      };

      expect(() => adapter['validateTwitterMessage'](messageWithInvalidPoll)).toThrow(PlatformError);
    });

    it('should reject poll with too many options', () => {
      const messageWithInvalidPoll = {
        text: 'Poll tweet',
        poll: {
          options: ['Option 1', 'Option 2', 'Option 3', 'Option 4', 'Option 5'],
          duration_minutes: 60,
        },
      };

      expect(() => adapter['validateTwitterMessage'](messageWithInvalidPoll)).toThrow(PlatformError);
    });

    it('should reject poll with invalid duration', () => {
      const messageWithInvalidPoll = {
        text: 'Poll tweet',
        poll: {
          options: ['Option 1', 'Option 2'],
          duration_minutes: 1, // Too short
        },
      };

      expect(() => adapter['validateTwitterMessage'](messageWithInvalidPoll)).toThrow(PlatformError);
    });
  });

  describe('testConnection', () => {
    it('should test connection successfully', async () => {
      mockTwitterClient.v2.me.mockResolvedValueOnce({
        data: {
          id: '1234567890',
          username: 'testuser',
        },
      });

      const result = await adapter.testConnection();

      expect(result).toBe(true);
      expect(mockTwitterClient.v2.me).toHaveBeenCalled();
    });

    it('should handle connection test failure', async () => {
      mockTwitterClient.v2.me.mockRejectedValueOnce(new Error('Connection failed'));

      const result = await adapter.testConnection();

      expect(result).toBe(false);
    });
  });

  describe('getStats', () => {
    it('should return adapter statistics', () => {
      const stats = adapter.getStats();

      expect(stats.platform).toBe('twitter');
      expect(stats.targetsCount).toBe(1);
      expect(stats.targets).toHaveLength(1);
      expect(stats.twitterSpecific).toBeDefined();
      expect(stats.twitterSpecific.maxTweetLength).toBe(280);
      expect(stats.twitterSpecific.credentials.configured).toBe(true);
    });
  });

  describe('close', () => {
    it('should close adapter resources', async () => {
      await expect(adapter.close()).resolves.not.toThrow();
    });
  });
});
