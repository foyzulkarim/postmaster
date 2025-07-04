import { BroadcastMessage } from '../api/v1/broadcast/broadcast.schema';
import { FormattedMessage, PlatformFormatter } from '../services/message-formatter.service';

export class TwitterFormatter implements PlatformFormatter {
  /**
   * Format message for Twitter platform
   */
  format(message: BroadcastMessage, format?: string): FormattedMessage {
    switch (format) {
      case 'rich':
        return this.formatRich(message);
      case 'markdown':
        return this.formatMarkdown(message);
      default:
        return this.formatPlain(message);
    }
  }

  /**
   * Format message with template
   */
  formatWithTemplate(
    message: BroadcastMessage,
    template: any,
    variables?: Record<string, any>
  ): FormattedMessage {
    // Twitter templates are simpler due to character constraints
    let text = template.text || message.content;
    
    // Replace variables if provided
    if (variables) {
      Object.entries(variables).forEach(([key, value]) => {
        const placeholder = new RegExp(`{{${key}}}`, 'g');
        text = text.replace(placeholder, String(value));
      });
    }

    // Ensure tweet fits within character limit
    text = this.truncateToTwitterLimit(text);

    return {
      content: text,
      // Twitter-specific fields
      poll: template.poll,
      reply_to_tweet_id: template.reply_to_tweet_id,
      quote_tweet_id: template.quote_tweet_id,
      place_id: template.place_id,
    };
  }

  /**
   * Format as plain text
   */
  private formatPlain(message: BroadcastMessage): FormattedMessage {
    let content = message.content;
    
    // Add title if present
    if (message.title) {
      content = `${message.title}\n\n${content}`;
    }

    // Truncate to Twitter's character limit
    content = this.truncateToTwitterLimit(content);

    return {
      content,
    };
  }

  /**
   * Format with markdown-style formatting (converted to plain text for Twitter)
   */
  private formatMarkdown(message: BroadcastMessage): FormattedMessage {
    let content = message.content;
    
    // Convert basic markdown to Twitter-friendly format
    content = this.convertMarkdownToTwitter(content);
    
    // Add title if present
    if (message.title) {
      const title = this.convertMarkdownToTwitter(message.title);
      content = `${title}\n\n${content}`;
    }

    // Truncate to Twitter's character limit
    content = this.truncateToTwitterLimit(content);

    return {
      content,
    };
  }

  /**
   * Format as rich content (with emojis and formatting)
   */
  private formatRich(message: BroadcastMessage): FormattedMessage {
    let content = message.content;
    
    // Add emojis and formatting for rich content
    content = this.enhanceWithEmojis(content);
    
    // Add title with emoji if present
    if (message.title) {
      const title = this.enhanceWithEmojis(message.title);
      content = `📢 ${title}\n\n${content}`;
    }

    // Truncate to Twitter's character limit
    content = this.truncateToTwitterLimit(content);

    return {
      content,
    };
  }

