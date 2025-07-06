# 🚀 Postmaster

A central notification hub that enables applications to broadcast messages across multiple platforms (Slack, Discord, Telegram) through a single API endpoint.

## ⚡ Quick Start

### 1. Install & Setup
```bash
# Clone and install
git clone <your-repo>
cd postmaster
npm install

# Setup database
npm run db:generate
npm run db:migrate

# Build the project
npm run build
```

### 2. Start the Application
```bash
# Start both server and worker together (recommended)
npm run start:all

# Or start individually
npm start          # Server only
npm run worker:prod # Worker only
```

### 3. Test with Curl
```bash
# Quick test notification
curl -X POST http://localhost:3000/api/v1/broadcast \
  -H "Authorization: Bearer your-secret-api-key-change-in-production" \
  -H "Content-Type: application/json" \
  -d '{
    "message": {
      "title": "🎉 Hello from Postmaster!",
      "content": "Your notification system is working!"
    },
    "targets": [
      {
        "platform": "slack",
        "channels": ["#general"]
      }
    ]
  }'
```

## 📡 API Usage

### Basic Notification
```bash
curl -X POST http://localhost:3000/api/v1/broadcast \
  -H "Authorization: Bearer your-secret-api-key-change-in-production" \
  -H "Content-Type: application/json" \
  -d '{
    "message": {
      "content": "Simple notification message"
    },
    "targets": [
      {
        "platform": "slack",
        "channels": ["#general"]
      }
    ]
  }'
```

### Multi-Platform Broadcast
```bash
curl -X POST http://localhost:3000/api/v1/broadcast \
  -H "Authorization: Bearer your-secret-api-key-change-in-production" \
  -H "Content-Type: application/json" \
  -d '{
    "message": {
      "title": "📚 Course Update",
      "content": "New JavaScript course is now available!",
      "priority": "high"
    },
    "targets": [
      {
        "platform": "slack",
        "channels": ["#announcements"]
      },
      {
        "platform": "discord",
        "channels": ["general"]
      },
      {
        "platform": "telegram",
        "channels": ["-1001234567890"]
      }
    ]
  }'
```

### Health Check
```bash
curl -X GET http://localhost:3000/api/v1/health \
  -H "Authorization: Bearer your-secret-api-key-change-in-production"
```

## 🎯 Features

- **Single API Endpoint**: One request broadcasts to multiple platforms
- **Queue-Based Processing**: Reliable message delivery with retry logic
- **Rate Limiting**: Respects platform rate limits automatically
- **Priority Levels**: Support for low, normal, high, and critical priorities
- **Template System**: Customizable message formatting per platform
- **Metadata Support**: Track additional context with each message
- **Health Monitoring**: Built-in health checks and metrics
- **Scalable Architecture**: Separate server and worker processes

## 🔧 Supported Platforms

| Platform | Status | Channel Format | Example |
|----------|--------|----------------|---------|
| **Slack** | ✅ Ready | `#channel-name` | `["#general", "#alerts"]` |
| **Discord** | ✅ Ready | `channel-name` | `["general", "announcements"]` |
| **Telegram** | ✅ Ready | `chat-id` | `["-1001234567890"]` |

## 📋 Configuration

### Environment Variables
```bash
# Server
PORT=3000
HOST=0.0.0.0
API_KEY=your-secret-api-key-change-in-production

# Database
DATABASE_URL="file:./data/postmaster.db"

# Redis (for queue processing)
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=

# Platform Webhooks (optional - can be configured via database)
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/YOUR/SLACK/WEBHOOK
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/YOUR/DISCORD/WEBHOOK
TELEGRAM_BOT_TOKEN=YOUR_TELEGRAM_BOT_TOKEN
TELEGRAM_CHAT_ID=-1001234567890
```

## 🚀 Deployment

### Production Commands
```bash
# Build and start
npm run build
npm run start:all

# Or with PM2
pm2 start ecosystem.config.js
```

### Docker
```bash
# With Docker Compose (includes Redis)
docker-compose up -d
```

## 📖 Documentation

- **[Platform Integration Guide](docs/platform-integration.md)** - Setup Slack, Discord, Telegram
- **[Curl Examples](docs/CURL_EXAMPLES.md)** - Complete API reference with curl commands
- **[Startup Guide](STARTUP_GUIDE.md)** - Detailed startup options and troubleshooting

## 🔗 Integration Examples

### PHP
```php
$data = [
    'message' => ['content' => 'Hello from PHP!'],
    'targets' => [['platform' => 'slack', 'channels' => ['#general']]]
];

$response = file_get_contents('http://localhost:3000/api/v1/broadcast', false, 
    stream_context_create([
        'http' => [
            'method' => 'POST',
            'header' => [
                'Authorization: Bearer your-api-key',
                'Content-Type: application/json'
            ],
            'content' => json_encode($data)
        ]
    ])
);
```

### Python
```python
import requests

response = requests.post('http://localhost:3000/api/v1/broadcast', 
    json={
        'message': {'content': 'Hello from Python!'},
        'targets': [{'platform': 'slack', 'channels': ['#general']}]
    },
    headers={'Authorization': 'Bearer your-api-key'}
)
```

### JavaScript/Node.js
```javascript
const response = await fetch('http://localhost:3000/api/v1/broadcast', {
    method: 'POST',
    headers: {
        'Authorization': 'Bearer your-api-key',
        'Content-Type': 'application/json'
    },
    body: JSON.stringify({
        message: { content: 'Hello from JavaScript!' },
        targets: [{ platform: 'slack', channels: ['#general'] }]
    })
});
```

## 🏗️ Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Your App/LMS  │───▶│  Postmaster API │───▶│   Redis Queue   │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                                                        │
                                                        ▼
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│    Platforms    │◀───│ Platform        │◀───│  Worker Process │
│ Slack/Discord/  │    │ Adapters        │    │                 │
│ Telegram        │    │                 │    │                 │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

## 🛠️ Development

### Available Scripts
```bash
npm run dev:all      # Development mode (both server + worker)
npm run start:all    # Production mode (both server + worker)
npm start           # Server only
npm run worker:prod # Worker only
npm run build       # Build TypeScript
npm test           # Run tests
```

### Project Structure
```
src/
├── api/           # API routes
├── services/      # Business logic
├── adapters/      # Platform integrations
├── formatters/    # Message formatting
├── jobs/          # Queue job definitions
├── middleware/    # Express middleware
└── types/         # TypeScript definitions
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## 📄 License

MIT License - see LICENSE file for details

---

**Need help?** Check out the [documentation](docs/) or open an issue!
