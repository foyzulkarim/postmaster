#!/bin/bash

# Postmaster External Systems Setup Script
set -e

echo "🔧 Postmaster External Systems Configuration"
echo "============================================="

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to prompt for input
prompt_input() {
    local prompt="$1"
    local var_name="$2"
    local default_value="$3"
    
    if [ -n "$default_value" ]; then
        read -p "$prompt [$default_value]: " input
        eval "$var_name=\"${input:-$default_value}\""
    else
        read -p "$prompt: " input
        eval "$var_name=\"$input\""
    fi
}

# Function to generate secure API key
generate_api_key() {
    if command -v openssl &> /dev/null; then
        openssl rand -hex 32
    elif command -v node &> /dev/null; then
        node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
    else
        echo "$(date +%s)$(shuf -i 1000-9999 -n 1)" | sha256sum | cut -d' ' -f1
    fi
}

echo -e "${BLUE}This script will help you configure external systems for Postmaster.${NC}"
echo ""

# Generate secure API key
echo -e "${YELLOW}🔐 Generating secure API key...${NC}"
API_KEY=$(generate_api_key)
echo -e "${GREEN}Generated API key: $API_KEY${NC}"
echo ""

# Slack Configuration
echo -e "${YELLOW}📱 Slack Configuration${NC}"
echo "1. Go to https://api.slack.com/apps"
echo "2. Create a new app called 'Postmaster Notifications'"
echo "3. Enable Incoming Webhooks"
echo "4. Create a webhook for your desired channel"
echo ""
prompt_input "Enter your Slack webhook URL" SLACK_WEBHOOK_URL "https://hooks.slack.com/services/YOUR/SLACK/WEBHOOK"
prompt_input "Slack rate limit (messages per minute)" SLACK_RATE_LIMIT "60"
echo ""

# Discord Configuration
echo -e "${YELLOW}💬 Discord Configuration${NC}"
echo "1. Go to your Discord server settings"
echo "2. Navigate to Integrations > Webhooks"
echo "3. Create a new webhook called 'Postmaster'"
echo "4. Copy the webhook URL"
echo ""
prompt_input "Enter your Discord webhook URL" DISCORD_WEBHOOK_URL "https://discord.com/api/webhooks/YOUR/DISCORD/WEBHOOK"
prompt_input "Discord rate limit (messages per minute)" DISCORD_RATE_LIMIT "30"
echo ""

# Telegram Configuration
echo -e "${YELLOW}📞 Telegram Configuration${NC}"
echo "1. Message @BotFather on Telegram"
echo "2. Use /newbot command to create a bot"
echo "3. Copy the bot token"
echo "4. Add the bot to your group/channel and get the chat ID"
echo ""
prompt_input "Enter your Telegram bot token" TELEGRAM_BOT_TOKEN "123456789:ABCdefGHIjklMNOpqrsTUVwxyz"
prompt_input "Enter your Telegram chat ID" TELEGRAM_CHAT_ID "-1001234567890"
prompt_input "Telegram rate limit (messages per minute)" TELEGRAM_RATE_LIMIT "30"
echo ""

# Twitter Configuration
echo -e "${YELLOW}🐦 Twitter Configuration${NC}"
echo "1. Go to https://developer.twitter.com/en/portal/dashboard"
echo "2. Create a new project and app"
echo "3. Generate API keys and access tokens"
echo "4. Copy all credentials"
echo ""
prompt_input "Enter your Twitter API Key" TWITTER_API_KEY "your-twitter-api-key"
prompt_input "Enter your Twitter API Secret" TWITTER_API_SECRET "your-twitter-api-secret"
prompt_input "Enter your Twitter Access Token" TWITTER_ACCESS_TOKEN "your-twitter-access-token"
prompt_input "Enter your Twitter Access Secret" TWITTER_ACCESS_SECRET "your-twitter-access-secret"
prompt_input "Enter your Twitter Bearer Token (optional)" TWITTER_BEARER_TOKEN "your-twitter-bearer-token"
prompt_input "Twitter rate limit (tweets per 15 minutes)" TWITTER_RATE_LIMIT "15"
echo ""

# Redis Configuration
echo -e "${YELLOW}🗄️ Redis Configuration${NC}"
prompt_input "Redis host" REDIS_HOST "localhost"
prompt_input "Redis port" REDIS_PORT "6379"
prompt_input "Redis password (leave empty if none)" REDIS_PASSWORD ""
echo ""

# Server Configuration
echo -e "${YELLOW}🖥️ Server Configuration${NC}"
prompt_input "Server port" SERVER_PORT "3000"
prompt_input "Server host" SERVER_HOST "0.0.0.0"
prompt_input "Environment" NODE_ENV "production"
echo ""

# LMS Configuration
echo -e "${YELLOW}🎓 LMS Configuration${NC}"
prompt_input "LMS domain (for CORS)" LMS_DOMAIN "https://your-lms-domain.com"
echo ""

