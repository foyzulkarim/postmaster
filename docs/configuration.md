# Configuration Management

This document explains how to configure Postmaster's notification platforms using the configuration file approach.

## 📁 Configuration File Structure

Postmaster uses a YAML configuration file to define notification targets for different platforms. This approach provides:

- **Flexibility**: Multiple targets per platform with different settings
- **Environment Separation**: Different configurations for dev/staging/production
- **Easy Management**: Human-readable YAML format
- **Validation**: Built-in configuration validation

## 🔧 Configuration File Location

Postmaster looks for configuration files in the following order:

1. `config/platforms.yml`
2. `config/platforms.yaml`
3. `platforms.yml`
4. `platforms.yaml`
5. `config/platforms.json`
6. `platforms.json`

## 📝 Configuration Format

### Basic Structure

```yaml
platforms:
  slack:
    - name: general
      webhook_url: ${SLACK_WEBHOOK_URL}
      rate_limit: 60
      active: true
      config:
        channel: "#general"
        username: "Postmaster"
        icon_emoji: ":postbox:"

  discord:
    - name: main
      webhook_url: ${DISCORD_WEBHOOK_URL}
      rate_limit: 30
      active: true
      config:
        username: "Postmaster"

  telegram:
    - name: main
      bot_token: ${TELEGRAM_BOT_TOKEN}
      chat_id: ${TELEGRAM_CHAT_ID}
      rate_limit: 30
      active: true
      config:
        parse_mode: "Markdown"

  twitter:
    - name: main
      api_key: ${TWITTER_API_KEY}
      api_secret: ${TWITTER_API_SECRET}
      access_token: ${TWITTER_ACCESS_TOKEN}
      access_secret: ${TWITTER_ACCESS_SECRET}
      rate_limit: 15
      active: true
      config:
        account: "main"

defaults:
  retry_config:
    max_attempts: 3
    backoff_multiplier: 2
```

### Advanced Multi-Target Configuration

```yaml
platforms:
  slack:
    - name: general
      webhook_url: ${SLACK_GENERAL_WEBHOOK}
      rate_limit: 60
      active: true
      config:
        channel: "#general"
        username: "Postmaster"
        icon_emoji: ":postbox:"
    
    - name: alerts
      webhook_url: ${SLACK_ALERTS_WEBHOOK}
      rate_limit: 30  # Lower rate limit for alerts
      active: true
      config:
        channel: "#alerts"
        username: "Alert Bot"
        icon_emoji: ":warning:"
    
    - name: dev-team
      webhook_url: ${SLACK_DEV_WEBHOOK}
      rate_limit: 60
      active: false  # Disabled in production
      config:
        channel: "#dev-team"
        username: "Dev Notifications"

  discord:
    - name: main
      webhook_url: ${DISCORD_MAIN_WEBHOOK}
      rate_limit: 30
      active: true
      config:
        username: "Postmaster"
        avatar_url: "https://example.com/avatar.png"
    
    - name: announcements
      webhook_url: ${DISCORD_ANNOUNCEMENTS_WEBHOOK}
      rate_limit: 15
      active: true
      config:
        username: "Announcements"
        avatar_url: "https://example.com/announcements.png"

  telegram:
    - name: main-group
      bot_token: ${TELEGRAM_BOT_TOKEN}
      chat_id: ${TELEGRAM_MAIN_CHAT_ID}
      rate_limit: 30
      active: true
      config:
        parse_mode: "Markdown"
        disable_web_page_preview: true
    
    - name: alerts-channel
      bot_token: ${TELEGRAM_BOT_TOKEN}
      chat_id: ${TELEGRAM_ALERTS_CHAT_ID}
      rate_limit: 20
      active: true
      config:
        parse_mode: "HTML"
        disable_notification: false

  twitter:
    - name: main-account
      api_key: ${TWITTER_API_KEY}
      api_secret: ${TWITTER_API_SECRET}
      access_token: ${TWITTER_ACCESS_TOKEN}
      access_secret: ${TWITTER_ACCESS_SECRET}
      rate_limit: 15
      active: true
      config:
        account: "main"
    
    - name: support-account
      api_key: ${TWITTER_SUPPORT_API_KEY}
      api_secret: ${TWITTER_SUPPORT_API_SECRET}
      access_token: ${TWITTER_SUPPORT_ACCESS_TOKEN}
      access_secret: ${TWITTER_SUPPORT_ACCESS_SECRET}
      rate_limit: 10
      active: false
      config:
        account: "support"
```

## 🔑 Configuration Fields

### Common Fields (All Platforms)

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | ✅ | Unique identifier for the target |
| `rate_limit` | number | ❌ | Messages per minute (default varies by platform) |
| `active` | boolean | ❌ | Whether target is active (default: true) |
| `config` | object | ❌ | Platform-specific configuration |

### Platform-Specific Fields

#### Slack & Discord
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `webhook_url` | string | ✅ | Webhook URL from platform |

#### Telegram
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `bot_token` | string | ✅ | Bot token from @BotFather |
| `chat_id` | string | ✅ | Chat/Channel ID |

#### Twitter
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `api_key` | string | ✅ | Twitter API Key |
| `api_secret` | string | ✅ | Twitter API Secret |
| `access_token` | string | ✅ | Twitter Access Token |
| `access_secret` | string | ✅ | Twitter Access Secret |
| `bearer_token` | string | ❌ | Twitter Bearer Token (optional) |

## 🌍 Environment Variable Substitution

