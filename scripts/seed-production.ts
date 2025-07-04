import { PrismaClient } from '@prisma/client';
import { config } from 'dotenv';

// Load production environment
config({ path: '.env.production' });

const prisma = new PrismaClient();

async function seedProduction() {
  console.log('🌱 Seeding production database...');

  try {
    // Create Slack targets
    const slackGeneral = await prisma.notificationTarget.upsert({
      where: { name: 'slack-general' },
      update: {},
      create: {
        name: 'slack-general',
        platform: 'slack',
        webhookUrl: process.env.SLACK_WEBHOOK_URL || 'https://hooks.slack.com/services/REPLACE/WITH/ACTUAL',
        config: JSON.stringify({
          channel: '#general',
          username: 'Postmaster',
          icon_emoji: ':postbox:',
        }),
        active: true,
        rateLimitPerMinute: parseInt(process.env.SLACK_RATE_LIMIT || '60'),
      },
    });

    const slackAlerts = await prisma.notificationTarget.upsert({
      where: { name: 'slack-alerts' },
      update: {},
      create: {
        name: 'slack-alerts',
        platform: 'slack',
        webhookUrl: process.env.SLACK_WEBHOOK_URL || 'https://hooks.slack.com/services/REPLACE/WITH/ACTUAL',
        config: JSON.stringify({
          channel: '#alerts',
          username: 'Postmaster',
          icon_emoji: ':warning:',
        }),
        active: true,
        rateLimitPerMinute: parseInt(process.env.SLACK_RATE_LIMIT || '60'),
      },
    });

    // Create Discord targets
    const discordGeneral = await prisma.notificationTarget.upsert({
      where: { name: 'discord-general' },
      update: {},
      create: {
        name: 'discord-general',
        platform: 'discord',
        webhookUrl: process.env.DISCORD_WEBHOOK_URL || 'https://discord.com/api/webhooks/REPLACE/WITH/ACTUAL',
        config: JSON.stringify({
          username: 'Postmaster',
          avatar_url: 'https://example.com/postmaster-avatar.png',
        }),
        active: true,
        rateLimitPerMinute: parseInt(process.env.DISCORD_RATE_LIMIT || '30'),
      },
    });

    // Create Telegram targets
    const telegramGroup = await prisma.notificationTarget.upsert({
      where: { name: 'telegram-notifications' },
      update: {},
      create: {
        name: 'telegram-notifications',
        platform: 'telegram',
        webhookUrl: `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`,
        config: JSON.stringify({
          chat_id: process.env.TELEGRAM_CHAT_ID || '-1001234567890',
          parse_mode: 'Markdown',
          disable_web_page_preview: true,
        }),
        active: true,
        rateLimitPerMinute: parseInt(process.env.TELEGRAM_RATE_LIMIT || '30'),
      },
    });

    // Create production message templates
    const slackAlertTemplate = await prisma.messageTemplate.upsert({
      where: { name: 'production-alert-slack' },
      update: {},
      create: {
        name: 'production-alert-slack',
        platform: 'slack',
        template: JSON.stringify({
          text: '🚨 {{severity}} Alert: {{title}}',
          blocks: [
            {
              type: 'header',
              text: {
                type: 'plain_text',
                text: '🚨 {{severity}} Alert: {{title}}',
              },
            },
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: '*Description:* {{description}}\n*Environment:* {{environment}}\n*Time:* {{timestamp}}',
              },
            },
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: '*Source:* {{source_app}}\n*Correlation ID:* {{correlation_id}}',
              },
            },
            {
              type: 'context',
              elements: [
                {
                  type: 'mrkdwn',
                  text: 'Sent via Postmaster Notification Service',
                },
              ],
            },
          ],
        }),
        variables: JSON.stringify(['severity', 'title', 'description', 'environment', 'timestamp', 'source_app', 'correlation_id']),
        active: true,
      },
    });

    const discordAlertTemplate = await prisma.messageTemplate.upsert({
      where: { name: 'production-alert-discord' },
      update: {},
      create: {
        name: 'production-alert-discord',
        platform: 'discord',
        template: JSON.stringify({
          content: '🚨 **{{severity}}** Alert: {{title}}',
          embeds: [
            {
              title: '{{title}}',
              description: '{{description}}',
              color: 15158332, // Red color for alerts
              fields: [
                {
                  name: 'Environment',
                  value: '{{environment}}',
                  inline: true,
                },
                {
                  name: 'Source',
                  value: '{{source_app}}',
                  inline: true,
                },
                {
                  name: 'Time',
                  value: '{{timestamp}}',
                  inline: false,
                },
              ],
              footer: {
                text: 'Postmaster Notification Service',
              },
              timestamp: '{{timestamp}}',
            },
          ],
        }),
        variables: JSON.stringify(['severity', 'title', 'description', 'environment', 'source_app', 'timestamp']),
        active: true,
      },
    });

    const telegramAlertTemplate = await prisma.messageTemplate.upsert({
      where: { name: 'production-alert-telegram' },
      update: {},
      create: {
        name: 'production-alert-telegram',
        platform: 'telegram',
        template: JSON.stringify({
          text: '🚨 *{{severity}}* Alert: {{title}}\n\n*Description:* {{description}}\n\n*Environment:* {{environment}}\n*Source:* {{source_app}}\n*Time:* {{timestamp}}\n\n_Sent via Postmaster_',
          parse_mode: 'Markdown',
          disable_web_page_preview: true,
        }),
        variables: JSON.stringify(['severity', 'title', 'description', 'environment', 'source_app', 'timestamp']),
        active: true,
      },
    });

    // Create general notification template
    const generalTemplate = await prisma.messageTemplate.upsert({
      where: { name: 'general-notification' },
      update: {},
      create: {
        name: 'general-notification',
        platform: 'slack',
        template: JSON.stringify({
          text: '📢 {{title}}',
          blocks: [
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: '*{{title}}*\n\n{{content}}',
              },
            },
            {
              type: 'context',
              elements: [
                {
                  type: 'mrkdwn',
                  text: 'From: {{source_app}} | {{timestamp}}',
                },
              ],
            },
          ],
        }),
        variables: JSON.stringify(['title', 'content', 'source_app', 'timestamp']),
        active: true,
      },
    });

    console.log('✅ Production database seeded successfully!');
    console.log('📊 Created records:');
    console.log(`  - Notification Targets: 4`);
    console.log(`    - Slack: ${slackGeneral.name}, ${slackAlerts.name}`);
    console.log(`    - Discord: ${discordGeneral.name}`);
    console.log(`    - Telegram: ${telegramGroup.name}`);
    console.log(`  - Message Templates: 4`);
    console.log(`    - Alert Templates: 3 (one per platform)`);
    console.log(`    - General Template: 1`);

    console.log('\n⚠️  Important: Update the following in your .env.production:');
    console.log('  - SLACK_WEBHOOK_URL with your actual Slack webhook');
    console.log('  - DISCORD_WEBHOOK_URL with your actual Discord webhook');
    console.log('  - TELEGRAM_BOT_TOKEN with your actual Telegram bot token');
    console.log('  - TELEGRAM_CHAT_ID with your actual Telegram chat ID');

  } catch (error) {
    console.error('❌ Error seeding production database:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

seedProduction();