  /**
   * Convert markdown formatting to Twitter-friendly format
   */
  private convertMarkdownToTwitter(text: string): string {
    return text
      // Bold: **text** or __text__ -> text (Twitter doesn't support bold)
      .replace(/\*\*(.*?)\*\*/g, '$1')
      .replace(/__(.*?)__/g, '$1')
      // Italic: *text* or _text_ -> text (Twitter doesn't support italic)
      .replace(/\*(.*?)\*/g, '$1')
      .replace(/_(.*?)_/g, '$1')
      // Code: `code` -> "code"
      .replace(/`([^`]+)`/g, '"$1"')
      // Links: [text](url) -> text: url
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1: $2')
      // Headers: # Header -> Header
      .replace(/^#+\s+(.+)$/gm, '$1')
      // Lists: - item -> • item
      .replace(/^[-*+]\s+(.+)$/gm, '• $1')
      // Blockquotes: > text -> "text"
      .replace(/^>\s+(.+)$/gm, '"$1"');
  }

  /**
   * Enhance text with relevant emojis
   */
  private enhanceWithEmojis(text: string): string {
    // Add contextual emojis based on keywords
    const emojiMap: Record<string, string> = {
      // Alerts and notifications
      'alert': '🚨',
      'warning': '⚠️',
      'error': '❌',
      'success': '✅',
      'info': 'ℹ️',
      'announcement': '📢',
      
      // Actions
      'new': '🆕',
      'update': '🔄',
      'release': '🚀',
      'launch': '🚀',
      'deploy': '🚀',
      
      // Status
      'complete': '✅',
      'completed': '✅',
      'finished': '✅',
      'done': '✅',
      'failed': '❌',
      'pending': '⏳',
      'processing': '⚙️',
      
      // Time
      'urgent': '🔥',
      'asap': '🔥',
      'deadline': '⏰',
      'schedule': '📅',
      
      // General
      'important': '❗',
      'note': '📝',
      'reminder': '🔔',
      'maintenance': '🔧',
    };

    let enhancedText = text;
    
    // Add emojis for matching keywords (case insensitive)
    Object.entries(emojiMap).forEach(([keyword, emoji]) => {
      const regex = new RegExp(`\\b${keyword}\\b`, 'gi');
      if (regex.test(enhancedText) && !enhancedText.includes(emoji)) {
        enhancedText = enhancedText.replace(regex, `${emoji} ${keyword}`);
      }
    });

    return enhancedText;
  }

  /**
   * Truncate text to Twitter's character limit
   */
  private truncateToTwitterLimit(text: string): string {
    const maxLength = 280;
    
    if (text.length <= maxLength) {
      return text;
    }

    // Try to truncate at word boundary
    const truncated = text.substring(0, maxLength - 3);
    const lastSpace = truncated.lastIndexOf(' ');
    
    if (lastSpace > maxLength * 0.8) {
      // If we can find a space in the last 20% of the text, use it
      return truncated.substring(0, lastSpace) + '...';
    } else {
      // Otherwise, hard truncate
      return truncated + '...';
    }
  }

  /**
   * Create a Twitter thread from long content
   */
  createThread(message: BroadcastMessage): FormattedMessage[] {
    let content = message.content;
    
    // Add title to first tweet if present
    if (message.title) {
      content = `${message.title}\n\n${content}`;
    }

    const tweets: FormattedMessage[] = [];
    const maxTweetLength = 270; // Leave room for thread numbering
    
    // Split content into tweets
    const sentences = content.split(/[.!?]+/).filter(s => s.trim());
    let currentTweet = '';
    let tweetNumber = 1;
    
    for (const sentence of sentences) {
      const trimmedSentence = sentence.trim();
      if (!trimmedSentence) continue;
      
      const potentialTweet = currentTweet 
        ? `${currentTweet}. ${trimmedSentence}`
        : trimmedSentence;
      
      if (potentialTweet.length <= maxTweetLength) {
        currentTweet = potentialTweet;
      } else {
        // Save current tweet and start new one
        if (currentTweet) {
          tweets.push({
            content: `${tweetNumber}/${tweets.length + 2} ${currentTweet}.`,
          });
          tweetNumber++;
        }
        currentTweet = trimmedSentence;
      }
    }
    
    // Add the last tweet
    if (currentTweet) {
      tweets.push({
        content: `${tweetNumber}/${tweetNumber} ${currentTweet}.`,
      });
    }

    // Update thread numbering now that we know the total
    const totalTweets = tweets.length;
    tweets.forEach((tweet, index) => {
      tweet.content = tweet.content.replace(/^\d+\/\d+/, `${index + 1}/${totalTweets}`);
    });

    return tweets.length > 0 ? tweets : [{ content: this.truncateToTwitterLimit(content) }];
  }

  /**
   * Extract hashtags from content
   */
  extractHashtags(text: string): string[] {
    const hashtagRegex = /#[a-zA-Z0-9_]+/g;
    return text.match(hashtagRegex) || [];
  }

  /**
   * Extract mentions from content
   */
  extractMentions(text: string): string[] {
    const mentionRegex = /@[a-zA-Z0-9_]+/g;
    return text.match(mentionRegex) || [];
  }

  /**
   * Add hashtags to tweet if they fit
   */
  addHashtags(content: string, hashtags: string[]): string {
    if (!hashtags.length) return content;
    
    const hashtagString = hashtags.join(' ');
    const potentialContent = `${content}\n\n${hashtagString}`;
    
    if (potentialContent.length <= 280) {
      return potentialContent;
    }
    
    // Try to fit as many hashtags as possible
    let workingContent = content;
    for (const hashtag of hashtags) {
      const testContent = workingContent.includes('\n\n') 
        ? `${workingContent} ${hashtag}`
        : `${workingContent}\n\n${hashtag}`;
      
      if (testContent.length <= 280) {
        workingContent = testContent;
      } else {
        break;
      }
    }
    
    return workingContent;
  }
}

export default TwitterFormatter;