# Create .env.production file
echo -e "${YELLOW}📝 Creating .env.production file...${NC}"

cat > .env.production << EOF
# Production Environment Configuration
NODE_ENV=$NODE_ENV

# Server Configuration
PORT=$SERVER_PORT
HOST=$SERVER_HOST

# Database Configuration
DATABASE_URL=file:./data/postmaster.db

# Redis Configuration
REDIS_HOST=$REDIS_HOST
REDIS_PORT=$REDIS_PORT
REDIS_PASSWORD=$REDIS_PASSWORD

# API Security
API_KEY=$API_KEY

# Platform Webhooks
SLACK_WEBHOOK_URL=$SLACK_WEBHOOK_URL
DISCORD_WEBHOOK_URL=$DISCORD_WEBHOOK_URL
TELEGRAM_BOT_TOKEN=$TELEGRAM_BOT_TOKEN
TELEGRAM_CHAT_ID=$TELEGRAM_CHAT_ID

# Twitter API Credentials
TWITTER_API_KEY=$TWITTER_API_KEY
TWITTER_API_SECRET=$TWITTER_API_SECRET
TWITTER_ACCESS_TOKEN=$TWITTER_ACCESS_TOKEN
TWITTER_ACCESS_SECRET=$TWITTER_ACCESS_SECRET
TWITTER_BEARER_TOKEN=$TWITTER_BEARER_TOKEN

# Rate Limiting Configuration
SLACK_RATE_LIMIT=$SLACK_RATE_LIMIT
DISCORD_RATE_LIMIT=$DISCORD_RATE_LIMIT
TELEGRAM_RATE_LIMIT=$TELEGRAM_RATE_LIMIT
TWITTER_RATE_LIMIT=$TWITTER_RATE_LIMIT

# Queue Configuration
QUEUE_DEFAULT_RETRIES=3
QUEUE_BACKOFF_MULTIPLIER=2
QUEUE_DEFAULT_DELAY=5000

# Logging Configuration
LOG_LEVEL=info

# Monitoring Configuration
METRICS_ENABLED=true
HEALTH_CHECK_INTERVAL=30

# Security Headers
CORS_ORIGIN=$LMS_DOMAIN
RATE_LIMIT_WINDOW=900000
RATE_LIMIT_MAX=100
EOF

echo -e "${GREEN}✅ .env.production file created successfully!${NC}"
echo ""

# Create test script
echo -e "${YELLOW}🧪 Creating test script...${NC}"

cat > test-integration.sh << 'EOF'
#!/bin/bash

# Load environment variables
source .env.production

echo "🧪 Testing Postmaster Integration"
echo "================================="

# Test Slack
echo "Testing Slack integration..."
curl -X POST http://localhost:3000/api/v1/broadcast \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "message": {
      "content": "🧪 Test message from Postmaster setup script!"
    },
    "targets": [
      {
        "platform": "slack",
        "channels": ["#general"]
      }
    ],
    "metadata": {
      "source_app": "setup-script",
      "test": true
    }
  }'

echo -e "\n"

# Test Discord
echo "Testing Discord integration..."
curl -X POST http://localhost:3000/api/v1/broadcast \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "message": {
      "content": "🧪 Test message from Postmaster setup script!"
    },
    "targets": [
      {
        "platform": "discord",
        "channels": ["general"]
      }
    ],
    "metadata": {
      "source_app": "setup-script",
      "test": true
    }
  }'

echo -e "\n"

# Test Telegram
echo "Testing Telegram integration..."
curl -X POST http://localhost:3000/api/v1/broadcast \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "message": {
      "content": "🧪 Test message from Postmaster setup script!"
    },
    "targets": [
      {
        "platform": "telegram",
        "channels": ["'$TELEGRAM_CHAT_ID'"]
      }
    ],
    "metadata": {
      "source_app": "setup-script",
      "test": true
    }
  }'

echo -e "\n"
echo "✅ Integration tests completed!"
EOF

chmod +x test-integration.sh

echo -e "${GREEN}✅ Test script created: test-integration.sh${NC}"
echo ""

# Summary
echo -e "${BLUE}📋 Setup Summary${NC}"
echo "=================="
echo "✅ Generated secure API key"
echo "✅ Created .env.production with your configuration"
echo "✅ Created test-integration.sh script"
echo ""

echo -e "${YELLOW}🚀 Next Steps:${NC}"
echo "1. Review and update .env.production if needed"
echo "2. Deploy the application: ./scripts/deploy.sh"
echo "3. Test the integration: ./test-integration.sh"
echo "4. Configure your LMS to use the API"
echo ""

echo -e "${YELLOW}📚 Important Information:${NC}"
echo "• API Key: $API_KEY"
echo "• API Endpoint: http://localhost:$SERVER_PORT/api/v1/broadcast"
echo "• Health Check: http://localhost:$SERVER_PORT/api/v1/health"
echo "• Documentation: docs/platform-integration.md"
echo ""

echo -e "${GREEN}🎉 External systems configuration completed!${NC}"
