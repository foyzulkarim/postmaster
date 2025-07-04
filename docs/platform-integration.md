# Platform Integration Guide

This guide will help you configure external platforms (Slack, Discord, Telegram) to work with your Postmaster notification service.

## 🔧 Platform Setup

### 1. Slack Integration

#### Step 1: Create a Slack App
1. Go to [https://api.slack.com/apps](https://api.slack.com/apps)
2. Click "Create New App" → "From scratch"
3. Enter app name: "Postmaster Notifications"
4. Select your workspace
5. Click "Create App"

#### Step 2: Enable Incoming Webhooks
1. In your app settings, go to "Features" → "Incoming Webhooks"
2. Toggle "Activate Incoming Webhooks" to **On**
3. Click "Add New Webhook to Workspace"
4. Select the channel where you want notifications
5. Click "Allow"
6. Copy the webhook URL (starts with `https://hooks.slack.com/services/...`)

#### Step 3: Configure Postmaster
```bash
# Update your .env.production file
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/T00000000/B00000000/XXXXXXXXXXXXXXXXXXXXXXXX
```

#### Step 4: Test Slack Integration
```bash
curl -X POST http://localhost:3000/api/v1/broadcast \
  -H "Authorization: Bearer your-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "message": {
      "content": "Test message from Postmaster!"
    },
    "targets": [
      {
        "platform": "slack",
        "channels": ["#general"]
      }
    ]
  }'
```

### 2. Discord Integration

#### Step 1: Create Discord Webhook
1. Go to your Discord server
2. Right-click on the channel where you want notifications
3. Select "Edit Channel"
4. Go to "Integrations" tab
5. Click "Create Webhook"
6. Set webhook name: "Postmaster"
7. Copy the webhook URL (starts with `https://discord.com/api/webhooks/...`)

#### Step 2: Configure Postmaster
```bash
# Update your .env.production file
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/123456789012345678/abcdefghijklmnopqrstuvwxyz
```

#### Step 3: Test Discord Integration
```bash
curl -X POST http://localhost:3000/api/v1/broadcast \
  -H "Authorization: Bearer your-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "message": {
      "content": "Test message from Postmaster!"
    },
    "targets": [
      {
        "platform": "discord",
        "channels": ["general"]
      }
    ]
  }'
```

### 3. Telegram Integration

#### Step 1: Create Telegram Bot
1. Open Telegram and search for `@BotFather`
2. Start a chat and send `/newbot`
3. Follow the prompts to create your bot
4. Copy the bot token (format: `123456789:ABCdefGHIjklMNOpqrsTUVwxyz`)

#### Step 2: Get Chat ID
For a group/channel:
1. Add your bot to the group/channel
2. Send a message in the group
3. Visit: `https://api.telegram.org/bot<YOUR_BOT_TOKEN>/getUpdates`
4. Look for the `chat.id` in the response (negative number for groups)

For direct messages:
1. Start a chat with your bot
2. Send `/start`
3. Visit the same URL above
4. Look for the `chat.id` (positive number for direct messages)

#### Step 3: Configure Postmaster
```bash
# Update your .env.production file
TELEGRAM_BOT_TOKEN=123456789:ABCdefGHIjklMNOpqrsTUVwxyz
TELEGRAM_CHAT_ID=-1001234567890
```

#### Step 4: Test Telegram Integration
```bash
curl -X POST http://localhost:3000/api/v1/broadcast \
  -H "Authorization: Bearer your-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "message": {
      "content": "Test message from Postmaster!"
    },
    "targets": [
      {
        "platform": "telegram",
        "channels": ["-1001234567890"]
      }
    ]
  }'
```

## 🔐 Security Configuration

### 1. Generate Secure API Key
```bash
# Generate a secure API key
openssl rand -hex 32

# Or use Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 2. Update Environment Variables
```bash
# Update .env.production with secure values
API_KEY=your-generated-secure-api-key-here
REDIS_PASSWORD=your-secure-redis-password
```

### 3. Configure CORS (if needed)
```bash
# If your LMS is on a different domain
CORS_ORIGIN=https://your-lms-domain.com
```

## 🚀 Deployment Steps

### 1. Server Setup
```bash
# Install Node.js (Ubuntu/Debian)
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install Redis
sudo apt update
sudo apt install redis-server

# Install PM2 globally
sudo npm install -g pm2

# Configure Redis (optional)
sudo nano /etc/redis/redis.conf
# Set: requirepass your-secure-redis-password
sudo systemctl restart redis-server
```

### 2. Application Deployment
```bash
# Clone your repository
git clone <your-repo-url> /opt/postmaster
cd /opt/postmaster

# Copy and configure environment
cp .env.production.example .env.production
nano .env.production  # Update with your actual values

# Run deployment script
./scripts/deploy.sh
```

### 3. Database Setup
```bash
# Run production seeding
npm run db:generate
npm run db:deploy
npx ts-node scripts/seed-production.ts
```

## 📊 Monitoring & Maintenance

### 1. Check Application Status
```bash
# PM2 status
pm2 status

# View logs
pm2 logs postmaster

# Monitor resources
pm2 monit
```

### 2. Health Checks
```bash
# Check application health
curl http://localhost:3000/api/v1/health

# Check specific services
curl http://localhost:3000/api/v1/health | jq '.services'
```

### 3. Database Maintenance
```bash
# Backup database
cp /opt/postmaster/data/postmaster.db /opt/postmaster/backups/postmaster-$(date +%Y%m%d).db

# View database stats
curl -H "Authorization: Bearer your-api-key" http://localhost:3000/api/v1/health | jq '.metrics.database'
```

## 🔧 LMS Integration

### Example Integration Code

#### PHP (Laravel/CodeIgniter)
```php
<?php
function sendNotification($message, $platforms = ['slack']) {
    $data = [
        'message' => [
            'content' => $message
        ],
        'targets' => array_map(function($platform) {
            return [
                'platform' => $platform,
                'channels' => $platform === 'slack' ? ['#general'] : 
                             ($platform === 'discord' ? ['general'] : ['-1001234567890'])
            ];
        }, $platforms),
        'metadata' => [
            'source_app' => 'LMS',
            'timestamp' => date('c')
        ]
    ];

    $ch = curl_init('http://localhost:3000/api/v1/broadcast');
    curl_setopt($ch, CURLOPT_POST, 1);
    curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($data));
    curl_setopt($ch, CURLOPT_HTTPHEADER, [
        'Content-Type: application/json',
        'Authorization: Bearer your-api-key'
    ]);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    
    $response = curl_exec($ch);
    curl_close($ch);
    
    return json_decode($response, true);
}

