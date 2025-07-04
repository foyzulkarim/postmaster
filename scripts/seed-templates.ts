import { PrismaClient } from '@prisma/client';
import { config } from 'dotenv';

// Load production environment
config({ path: '.env.production' });

const prisma = new PrismaClient();

async function seedTemplates() {
  console.log('🌱 Seeding message templates...');

  try {
    // Create production alert templates for each platform
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

    const twitterAlertTemplate = await prisma.messageTemplate.upsert({
      where: { name: 'production-alert-twitter' },
      update: {},
      create: {
        name: 'production-alert-twitter',
        platform: 'twitter',
        template: JSON.stringify({
          text: '🚨 {{severity}} Alert: {{title}}\n\n{{description}}\n\n#{{environment}} #Alert #{{source_app}}',
        }),
        variables: JSON.stringify(['severity', 'title', 'description', 'environment', 'source_app']),
        active: true,
      },
    });

    // Create general notification templates
    const generalSlackTemplate = await prisma.messageTemplate.upsert({
      where: { name: 'general-notification-slack' },
      update: {},
      create: {
        name: 'general-notification-slack',
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

    const generalDiscordTemplate = await prisma.messageTemplate.upsert({
      where: { name: 'general-notification-discord' },
      update: {},
      create: {
        name: 'general-notification-discord',
        platform: 'discord',
        template: JSON.stringify({
          content: '📢 **{{title}}**',
          embeds: [
            {
              description: '{{content}}',
              color: 3447003, // Blue color
              footer: {
                text: 'From {{source_app}}',
              },
              timestamp: '{{timestamp}}',
            },
          ],
        }),
        variables: JSON.stringify(['title', 'content', 'source_app', 'timestamp']),
        active: true,
      },
    });

    const generalTelegramTemplate = await prisma.messageTemplate.upsert({
      where: { name: 'general-notification-telegram' },
      update: {},
      create: {
        name: 'general-notification-telegram',
        platform: 'telegram',
        template: JSON.stringify({
          text: '📢 *{{title}}*\n\n{{content}}\n\n_From: {{source_app}}_',
          parse_mode: 'Markdown',
        }),
        variables: JSON.stringify(['title', 'content', 'source_app']),
        active: true,
      },
    });

    const generalTwitterTemplate = await prisma.messageTemplate.upsert({
      where: { name: 'general-notification-twitter' },
      update: {},
      create: {
        name: 'general-notification-twitter',
        platform: 'twitter',
        template: JSON.stringify({
          text: '📢 {{title}}\n\n{{content}}\n\n#{{source_app}}',
        }),
        variables: JSON.stringify(['title', 'content', 'source_app']),
        active: true,
      },
    });

    console.log('✅ Message templates seeded successfully!');
    console.log('📊 Created templates:');
    console.log('  - Alert Templates: 4 (one per platform)');
    console.log('  - General Templates: 4 (one per platform)');
    console.log('  - Total: 8 templates');

    console.log('\n💡 Note: NotificationTargets are now configured via environment variables');
    console.log('   No database seeding required for platform configuration!');

  } catch (error) {
    console.error('❌ Error seeding templates:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

seedTemplates();
