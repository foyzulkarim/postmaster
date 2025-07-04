import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // Create sample notification targets
  const slackTarget = await prisma.notificationTarget.upsert({
    where: { name: 'general-slack' },
    update: {},
    create: {
      name: 'general-slack',
      platform: 'slack',
      webhookUrl: 'https://hooks.slack.com/services/YOUR/SLACK/WEBHOOK',
      config: JSON.stringify({
        channel: '#general',
        username: 'Postmaster',
        icon_emoji: ':postbox:',
      }),
      active: true,
      rateLimitPerMinute: 60,
    },
  });

  const discordTarget = await prisma.notificationTarget.upsert({
    where: { name: 'general-discord' },
    update: {},
    create: {
      name: 'general-discord',
      platform: 'discord',
      webhookUrl: 'https://discord.com/api/webhooks/YOUR/DISCORD/WEBHOOK',
      config: JSON.stringify({
        username: 'Postmaster',
        avatar_url: 'https://example.com/avatar.png',
      }),
      active: true,
      rateLimitPerMinute: 30,
    },
  });

  const telegramTarget = await prisma.notificationTarget.upsert({
    where: { name: 'general-telegram' },
    update: {},
    create: {
      name: 'general-telegram',
      platform: 'telegram',
      webhookUrl: 'https://api.telegram.org/bot<YOUR_BOT_TOKEN>/sendMessage',
      config: JSON.stringify({
        chat_id: '-1001234567890',
        parse_mode: 'Markdown',
      }),
      active: true,
      rateLimitPerMinute: 30,
    },
  });

  // Create sample message templates
  const slackAlertTemplate = await prisma.messageTemplate.upsert({
    where: { name: 'alert-slack' },
    update: {},
    create: {
      name: 'alert-slack',
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
              text: '{{description}}',
            },
          },
          {
            type: 'context',
            elements: [
              {
                type: 'mrkdwn',
                text: '*Source:* {{source}} | *Time:* {{timestamp}}',
              },
            ],
          },
        ],
      }),
      variables: JSON.stringify(['severity', 'title', 'description', 'source', 'timestamp']),
      active: true,
    },
  });

  const discordAlertTemplate = await prisma.messageTemplate.upsert({
    where: { name: 'alert-discord' },
    update: {},
    create: {
      name: 'alert-discord',
      platform: 'discord',
      template: JSON.stringify({
        content: '🚨 **{{severity}}** Alert: {{title}}',
        embeds: [
          {
            title: '{{title}}',
            description: '{{description}}',
            color: 15158332, // Red color
            fields: [
              {
                name: 'Source',
                value: '{{source}}',
                inline: true,
              },
              {
                name: 'Time',
                value: '{{timestamp}}',
                inline: true,
              },
            ],
          },
        ],
      }),
      variables: JSON.stringify(['severity', 'title', 'description', 'source', 'timestamp']),
      active: true,
    },
  });

  const telegramAlertTemplate = await prisma.messageTemplate.upsert({
    where: { name: 'alert-telegram' },
    update: {},
    create: {
      name: 'alert-telegram',
      platform: 'telegram',
      template: JSON.stringify({
        text: '🚨 *{{severity}}* Alert: {{title}}\n\n{{description}}\n\n*Source:* {{source}}\n*Time:* {{timestamp}}',
        parse_mode: 'Markdown',
      }),
      variables: JSON.stringify(['severity', 'title', 'description', 'source', 'timestamp']),
      active: true,
    },
  });

  // Create simple notification template
  const simpleSlackTemplate = await prisma.messageTemplate.upsert({
    where: { name: 'simple-slack' },
    update: {},
    create: {
      name: 'simple-slack',
      platform: 'slack',
      template: JSON.stringify({
        text: '{{message}}',
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: '{{message}}',
            },
          },
        ],
      }),
      variables: JSON.stringify(['message']),
      active: true,
    },
  });

  console.log('✅ Database seeded successfully!');
  console.log('📊 Created records:');
  console.log(`  - Notification Targets: ${[slackTarget, discordTarget, telegramTarget].length}`);
  console.log(`  - Message Templates: ${[slackAlertTemplate, discordAlertTemplate, telegramAlertTemplate, simpleSlackTemplate].length}`);
}

main()
  .catch((e) => {
    console.error('❌ Error seeding database:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  }); 
