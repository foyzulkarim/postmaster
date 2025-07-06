# 🚀 Postmaster API - Curl Examples

Quick reference for testing and integrating with the Postmaster API.

## 🔑 Authentication

All requests require an API key in the Authorization header:
```bash
-H "Authorization: Bearer your-secret-api-key-change-in-production"
```

## 📡 Basic Examples

### 1. Simple Notification
```bash
curl -X POST http://localhost:3000/api/v1/broadcast \
  -H "Authorization: Bearer your-secret-api-key-change-in-production" \
  -H "Content-Type: application/json" \
  -d '{
    "message": {
      "content": "Hello from Postmaster!"
    },
    "targets": [
      {
        "platform": "slack",
        "channels": ["#general"]
      }
    ]
  }'
```

### 2. Notification with Title and Priority
```bash
curl -X POST http://localhost:3000/api/v1/broadcast \
  -H "Authorization: Bearer your-secret-api-key-change-in-production" \
  -H "Content-Type: application/json" \
  -d '{
    "message": {
      "title": "🚨 System Alert",
      "content": "Database backup completed successfully",
      "priority": "high"
    },
    "targets": [
      {
        "platform": "slack",
        "channels": ["#alerts", "#general"]
      }
    ]
  }'
```

### 3. Multi-Platform Broadcast
```bash
curl -X POST http://localhost:3000/api/v1/broadcast \
  -H "Authorization: Bearer your-secret-api-key-change-in-production" \
  -H "Content-Type: application/json" \
  -d '{
    "message": {
      "title": "📚 New Course Available",
      "content": "Advanced React Development course is now live!",
      "priority": "normal",
      "tags": ["course", "react", "announcement"]
    },
    "targets": [
      {
        "platform": "slack",
        "channels": ["#announcements"]
      },
      {
        "platform": "discord",
        "channels": ["announcements"]
      },
      {
        "platform": "telegram",
        "channels": ["-1001234567890"]
      }
    ]
  }'
```

## 🎯 Platform-Specific Examples

### Slack Only
```bash
curl -X POST http://localhost:3000/api/v1/broadcast \
  -H "Authorization: Bearer your-secret-api-key-change-in-production" \
  -H "Content-Type: application/json" \
  -d '{
    "message": {
      "title": "Slack Notification",
      "content": "This message will only go to Slack channels"
    },
    "targets": [
      {
        "platform": "slack",
        "channels": ["#general", "#random", "#dev-team"]
      }
    ]
  }'
```

### Discord Only
```bash
curl -X POST http://localhost:3000/api/v1/broadcast \
  -H "Authorization: Bearer your-secret-api-key-change-in-production" \
  -H "Content-Type: application/json" \
  -d '{
    "message": {
      "title": "Discord Notification",
      "content": "This message will only go to Discord channels"
    },
    "targets": [
      {
        "platform": "discord",
        "channels": ["general", "announcements"]
      }
    ]
  }'
```

### Telegram Only
```bash
curl -X POST http://localhost:3000/api/v1/broadcast \
  -H "Authorization: Bearer your-secret-api-key-change-in-production" \
  -H "Content-Type: application/json" \
  -d '{
    "message": {
      "title": "Telegram Notification",
      "content": "This message will only go to Telegram chats"
    },
    "targets": [
      {
        "platform": "telegram",
        "channels": ["-1001234567890", "-1009876543210"]
      }
    ]
  }'
```

## 🏥 Health & Status

### Health Check
```bash
curl -X GET http://localhost:3000/api/v1/health \
  -H "Authorization: Bearer your-secret-api-key-change-in-production"
```

### Detailed Health Check
```bash
curl -X GET http://localhost:3000/api/v1/health \
  -H "Authorization: Bearer your-secret-api-key-change-in-production" | jq '.'
```

## 📊 Advanced Examples

### With Metadata
```bash
curl -X POST http://localhost:3000/api/v1/broadcast \
  -H "Authorization: Bearer your-secret-api-key-change-in-production" \
  -H "Content-Type: application/json" \
  -d '{
    "message": {
      "title": "User Registration",
      "content": "New user John Doe has registered for the platform"
    },
    "targets": [
      {
        "platform": "slack",
        "channels": ["#user-activity"]
      }
    ],
    "metadata": {
      "user_id": "12345",
      "source": "registration_system",
      "timestamp": "2024-01-15T10:30:00Z",
      "environment": "production"
    }
  }'
```

### High Priority Alert
```bash
curl -X POST http://localhost:3000/api/v1/broadcast \
  -H "Authorization: Bearer your-secret-api-key-change-in-production" \
  -H "Content-Type: application/json" \
  -d '{
    "message": {
      "title": "🚨 CRITICAL ALERT",
      "content": "Server CPU usage is above 90% for the last 5 minutes",
      "priority": "critical",
      "tags": ["alert", "server", "cpu", "critical"]
    },
    "targets": [
      {
        "platform": "slack",
        "channels": ["#alerts", "#devops"]
      },
      {
        "platform": "discord",
        "channels": ["alerts"]
      },
      {
        "platform": "telegram",
        "channels": ["-1001234567890"]
      }
    ]
  }'
```