Configuration files support environment variable substitution using `${VARIABLE_NAME}` syntax:

```yaml
platforms:
  slack:
    - name: general
      webhook_url: ${SLACK_WEBHOOK_URL}  # Replaced with env var value
      rate_limit: ${SLACK_RATE_LIMIT:-60}  # With default value
```

## 🚀 Setup Instructions

### 1. Create Configuration File

```bash
# Copy example configuration
npm run config:example

# Or create manually
cp config/platforms.example.yml config/platforms.yml
```

### 2. Configure Environment Variables

```bash
# Set your platform credentials
export SLACK_WEBHOOK_URL="https://hooks.slack.com/services/..."
export DISCORD_WEBHOOK_URL="https://discord.com/api/webhooks/..."
export TELEGRAM_BOT_TOKEN="123456789:ABCdef..."
export TELEGRAM_CHAT_ID="-1001234567890"
export TWITTER_API_KEY="your-api-key"
export TWITTER_API_SECRET="your-api-secret"
export TWITTER_ACCESS_TOKEN="your-access-token"
export TWITTER_ACCESS_SECRET="your-access-secret"
```

### 3. Validate Configuration

```bash
# Validate your configuration
npm run config:validate
```

### 4. Test Configuration

```bash
# Check health endpoint
curl http://localhost:3000/api/v1/health

# Look for configuration status
curl http://localhost:3000/api/v1/health | jq '.services.configuration'
```

## ✅ Configuration Validation

The validation script checks:

- **File Format**: Valid YAML/JSON syntax
- **Required Fields**: All mandatory fields present
- **Platform Support**: Only supported platforms
- **Environment Variables**: Required env vars are set
- **Rate Limits**: Reasonable rate limit values
- **URLs**: Valid webhook URL formats

### Running Validation

```bash
# Validate configuration
npm run config:validate

# Example output:
🔍 Validating Postmaster platform configuration...

✅ Configuration file loaded successfully
📁 Config path: /path/to/config/platforms.yml
🎯 Total active platforms: 4
📊 Total active targets: 6

🔧 Validating slack configuration:
  ✅ general: OK
  ✅ alerts: OK
  📈 Active targets: 2/3

🔧 Validating discord configuration:
  ✅ main: OK
  📈 Active targets: 1/1

🔧 Validating telegram configuration:
  ✅ main-group: OK
  📈 Active targets: 1/2

🔧 Validating twitter configuration:
  ✅ main-account: OK
  📈 Active targets: 1/2

🌍 Checking environment variables:
  ✅ All required environment variables are set

📋 Validation Summary:
==================================================
✅ Configuration is VALID
📊 Platforms: 4
🎯 Targets: 5
❌ Errors: 0
⚠️  Warnings: 0

🚀 Your configuration is ready for deployment!
```

## 🚨 Error Handling

### No Providers Configured

If no platforms are configured, Postmaster will:

1. **Startup**: Throw `NoProvidersConfiguredError`
2. **Health Check**: Report unhealthy configuration service
3. **API Requests**: Return 503 Service Unavailable

### Platform Not Configured

If a broadcast request targets an unconfigured platform:

1. **Validation**: Throw `PlatformNotConfiguredError`
2. **Response**: Return 400 Bad Request with error details

### Configuration File Missing

If configuration file is not found:

1. **Startup**: Throw configuration loading error
2. **Health Check**: Report configuration service as unhealthy
3. **Logs**: Detailed error with searched paths

## 🔄 Hot Reloading

Configuration can be reloaded without restarting the application:

```typescript
// Programmatically reload configuration
platformConfigManager.reloadConfig();
```

## 🎯 Best Practices

### 1. Environment Separation

Use different configuration files for different environments:

```bash
# Development
config/platforms.dev.yml

# Staging  
config/platforms.staging.yml

# Production
config/platforms.yml
```

### 2. Security

- **Never commit credentials** to version control
- **Use environment variables** for sensitive data
- **Rotate credentials** regularly
- **Limit webhook permissions** to minimum required

### 3. Rate Limiting

- **Set appropriate rate limits** based on platform limits
- **Lower limits for critical channels** (alerts)
- **Higher limits for general notifications**

### 4. Monitoring

- **Validate configuration** in CI/CD pipeline
- **Monitor health endpoint** for configuration issues
- **Set up alerts** for configuration failures

### 5. Backup

- **Backup configuration files** before changes
- **Version control** configuration templates
- **Document** configuration changes

## 🔧 Troubleshooting

### Common Issues

#### Configuration File Not Found
```bash
Error: Platform configuration file not found. Searched: config/platforms.yml, platforms.yml, ...
```
**Solution**: Create configuration file or check file path

#### Invalid YAML Syntax
```bash
Error: YAMLException: bad indentation of a mapping entry
```
**Solution**: Check YAML indentation and syntax

#### Missing Environment Variables
```bash
Warning: Environment variable not found: SLACK_WEBHOOK_URL
```
**Solution**: Set required environment variables

#### Platform Not Configured
```bash
Error: Platform "slack" is not configured
```
**Solution**: Add platform to configuration file or check if it's active

### Debug Commands

```bash
# Check configuration summary
curl http://localhost:3000/api/v1/health | jq '.services.configuration.details'

# Validate configuration
npm run config:validate

# Check environment variables
env | grep -E "(SLACK|DISCORD|TELEGRAM|TWITTER)"
```

This configuration approach provides maximum flexibility while maintaining simplicity and reliability!