// Usage
sendNotification('New course published: Advanced JavaScript', ['slack', 'discord']);
?>
```

#### Python (Django/Flask)
```python
import requests
import json
from datetime import datetime

def send_notification(message, platforms=['slack']):
    platform_channels = {
        'slack': ['#general'],
        'discord': ['general'],
        'telegram': ['-1001234567890']
    }
    
    data = {
        'message': {
            'content': message
        },
        'targets': [
            {
                'platform': platform,
                'channels': platform_channels.get(platform, ['#general'])
            }
            for platform in platforms
        ],
        'metadata': {
            'source_app': 'LMS',
            'timestamp': datetime.now().isoformat()
        }
    }
    
    response = requests.post(
        'http://localhost:3000/api/v1/broadcast',
        json=data,
        headers={
            'Authorization': 'Bearer your-api-key',
            'Content-Type': 'application/json'
        }
    )
    
    return response.json()

# Usage
send_notification('New assignment due tomorrow!', ['slack', 'telegram'])
```

#### Node.js/JavaScript
```javascript
const axios = require('axios');

async function sendNotification(message, platforms = ['slack']) {
    const platformChannels = {
        slack: ['#general'],
        discord: ['general'],
        telegram: ['-1001234567890']
    };
    
    const data = {
        message: {
            content: message
        },
        targets: platforms.map(platform => ({
            platform,
            channels: platformChannels[platform] || ['#general']
        })),
        metadata: {
            source_app: 'LMS',
            timestamp: new Date().toISOString()
        }
    };
    
    try {
        const response = await axios.post('http://localhost:3000/api/v1/broadcast', data, {
            headers: {
                'Authorization': 'Bearer your-api-key',
                'Content-Type': 'application/json'
            }
        });
        
        return response.data;
    } catch (error) {
        console.error('Notification failed:', error.response?.data || error.message);
        throw error;
    }
}

// Usage
sendNotification('System maintenance scheduled for tonight', ['slack', 'discord', 'telegram']);
```

## 🚨 Troubleshooting

### Common Issues

#### 1. Webhook Not Working
- Verify webhook URLs are correct
- Check if webhooks are active in platform settings
- Test webhooks directly with curl

#### 2. Authentication Errors
- Verify API key is correct
- Check Authorization header format: `Bearer your-api-key`
- Ensure API key is set in environment variables

#### 3. Rate Limiting
- Check rate limit settings in environment
- Monitor rate limit headers in responses
- Implement exponential backoff in your LMS

#### 4. Database Issues
- Check database file permissions
- Verify Prisma migrations are applied
- Check disk space for SQLite database

#### 5. Redis Connection Issues
- Verify Redis is running: `redis-cli ping`
- Check Redis configuration
- Verify network connectivity

### Log Analysis
```bash
# View application logs
pm2 logs postmaster --lines 100

# View error logs only
pm2 logs postmaster --err

# Follow logs in real-time
pm2 logs postmaster --follow
```

## 📈 Performance Optimization

### 1. Redis Configuration
```bash
# /etc/redis/redis.conf
maxmemory 256mb
maxmemory-policy allkeys-lru
save 900 1
save 300 10
save 60 10000
```

### 2. PM2 Optimization
```javascript
// ecosystem.config.js
module.exports = {
  apps: [{
    name: 'postmaster',
    script: './dist/server.js',
    instances: 'max', // Use all CPU cores
    exec_mode: 'cluster',
    max_memory_restart: '1G',
    node_args: '--max-old-space-size=1024'
  }]
};
```

### 3. Database Optimization
```bash
# Regular database maintenance
sqlite3 /opt/postmaster/data/postmaster.db "VACUUM;"
sqlite3 /opt/postmaster/data/postmaster.db "ANALYZE;"
```

This guide should help you configure all external systems and deploy Postmaster successfully. Let me know if you need help with any specific platform or encounter any issues!