### Course/LMS Integration Example
```bash
curl -X POST http://localhost:3000/api/v1/broadcast \
  -H "Authorization: Bearer your-secret-api-key-change-in-production" \
  -H "Content-Type: application/json" \
  -d '{
    "message": {
      "title": "📝 Assignment Due Reminder",
      "content": "Assignment \"JavaScript Fundamentals\" is due in 24 hours. Submit your work at: https://lms.example.com/assignments/js-fundamentals",
      "priority": "normal",
      "tags": ["assignment", "reminder", "javascript"]
    },
    "targets": [
      {
        "platform": "slack",
        "channels": ["#course-js-fundamentals"]
      },
      {
        "platform": "discord",
        "channels": ["js-course"]
      }
    ],
    "metadata": {
      "course_id": "js-fundamentals-2024",
      "assignment_id": "assignment-001",
      "due_date": "2024-01-16T23:59:59Z",
      "students_count": 45
    }
  }'
```

## 🔧 Testing & Debugging

### Test with Pretty JSON Output
```bash
curl -X POST http://localhost:3000/api/v1/broadcast \
  -H "Authorization: Bearer your-secret-api-key-change-in-production" \
  -H "Content-Type: application/json" \
  -d '{
    "message": {
      "content": "Test message"
    },
    "targets": [
      {
        "platform": "slack",
        "channels": ["#general"]
      }
    ]
  }' | jq '.'
```

### Check Response Headers
```bash
curl -X POST http://localhost:3000/api/v1/broadcast \
  -H "Authorization: Bearer your-secret-api-key-change-in-production" \
  -H "Content-Type: application/json" \
  -d '{
    "message": {
      "content": "Test message"
    },
    "targets": [
      {
        "platform": "slack",
        "channels": ["#general"]
      }
    ]
  }' -i
```

### Verbose Output for Debugging
```bash
curl -X POST http://localhost:3000/api/v1/broadcast \
  -H "Authorization: Bearer your-secret-api-key-change-in-production" \
  -H "Content-Type: application/json" \
  -d '{
    "message": {
      "content": "Test message"
    },
    "targets": [
      {
        "platform": "slack",
        "channels": ["#general"]
      }
    ]
  }' -v
```

## 📝 Response Examples

### Success Response
```json
{
  "success": true,
  "jobId": "broadcast-1642248600123-abc123",
  "message": "Broadcast job queued successfully",
  "targets": 1,
  "estimatedDelivery": "2024-01-15T10:31:00Z"
}
```

### Error Response
```json
{
  "success": false,
  "error": "VALIDATION_ERROR",
  "message": "Invalid request format",
  "details": {
    "field": "message.content",
    "issue": "Content is required"
  }
}
```

### Rate Limit Response
```json
{
  "success": false,
  "error": "RATE_LIMIT_EXCEEDED",
  "message": "Too many requests",
  "retryAfter": 60
}
```

## 🚀 Quick Test Script

Save this as `test-postmaster.sh`:

```bash
#!/bin/bash

API_KEY="your-secret-api-key-change-in-production"
BASE_URL="http://localhost:3000"

echo "🧪 Testing Postmaster API..."

# Test health endpoint
echo "1. Health Check:"
curl -s -X GET "$BASE_URL/api/v1/health" \
  -H "Authorization: Bearer $API_KEY" | jq '.'

echo -e "\n2. Sending test notification:"
curl -s -X POST "$BASE_URL/api/v1/broadcast" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "message": {
      "title": "🧪 Test Notification",
      "content": "This is a test message from the curl script",
      "priority": "normal"
    },
    "targets": [
      {
        "platform": "slack",
        "channels": ["#general"]
      }
    ]
  }' | jq '.'

echo -e "\n✅ Test completed!"
```

Make it executable and run:
```bash
chmod +x test-postmaster.sh
./test-postmaster.sh
```

## 🔗 Integration Examples

### From PHP
```bash
# Test what your PHP code would send
curl -X POST http://localhost:3000/api/v1/broadcast \
  -H "Authorization: Bearer your-secret-api-key-change-in-production" \
  -H "Content-Type: application/json" \
  -d '{
    "message": {
      "title": "PHP Integration Test",
      "content": "This simulates a message sent from PHP code"
    },
    "targets": [
      {
        "platform": "slack",
        "channels": ["#php-notifications"]
      }
    ],
    "metadata": {
      "source": "php_application",
      "user_id": "php_user_123"
    }
  }'
```

### From Python
```bash
# Test what your Python code would send
curl -X POST http://localhost:3000/api/v1/broadcast \
  -H "Authorization: Bearer your-secret-api-key-change-in-production" \
  -H "Content-Type: application/json" \
  -d '{
    "message": {
      "title": "Python Integration Test",
      "content": "This simulates a message sent from Python code"
    },
    "targets": [
      {
        "platform": "discord",
        "channels": ["python-notifications"]
      }
    ],
    "metadata": {
      "source": "python_application",
      "script": "notification_sender.py"
    }
  }'
```

---

💡 **Pro Tips:**
- Use `jq` for pretty JSON formatting: `curl ... | jq '.'`
- Add `-i` flag to see response headers
- Add `-v` flag for verbose debugging output
- Save common requests as shell scripts for easy reuse
- Test with different priority levels to see formatting differences
