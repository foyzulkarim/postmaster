# Postmaster Implementation Plan

## Overview

This document outlines the phased implementation approach for **Postmaster**, a central notification hub that enables applications to broadcast messages across multiple platforms (Slack, Discord, Telegram) through a single API.

## Architecture Principles

- **Queue-First Design**: All notifications go through a job queue for reliability
- **Retry by Default**: Built-in exponential backoff and failure handling
- **Platform Agnostic**: Adapter pattern for easy platform additions
- **Separation of Concerns**: API, queuing, and delivery are distinct layers

## Tech Stack

| Component | Technology | Purpose |
|-----------|------------|---------|
| **Runtime** | Node.js + TypeScript | Core application |
| **Web Framework** | Fastify | HTTP API server |
| **Database** | SQLite + Prisma | Persistent storage with type safety |
| **Queue** | BullMQ + Redis | Job queuing and retry logic |
| **Containerization** | Docker + Docker Compose | Development and deployment |
| **Logging** | Pino | Structured logging |

## Database Schema

### Prisma Schema
```prisma
// prisma/schema.prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "sqlite"
  url      = env("DATABASE_URL")
}

model NotificationTarget {
  id                  Int      @id @default(autoincrement())
  name                String   @unique
  platform            String
  webhookUrl          String   @map("webhook_url")
  config              String   @default("{}") // JSON string for platform-specific config
  active              Boolean  @default(true)
  rateLimitPerMinute  Int      @default(60) @map("rate_limit_per_minute")
  lastUsedAt          DateTime? @map("last_used_at")
  failureCount        Int      @default(0) @map("failure_count")
  createdAt           DateTime @default(now()) @map("created_at")
  updatedAt           DateTime @updatedAt @map("updated_at")
  
  logs NotificationLog[]
  
  @@index([platform, active])
  @@map("notification_targets")
}

model NotificationLog {
  id           Int      @id @default(autoincrement())
  jobId        String   @map("job_id")
  targetId     Int?     @map("target_id")
  messageHash  String?  @map("message_hash")
  status       String   // 'pending', 'sent', 'failed', 'retry', 'rate_limited', 'permanent_failure'
  errorType    String?  @map("error_type") // 'rate_limited', 'invalid_webhook', 'platform_down', etc.
  attemptCount Int      @default(0) @map("attempt_count")
  errorMessage String?  @map("error_message")
  payload      String   // JSON string
  responseTime Int?     @map("response_time") // milliseconds
  createdAt    DateTime @default(now()) @map("created_at")
  updatedAt    DateTime @updatedAt @map("updated_at")
  
  target NotificationTarget? @relation(fields: [targetId], references: [id])
  
  @@index([jobId])
  @@index([status])
  @@index([errorType])
  @@index([createdAt])
  @@map("notification_logs")
}

model MessageDeduplication {
  id          Int      @id @default(autoincrement())
  dedupKey    String   @unique @map("dedup_key")
  messageHash String   @map("message_hash")
  jobId       String   @map("job_id")
  expiresAt   DateTime @map("expires_at")
  createdAt   DateTime @default(now()) @map("created_at")
  
  @@index([dedupKey])
  @@index([expiresAt])
  @@map("message_deduplication")
}

model MessageTemplate {
  id          Int      @id @default(autoincrement())
  name        String   @unique
  platform    String
  template    String   // JSON template structure
  variables   String   @default("[]") // JSON array of required variables
  active      Boolean  @default(true)
  createdAt   DateTime @default(now()) @map("created_at")
  updatedAt   DateTime @updatedAt @map("updated_at")
  
  @@index([platform, active])
  @@map("message_templates")
}

// Note: API key management removed for MVP - using single shared key from environment
```

## API Specification

### Authentication
All API requests require authentication via API key in the Authorization header:
```http
Authorization: Bearer <api_key>
```

### Broadcast Endpoint

```http
POST /api/v1/broadcast
Authorization: Bearer <api_key>
Content-Type: application/json
```

#### Request Body
```typescript
interface BroadcastRequest {
  message: {
    title?: string;
    content: string;
    format?: 'plain' | 'markdown' | 'rich';
    max_length?: number; // Platform-specific validation
  };
  targets: Array<{
    platform: 'slack' | 'discord' | 'telegram';
    channels: string[];
    format_override?: 'plain' | 'markdown' | 'rich';
    template?: string; // Optional template name
  }>;
  options?: {
    priority?: 'low' | 'normal' | 'high';
    schedule?: {
      send_at: string; // ISO 8601 timestamp
    };
    deduplication?: {
      key: string;
      window_seconds: number; // Default: 3600 (1 hour)
    };
    retry_config?: {
      max_attempts: number; // Default: 3
      backoff_multiplier: number; // Default: 2
    };
  };
  metadata?: {
    source_app: string;
    tags: string[];
    correlation_id?: string;
    user_id?: string;
  };
}
```

#### Response
```typescript
interface BroadcastResponse {
  success: boolean;
  job_id: string;
  message: string;
  scheduled_for?: string;
  targets_count: number;
  deduplication_applied?: boolean;
  estimated_delivery_time?: string;
}
```

#### Error Response
```typescript
interface ErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: any;
  };
  request_id: string;
}
```

### Additional Endpoints

#### Job Status
```http
GET /api/v1/jobs/{job_id}
Authorization: Bearer <api_key>
```

#### Health Check
```http
GET /api/v1/health
```

#### Platform Status
```http
GET /api/v1/platforms/status
Authorization: Bearer <api_key>
```

## Implementation Phases

### Phase 0: MVP Validation (Recommended First Step)
**Goal**: Validate core concept with minimal viable implementation
- [ ] **Single Platform Proof of Concept**
  - Implement Slack-only adapter
  - Basic API endpoint for single message
  - Simple queue processing
  - Basic error handling
  - Docker setup for local development
- [ ] **Success Criteria**
  - Successfully send message to Slack channel
  - Handle basic errors (invalid webhook, network issues)
  - Process messages through queue
  - Basic logging and monitoring

### Phase 1: Project Setup & Core Infrastructure

#### 1.1 Project Initialization
```bash
# Initialize Node.js project
npm init -y
npm install fastify typescript @types/node
npm install -D nodemon ts-node

# Install core dependencies
npm install prisma @prisma/client bullmq redis pino pino-pretty
npm install -D prisma

# Install validation dependencies (keeping it simple)
npm install joi
```

#### 1.2 Database Setup
- [ ] Initialize Prisma (`npx prisma init`)
- [ ] Define comprehensive schema in `prisma/schema.prisma`
- [ ] Generate Prisma client (`npx prisma generate`)
- [ ] Create and run migrations (`npx prisma migrate dev`)
- [ ] Seed database with sample data and notification targets (`npx prisma db seed`)

#### 1.3 Enhanced Configuration Management
```typescript
// config/index.ts
export const config = {
  server: {
    port: process.env.PORT || 3000,
    host: process.env.HOST || '0.0.0.0',
  },
  database: {
    url: process.env.DATABASE_URL || 'file:./postmaster.db',
  },
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD,
  },
  auth: {
    apiKey: process.env.API_KEY || 'your-secret-api-key', // Single shared key
  },
  platforms: {
    slack: {
      defaultRateLimit: 60, // per minute
      maxMessageSize: 4000,
    },
    discord: {
      defaultRateLimit: 30,
      maxMessageSize: 2000,
    },
    telegram: {
      defaultRateLimit: 30,
      maxMessageSize: 4096,
    },
  },
  queue: {
    defaultRetries: 3,
    backoffMultiplier: 2,
    defaultDelay: 5000,
  },
};
```

#### 1.4 Enhanced Server Setup
- [ ] Create Fastify application with security plugins
- [ ] Add comprehensive health check endpoint
- [ ] Set up structured logging with Pino
- [ ] Add request validation with Joi schemas
- [ ] Implement API key authentication middleware
- [ ] Add rate limiting per API key
- [ ] Set up CORS and security headers

#### 1.5 Simplified Authentication (MVP Approach)
```typescript
// middleware/auth.middleware.ts
export class AuthMiddleware {
  static validateApiKey(request: FastifyRequest, reply: FastifyReply, done: Function) {
    const authHeader = request.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return reply.status(401).send({
        success: false,
        error: {
          code: 'MISSING_AUTH',
          message: 'Authorization header required'
        }
      });
    }
    
    const token = authHeader.substring(7); // Remove 'Bearer ' prefix
    const expectedToken = process.env.API_KEY;
    
    if (!expectedToken) {
      return reply.status(500).send({
        success: false,
        error: {
          code: 'SERVER_CONFIG_ERROR',
          message: 'API key not configured'
        }
      });
    }
    
    if (token !== expectedToken) {
      return reply.status(401).send({
        success: false,
        error: {
          code: 'INVALID_API_KEY',
          message: 'Invalid API key'
        }
      });
    }
    
    // Optional: Add basic rate limiting per IP
    // This prevents abuse even with the shared key
    const clientIp = request.ip;
    // Simple in-memory rate limiting can be added here if needed
    
    done();
  }
}

// Usage in routes
app.register(async function (fastify) {
  fastify.addHook('preHandler', AuthMiddleware.validateApiKey);
  
  fastify.post('/api/v1/broadcast', broadcastHandler);
  fastify.get('/api/v1/jobs/:jobId', jobStatusHandler);
  // ... other protected routes
});
```

#### 1.5 Process Management with PM2
```bash
# Install PM2 globally
npm install -g pm2

# Install PM2 as dev dependency for local development
npm install -D pm2
```

```javascript
// ecosystem.config.js - PM2 configuration
module.exports = {
  apps: [{
    name: 'postmaster',
    script: './dist/server.js',
    instances: 1, // Start with single instance, can scale later
    exec_mode: 'cluster',
    watch: false, // Don't watch in production
    max_memory_restart: '1G',
    env: {
      NODE_ENV: 'development',
      PORT: 3000,
    },
    env_production: {
      NODE_ENV: 'production',
      PORT: 3000,
    },
    error_file: './logs/err.log',
    out_file: './logs/out.log',
    log_file: './logs/combined.log',
    time: true,
    // Restart policy
    restart_delay: 4000,
    max_restarts: 10,
    min_uptime: '10s',
  }]
};
```

```json
// package.json scripts
{
  "scripts": {
    "build": "tsc",
    "start": "node dist/server.js",
    "dev": "nodemon src/server.ts",
    "pm2:start": "pm2 start ecosystem.config.js --env production",
    "pm2:stop": "pm2 stop postmaster",
    "pm2:restart": "pm2 restart postmaster",
    "pm2:logs": "pm2 logs postmaster",
    "pm2:monit": "pm2 monit"
  }
}
```

### Phase 2: API & Job Queuing Core

#### 2.1 API Route Implementation
```typescript
// api/v1/broadcast/broadcast.controller.ts
export class BroadcastController {
  async broadcast(request: FastifyRequest<{ Body: BroadcastRequest }>) {
    // 1. Validate request payload
    const validation = this.validateRequest(request.body);
    if (!validation.valid) {
      throw new ValidationError(validation.errors);
    }
    
    // 2. Authenticate bearer token
    const apiKey = await this.authService.validateApiKey(request.headers.authorization);
    if (!apiKey) {
      throw new UnauthorizedError('Invalid API key');
    }
    
    // 3. Check deduplication
    const dedupApplied = await this.checkDeduplication(request.body);
    
    // 4. Create notification job
    const jobId = await this.producer.createBroadcastJob(request.body);
    
    // 5. Return job ID and status
    return {
      success: true,
      job_id: jobId,
      message: 'Broadcast job created successfully',
      targets_count: request.body.targets.length,
      deduplication_applied: dedupApplied,
    };
  }
  
  private async checkDeduplication(payload: BroadcastRequest): Promise<boolean> {
    if (!payload.options?.deduplication) return false;
    
    const { key, window_seconds } = payload.options.deduplication;
    const messageHash = this.generateMessageHash(payload.message);
    const expiresAt = new Date(Date.now() + window_seconds * 1000);
    
    try {
      await this.db.messageDeduplication.create({
        data: {
          dedupKey: key,
          messageHash,
          jobId: '', // Will be updated after job creation
          expiresAt,
        },
      });
      return false;
    } catch (error) {
      // Duplicate key constraint violation
      return true;
    }
  }
}
```

#### 2.2 Enhanced Job Production Logic
```typescript
// jobs/notification.producer.ts
export class NotificationProducer {
  async createBroadcastJob(payload: BroadcastRequest): Promise<string> {
    const priority = this.getPriority(payload.options?.priority);
    const delay = this.calculateDelay(payload.options?.schedule);
    
    const job = await this.queue.add('broadcast', payload, {
      attempts: payload.options?.retry_config?.max_attempts || 3,
      backoff: {
        type: 'exponential',
        delay: 5000,
        settings: {
          multiplier: payload.options?.retry_config?.backoff_multiplier || 2,
        },
      },
      delay,
      priority,
      removeOnComplete: 100,
      removeOnFail: 50,
    });
    
    // Update deduplication record with job ID
    if (payload.options?.deduplication) {
      await this.updateDeduplicationJobId(payload.options.deduplication.key, job.id);
    }
    
    return job.id;
  }
  
  private getPriority(priority?: string): number {
    switch (priority) {
      case 'high': return 10;
      case 'normal': return 5;
      case 'low': return 1;
      default: return 5;
    }
  }
}
```

#### 2.3 Enhanced Database Service
```typescript
// services/db.service.ts
import { PrismaClient } from '@prisma/client';

export class DatabaseService {
  private prisma = new PrismaClient();
  
  async findTargetsByPlatform(platform: string): Promise<NotificationTarget[]> {
    return await this.prisma.notificationTarget.findMany({
      where: { platform, active: true }
    });
  }
  
  async createLogEntry(entry: NotificationLogEntry): Promise<void> {
    await this.prisma.notificationLog.create({
      data: entry
    });
  }
  
  async updateLogStatus(
    jobId: string, 
    status: string, 
    errorType?: string,
    error?: string,
    responseTime?: number
  ): Promise<void> {
    await this.prisma.notificationLog.updateMany({
      where: { jobId },
      data: { 
        status, 
        errorType,
        errorMessage: error,
        responseTime,
        updatedAt: new Date()
      }
    });
  }
  
  async incrementFailureCount(targetId: number): Promise<void> {
    await this.prisma.notificationTarget.update({
      where: { id: targetId },
      data: {
        failureCount: { increment: 1 },
        lastUsedAt: new Date(),
      },
    });
  }
  
  async resetFailureCount(targetId: number): Promise<void> {
    await this.prisma.notificationTarget.update({
      where: { id: targetId },
      data: {
        failureCount: 0,
        lastUsedAt: new Date(),
      },
    });
  }
}
```

#### 2.4 Enhanced Worker Process
```typescript
// jobs/notification.worker.ts
export class NotificationWorker {
  async processJob(job: Job<BroadcastRequest>): Promise<void> {
    const startTime = Date.now();
    
    try {
      await this.dispatcher.dispatch(job.data);
      
      const responseTime = Date.now() - startTime;
      await this.db.updateLogStatus(job.id, 'sent', undefined, undefined, responseTime);
      
      this.logger.info(`Job ${job.id} completed successfully`, {
        jobId: job.id,
        responseTime,
        targetsCount: job.data.targets.length,
      });
    } catch (error) {
      const responseTime = Date.now() - startTime;
      const errorType = this.categorizeError(error);
      
      await this.db.updateLogStatus(
        job.id, 
        errorType === 'permanent_failure' ? 'failed' : 'retry',
        errorType,
        error.message,
        responseTime
      );
      
      this.logger.error(`Job ${job.id} failed`, {
        jobId: job.id,
        error: error.message,
        errorType,
        attempt: job.attemptsMade,
      });
      
      if (errorType !== 'permanent_failure') {
        throw error; // Let BullMQ handle retries
      }
    }
  }
  
  private categorizeError(error: any): string {
    if (error.statusCode >= 400 && error.statusCode < 500) {
      return 'permanent_failure';
    }
    if (error.statusCode === 429) {
      return 'rate_limited';
    }
    if (error.statusCode >= 500) {
      return 'platform_down';
    }
    return 'unknown_error';
  }
}
```

### Phase 3: Dispatching, Adapters & Error Handling

#### 3.1 Enhanced Dispatcher Service
```typescript
// services/dispatcher.service.ts
export class DispatcherService {
  async dispatch(payload: BroadcastRequest): Promise<void> {
    const results = [];
    
    for (const target of payload.targets) {
      try {
        const adapter = this.getAdapter(target.platform);
        const formattedMessage = this.formatMessage(payload.message, target);
        
        // Check rate limits before sending
        await this.rateLimiter.checkLimit(target.platform);
        
        await adapter.send(formattedMessage, target.channels);
        results.push({ platform: target.platform, status: 'success' });
      } catch (error) {
        results.push({ 
          platform: target.platform, 
          status: 'failed', 
          error: error.message 
        });
        
        // Don't fail entire job if one platform fails
        this.logger.error(`Platform ${target.platform} failed`, error);
      }
    }
    
    // If all platforms failed, throw error to trigger retry
    if (results.every(r => r.status === 'failed')) {
      throw new Error('All platforms failed');
    }
  }
  
  private formatMessage(message: Message, target: Target): FormattedMessage {
    const formatter = this.getFormatter(target.platform);
    return formatter.format(message, target.format_override);
  }
}
```

#### 3.2 Enhanced Platform Adapters
```typescript
// adapters/base.adapter.ts
export abstract class BasePlatformAdapter {
  protected rateLimiter: RateLimiter;
  protected logger: Logger;
  
  abstract send(message: FormattedMessage, channels: string[]): Promise<void>;
  
  protected async handleRateLimit(error: any): Promise<void> {
    if (this.isRateLimitError(error)) {
      const retryAfter = this.extractRetryAfter(error);
      throw new RateLimitError(`Rate limited, retry after ${retryAfter}s`, retryAfter);
    }
  }
  
  protected categorizeError(error: any): ErrorType {
    if (error.statusCode >= 400 && error.statusCode < 500) {
      return ErrorType.PERMANENT_FAILURE;
    }
    if (error.statusCode === 429) {
      return ErrorType.RATE_LIMITED;
    }
    if (error.statusCode >= 500) {
      return ErrorType.PLATFORM_DOWN;
    }
    return ErrorType.UNKNOWN_ERROR;
  }
}

// adapters/slack.adapter.ts
export class SlackAdapter extends BasePlatformAdapter {
  async send(message: FormattedMessage, channels: string[]): Promise<void> {
    for (const channel of channels) {
      try {
        const response = await fetch(this.webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            channel,
            text: message.content,
            attachments: message.attachments,
          }),
        });
        
        if (!response.ok) {
          await this.handleRateLimit(response);
          throw new PlatformError(
            `Slack API error: ${response.status} ${response.statusText}`,
            'slack',
            response.status,
            this.isRetryable(response.status)
          );
        }
      } catch (error) {
        this.logger.error(`Slack send failed for channel ${channel}`, error);
        throw error;
      }
    }
  }
  
  private isRetryable(statusCode: number): boolean {
    return statusCode >= 500 || statusCode === 429;
  }
}

// adapters/discord.adapter.ts
export class DiscordAdapter extends BasePlatformAdapter {
  async send(message: FormattedMessage, channels: string[]): Promise<void> {
    for (const channel of channels) {
      const webhookUrl = this.getWebhookUrl(channel);
      
      try {
        const response = await fetch(webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            content: message.content,
            embeds: message.embeds,
          }),
        });
        
        if (!response.ok) {
          await this.handleRateLimit(response);
          throw new PlatformError(
            `Discord API error: ${response.status} ${response.statusText}`,
            'discord',
            response.status,
            this.isRetryable(response.status)
          );
        }
      } catch (error) {
        this.logger.error(`Discord send failed for channel ${channel}`, error);
        throw error;
      }
    }
  }
}

// adapters/telegram.adapter.ts
export class TelegramAdapter extends BasePlatformAdapter {
  async send(message: FormattedMessage, channels: string[]): Promise<void> {
    for (const channel of channels) {
      try {
        const response = await fetch(
          `https://api.telegram.org/bot${this.botToken}/sendMessage`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: channel,
              text: message.content,
              parse_mode: message.parseMode,
            }),
          }
        );
        
        if (!response.ok) {
          await this.handleRateLimit(response);
          throw new PlatformError(
            `Telegram API error: ${response.status} ${response.statusText}`,
            'telegram',
            response.status,
            this.isRetryable(response.status)
          );
        }
      } catch (error) {
        this.logger.error(`Telegram send failed for channel ${channel}`, error);
        throw error;
      }
    }
  }
}
```

#### 3.3 Enhanced Error Handling Strategy
```typescript
// types/errors.ts
export enum ErrorType {
  RATE_LIMITED = 'rate_limited',
  INVALID_WEBHOOK = 'invalid_webhook',
  PLATFORM_DOWN = 'platform_down',
  MESSAGE_TOO_LARGE = 'message_too_large',
  PERMANENT_FAILURE = 'permanent_failure',
  UNKNOWN_ERROR = 'unknown_error'
}

export class PlatformError extends Error {
  constructor(
    message: string,
    public platform: string,
    public statusCode?: number,
    public retryable: boolean = true,
    public errorType: ErrorType = ErrorType.UNKNOWN_ERROR
  ) {
    super(message);
    this.name = 'PlatformError';
  }
}

export class RateLimitError extends PlatformError {
  constructor(message: string, public retryAfter: number) {
    super(message, 'unknown', 429, true, ErrorType.RATE_LIMITED);
    this.name = 'RateLimitError';
  }
}

// In worker
catch (error) {
  if (error instanceof PlatformError && !error.retryable) {
    // Don't retry 4xx errors
    await this.db.updateLogStatus(job.id, 'failed', error.errorType, error.message);
    return; // Don't throw, job is done
  }
  
  if (error instanceof RateLimitError) {
    // Schedule retry after rate limit window
    throw new Error(`Rate limited, retry after ${error.retryAfter}s`);
  }
  
  throw error; // Let BullMQ retry
}
```

#### 3.4 Message Formatting Service
```typescript
// services/message-formatter.service.ts
export class MessageFormatterService {
  formatForPlatform(message: Message, platform: string, format?: string): FormattedMessage {
    const formatter = this.getFormatter(platform);
    return formatter.format(message, format);
  }
  
  private getFormatter(platform: string): PlatformFormatter {
    switch (platform) {
      case 'slack': return new SlackFormatter();
      case 'discord': return new DiscordFormatter();
      case 'telegram': return new TelegramFormatter();
      default: throw new Error(`Unsupported platform: ${platform}`);
    }
  }
}

// formatters/slack.formatter.ts
export class SlackFormatter implements PlatformFormatter {
  format(message: Message, format?: string): FormattedMessage {
    switch (format) {
      case 'rich':
        return this.formatRich(message);
      case 'markdown':
        return this.formatMarkdown(message);
      default:
        return this.formatPlain(message);
    }
  }
  
  private formatRich(message: Message): FormattedMessage {
    return {
      content: message.title || message.content,
      attachments: [{
        color: 'good',
        text: message.content,
        mrkdwn_in: ['text']
      }]
    };
  }
}
```

### Phase 4: Advanced Features & Monitoring

#### 4.1 Enhanced Message Templates
```typescript
// services/template.service.ts
export class TemplateService {
  async renderTemplate(templateName: string, platform: string, variables: Record<string, any>): Promise<FormattedMessage> {
    const template = await this.db.messageTemplate.findFirst({
      where: { name: templateName, platform, active: true }
    });
    
    if (!template) {
      throw new Error(`Template ${templateName} not found for platform ${platform}`);
    }
    
    const templateData = JSON.parse(template.template);
    const requiredVars = JSON.parse(template.variables);
    
    // Validate required variables
    this.validateVariables(requiredVars, variables);
    
    // Render template with variables
    return this.renderTemplateData(templateData, variables);
  }
  
  private validateVariables(required: string[], provided: Record<string, any>): void {
    const missing = required.filter(key => !(key in provided));
    if (missing.length > 0) {
      throw new Error(`Missing required variables: ${missing.join(', ')}`);
    }
  }
}

// templates/slack.template.ts
export class SlackTemplate {
  static formatRichMessage(message: Message): SlackMessage {
    return {
      text: message.title,
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: message.content,
          },
        },
      ],
    };
  }
  
  static formatAlertMessage(alert: AlertMessage): SlackMessage {
    return {
      text: `🚨 ${alert.severity.toUpperCase()}: ${alert.title}`,
      blocks: [
        {
          type: 'header',
          text: {
            type: 'plain_text',
            text: `🚨 ${alert.severity.toUpperCase()}: ${alert.title}`,
          },
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: alert.description,
          },
        },
        {
          type: 'context',
          elements: [
            {
              type: 'mrkdwn',
              text: `*Source:* ${alert.source} | *Time:* ${alert.timestamp}`,
            },
          ],
        },
      ],
    };
  }
}
```

#### 4.2 Enhanced Rate Limiting
```typescript
// services/rate-limiter.service.ts
import { RateLimiterRedis } from 'rate-limiter-flexible';

export class RateLimiterService {
  private limiters = new Map<string, RateLimiterRedis>();
  
  constructor(private redis: Redis) {
    this.initializeLimiters();
  }
  
  private initializeLimiters(): void {
    // Platform-specific rate limiters
    this.limiters.set('slack', new RateLimiterRedis({
      storeClient: this.redis,
      keyPrefix: 'rl_slack',
      points: 60, // requests
      duration: 60, // per 60 seconds
    }));
    
    this.limiters.set('discord', new RateLimiterRedis({
      storeClient: this.redis,
      keyPrefix: 'rl_discord',
      points: 30,
      duration: 60,
    }));
    
    this.limiters.set('telegram', new RateLimiterRedis({
      storeClient: this.redis,
      keyPrefix: 'rl_telegram',
      points: 30,
      duration: 60,
    }));
  }
  
  async checkLimit(platform: string, identifier?: string): Promise<boolean> {
    const limiter = this.limiters.get(platform);
    if (!limiter) return true;
    
    try {
      await limiter.consume(identifier || platform);
      return true;
    } catch (rejRes) {
      const secs = Math.round(rejRes.msBeforeNext / 1000) || 1;
      throw new RateLimitError(`Rate limit exceeded for ${platform}. Retry after ${secs}s`, secs);
    }
  }
  
  async getRemainingPoints(platform: string, identifier?: string): Promise<number> {
    const limiter = this.limiters.get(platform);
    if (!limiter) return Infinity;
    
    const res = await limiter.get(identifier || platform);
    return res ? res.remainingPoints : limiter.points;
  }
}
```

#### 4.3 Comprehensive Monitoring & Health Checks
```typescript
// api/v1/health/health.controller.ts
export class HealthController {
  async getHealth(): Promise<HealthStatus> {
    const checks = await Promise.allSettled([
      this.checkDatabase(),
      this.checkRedis(),
      this.checkQueue(),
      this.checkPlatforms(),
    ]);
    
    const [dbCheck, redisCheck, queueCheck, platformCheck] = checks;
    
    return {
      status: checks.every(c => c.status === 'fulfilled' && c.value.healthy) ? 'healthy' : 'unhealthy',
      timestamp: new Date().toISOString(),
      services: {
        database: dbCheck.status === 'fulfilled' ? dbCheck.value : { healthy: false, error: dbCheck.reason },
        redis: redisCheck.status === 'fulfilled' ? redisCheck.value : { healthy: false, error: redisCheck.reason },
        queue: queueCheck.status === 'fulfilled' ? queueCheck.value : { healthy: false, error: queueCheck.reason },
        platforms: platformCheck.status === 'fulfilled' ? platformCheck.value : { healthy: false, error: platformCheck.reason },
      },
      metrics: await this.getMetrics(),
    };
  }
  
  private async checkDatabase(): Promise<ServiceHealth> {
    try {
      await this.db.$queryRaw`SELECT 1`;
      return { healthy: true, response_time: Date.now() };
    } catch (error) {
      return { healthy: false, error: error.message };
    }
  }
  
  private async checkRedis(): Promise<ServiceHealth> {
    try {
      const start = Date.now();
      await this.redis.ping();
      return { healthy: true, response_time: Date.now() - start };
    } catch (error) {
      return { healthy: false, error: error.message };
    }
  }
  
  private async checkQueue(): Promise<ServiceHealth> {
    try {
      const waiting = await this.queue.getWaiting();
      const active = await this.queue.getActive();
      const failed = await this.queue.getFailed();
      
      return {
        healthy: true,
        details: { waiting: waiting.length, active: active.length, failed: failed.length }
      };
    } catch (error) {
      return { healthy: false, error: error.message };
    }
  }
  
  private async checkPlatforms(): Promise<ServiceHealth> {
    const platformChecks = await Promise.allSettled([
      this.checkSlackWebhook(),
      this.checkDiscordWebhook(),
      this.checkTelegramBot(),
    ]);
    
    const results = platformChecks.map((check, index) => ({
      platform: ['slack', 'discord', 'telegram'][index],
      healthy: check.status === 'fulfilled' && check.value,
      error: check.status === 'rejected' ? check.reason : undefined,
    }));
    
    return {
      healthy: results.some(r => r.healthy), // At least one platform should be healthy
      details: results,
    };
  }
  
  private async getMetrics(): Promise<SystemMetrics> {
    const [queueStats, dbStats] = await Promise.all([
      this.getQueueMetrics(),
      this.getDatabaseMetrics(),
    ]);
    
    return {
      queue: queueStats,
      database: dbStats,
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      timestamp: new Date().toISOString(),
    };
  }
}
```

#### 4.4 Observability & Metrics Collection
```typescript
// services/metrics.service.ts
export class MetricsService {
  private metrics = new Map<string, number>();
  
  incrementCounter(name: string, value: number = 1, tags?: Record<string, string>): void {
    const key = this.buildKey(name, tags);
    this.metrics.set(key, (this.metrics.get(key) || 0) + value);
  }
  
  recordHistogram(name: string, value: number, tags?: Record<string, string>): void {
    const key = this.buildKey(name, tags);
    // Store in Redis for aggregation
    this.redis.lpush(`histogram:${key}`, value);
    this.redis.expire(`histogram:${key}`, 3600); // 1 hour retention
  }
  
  async getMetrics(): Promise<Record<string, any>> {
    const counters = Object.fromEntries(this.metrics);
    const histograms = await this.getHistogramMetrics();
    
    return {
      counters,
      histograms,
      timestamp: new Date().toISOString(),
    };
  }
  
  private buildKey(name: string, tags?: Record<string, string>): string {
    if (!tags) return name;
    const tagString = Object.entries(tags)
      .map(([k, v]) => `${k}:${v}`)
      .join(',');
    return `${name}{${tagString}}`;
  }
}

// Usage in adapters and services
export class SlackAdapter extends BasePlatformAdapter {
  async send(message: FormattedMessage, channels: string[]): Promise<void> {
    const startTime = Date.now();
    
    try {
      // ... send logic
      
      this.metrics.incrementCounter('messages_sent_total', 1, { platform: 'slack', status: 'success' });
      this.metrics.recordHistogram('message_send_duration_ms', Date.now() - startTime, { platform: 'slack' });
    } catch (error) {
      this.metrics.incrementCounter('messages_sent_total', 1, { platform: 'slack', status: 'error' });
      this.metrics.recordHistogram('message_send_duration_ms', Date.now() - startTime, { platform: 'slack' });
      throw error;
    }
  }
}
```

#### 4.5 Advanced Job Management
```typescript
// api/v1/jobs/jobs.controller.ts
export class JobsController {
  async getJobStatus(request: FastifyRequest<{ Params: { jobId: string } }>): Promise<JobStatus> {
    const { jobId } = request.params;
    
    const job = await this.queue.getJob(jobId);
    if (!job) {
      throw new NotFoundError(`Job ${jobId} not found`);
    }
    
    const logs = await this.db.notificationLog.findMany({
      where: { jobId },
      include: { target: true },
      orderBy: { createdAt: 'desc' },
    });
    
    return {
      id: job.id,
      status: await job.getState(),
      progress: job.progress,
      data: job.data,
      attempts: job.attemptsMade,
      created_at: new Date(job.timestamp).toISOString(),
      processed_at: job.processedOn ? new Date(job.processedOn).toISOString() : null,
      finished_at: job.finishedOn ? new Date(job.finishedOn).toISOString() : null,
      logs: logs.map(log => ({
        target: log.target?.name,
        platform: log.target?.platform,
        status: log.status,
        error: log.errorMessage,
        response_time: log.responseTime,
        created_at: log.createdAt.toISOString(),
      })),
    };
  }
  
  async retryJob(request: FastifyRequest<{ Params: { jobId: string } }>): Promise<{ success: boolean }> {
    const { jobId } = request.params;
    
    const job = await this.queue.getJob(jobId);
    if (!job) {
      throw new NotFoundError(`Job ${jobId} not found`);
    }
    
    await job.retry();
    
    return { success: true };
  }
  
  async getJobsList(request: FastifyRequest<{ Querystring: JobsQuery }>): Promise<JobsList> {
    const { status, limit = 50, offset = 0 } = request.query;
    
    let jobs;
    switch (status) {
      case 'waiting':
        jobs = await this.queue.getWaiting(offset, offset + limit);
        break;
      case 'active':
        jobs = await this.queue.getActive(offset, offset + limit);
        break;
      case 'completed':
        jobs = await this.queue.getCompleted(offset, offset + limit);
        break;
      case 'failed':
        jobs = await this.queue.getFailed(offset, offset + limit);
        break;
      default:
        jobs = await this.queue.getJobs(['waiting', 'active', 'completed', 'failed'], offset, offset + limit);
    }
    
    return {
      jobs: jobs.map(job => ({
        id: job.id,
        status: job.opts.jobId,
        created_at: new Date(job.timestamp).toISOString(),
        targets_count: job.data.targets?.length || 0,
      })),
      total: jobs.length,
      offset,
      limit,
    };
  }
}
```

#### 4.6 Bulk Operations Support
```typescript
// api/v1/broadcast/bulk.controller.ts
export class BulkBroadcastController {
  async bulkBroadcast(request: FastifyRequest<{ Body: BulkBroadcastRequest }>): Promise<BulkBroadcastResponse> {
    const { messages, options } = request.body;
    
    // Validate bulk request
    if (messages.length > 100) {
      throw new ValidationError('Maximum 100 messages per bulk request');
    }
    
    const jobIds = [];
    const errors = [];
    
    for (const [index, message] of messages.entries()) {
      try {
        const jobId = await this.producer.createBroadcastJob({
          ...message,
          options: { ...options, ...message.options },
        });
        jobIds.push({ index, job_id: jobId });
      } catch (error) {
        errors.push({ index, error: error.message });
      }
    }
    
    return {
      success: errors.length === 0,
      total_messages: messages.length,
      successful_jobs: jobIds.length,
      failed_jobs: errors.length,
      job_ids: jobIds,
      errors,
    };
  }
}
```

## Project Structure

```
postmaster/
├── docs/
│   ├── idea.md
│   ├── plan.md
│   ├── api.md
│   └── deployment.md
├── prisma/
│   ├── schema.prisma
│   ├── migrations/
│   └── seed.ts
├── src/
│   ├── adapters/
│   │   ├── base.adapter.ts
│   │   ├── slack.adapter.ts
│   │   ├── discord.adapter.ts
│   │   ├── telegram.adapter.ts
│   │   └── index.ts
│   ├── api/
│   │   └── v1/
│   │       ├── broadcast/
│   │       │   ├── broadcast.controller.ts
│   │       │   ├── bulk.controller.ts
│   │       │   ├── broadcast.schema.ts
│   │       │   └── index.ts
│   │       ├── jobs/
│   │       │   ├── jobs.controller.ts
│   │       │   ├── jobs.schema.ts
│   │       │   └── index.ts
│   │       ├── health/
│   │       │   ├── health.controller.ts
│   │       │   └── index.ts
│   │       ├── platforms/
│   │       │   ├── platforms.controller.ts
│   │       │   └── index.ts
│   │       └── index.ts
│   ├── config/
│   │   ├── database.ts
│   │   ├── redis.ts
│   │   ├── platforms.ts
│   │   └── index.ts
│   ├── formatters/
│   │   ├── base.formatter.ts
│   │   ├── slack.formatter.ts
│   │   ├── discord.formatter.ts
│   │   ├── telegram.formatter.ts
│   │   └── index.ts
│   ├── jobs/
│   │   ├── notification.producer.ts
│   │   ├── notification.worker.ts
│   │   ├── cleanup.worker.ts
│   │   └── index.ts
│   ├── middleware/
│   │   ├── auth.middleware.ts
│   │   ├── rate-limit.middleware.ts
│   │   ├── validation.middleware.ts
│   │   └── index.ts
│   ├── services/
│   │   ├── db.service.ts
│   │   ├── dispatcher.service.ts
│   │   ├── message-formatter.service.ts
│   │   ├── metrics.service.ts
│   │   ├── rate-limiter.service.ts
│   │   ├── template.service.ts
│   │   └── index.ts
│   ├── templates/
│   │   ├── slack.template.ts
│   │   ├── discord.template.ts
│   │   ├── telegram.template.ts
│   │   └── index.ts
│   ├── types/
│   │   ├── api.types.ts
│   │   ├── errors.types.ts
│   │   ├── platform.types.ts
│   │   ├── job.types.ts
│   │   └── index.ts
│   ├── utils/
│   │   ├── logger.ts
│   │   ├── validation.ts
│   │   ├── crypto.ts
│   │   └── index.ts
│   ├── app.ts
│   └── server.ts
├── tests/
│   ├── unit/
│   │   ├── adapters/
│   │   ├── services/
│   │   ├── formatters/
│   │   └── utils/
│   ├── integration/
│   │   ├── api/
│   │   ├── jobs/
│   │   └── database/
│   ├── e2e/
│   │   ├── broadcast.test.ts
│   │   ├── health.test.ts
│   │   └── jobs.test.ts
│   └── fixtures/
│       ├── messages.json
│       ├── templates.json
│       └── webhooks.json
├── scripts/
│   ├── setup.sh
│   ├── migrate.sh
│   ├── seed.sh
│   └── deploy.sh
├── logs/
│   ├── err.log
│   ├── out.log
│   └── combined.log
├── data/
│   └── postmaster.db
├── .env.example
├── .env.test
├── .gitignore
├── ecosystem.config.js
├── package.json
├── tsconfig.json
├── jest.config.js
├── eslint.config.js
├── prettier.config.js
└── README.md
```

## Testing Strategy

### Unit Tests
- [ ] **Adapter functionality**
  - Message formatting for each platform
  - Error handling and retry logic
  - Rate limiting behavior
  - Platform-specific validation
- [ ] **Message formatting**
  - Plain text, markdown, and rich formatting
  - Template rendering with variables
  - Message size validation
  - Cross-platform compatibility
- [ ] **Database operations**
  - CRUD operations for all models
  - Transaction handling
  - Migration scripts
  - Data integrity constraints
- [ ] **Queue job creation**
  - Job priority handling
  - Scheduling logic
  - Deduplication mechanisms
  - Retry configuration

### Integration Tests
- [ ] **Full API → Queue → Worker → Platform flow**
  - End-to-end message delivery
  - Error propagation and handling
  - Job status tracking
  - Platform failure scenarios
- [ ] **Database migrations**
  - Schema evolution testing
  - Data migration validation
  - Rollback procedures
  - Performance impact assessment
- [ ] **Error handling scenarios**
  - Platform downtime simulation
  - Network timeout handling
  - Invalid webhook responses
  - Rate limit enforcement
- [ ] **Retry mechanisms**
  - Exponential backoff validation
  - Maximum retry limits
  - Dead letter queue handling
  - Recovery after platform restoration

### Load Tests
- [ ] **API endpoint performance**
  - Concurrent request handling
  - Response time under load
  - Memory usage patterns
  - CPU utilization metrics
- [ ] **Queue throughput**
  - Job processing rates
  - Queue depth management
  - Worker scaling behavior
  - Redis performance impact
- [ ] **Database connection limits**
  - Connection pool exhaustion
  - Query performance degradation
  - Lock contention scenarios
  - Backup and recovery impact
- [ ] **Memory usage under load**
  - Memory leak detection
  - Garbage collection impact
  - Buffer overflow protection
  - Resource cleanup validation

### End-to-End Tests
- [ ] **Complete user workflows**
  - API key creation and management
  - Message broadcasting scenarios
  - Job monitoring and retry
  - Platform configuration updates
- [ ] **Security testing**
  - Authentication bypass attempts
  - Rate limiting enforcement
  - Input validation testing
  - SQL injection prevention
- [ ] **Monitoring and alerting**
  - Health check accuracy
  - Metrics collection validation
  - Alert threshold testing
  - Dashboard functionality

## Deployment Considerations

### Host Setup Requirements

#### Redis Installation
```bash
# Ubuntu/Debian
sudo apt update
sudo apt install redis-server

# Configure Redis
sudo nano /etc/redis/redis.conf
# Set password: requirepass your-secure-redis-password
# Set bind: bind 127.0.0.1 ::1

# Start Redis
sudo systemctl start redis-server
sudo systemctl enable redis-server

# Test Redis
redis-cli ping
```

#### Node.js & PM2 Setup
```bash
# Install Node.js (using NodeSource repository)
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install PM2 globally
sudo npm install -g pm2

# Setup PM2 to start on boot
pm2 startup
sudo env PATH=$PATH:/usr/bin /usr/lib/node_modules/pm2/bin/pm2 startup systemd -u $USER --hp $HOME
```

### Application Deployment

#### Initial Setup
```bash
# Clone and setup application
git clone <your-repo> postmaster
cd postmaster

# Install dependencies
npm install

# Setup environment
cp .env.example .env
# Edit .env with your configuration

# Setup database
npx prisma generate
npx prisma migrate deploy
npx prisma db seed

# Build application
npm run build

# Create necessary directories
mkdir -p logs data

# Start with PM2
npm run pm2:start

# Save PM2 configuration
pm2 save
```

#### Deployment Script
```bash
#!/bin/bash
# scripts/deploy.sh

set -e

echo "🚀 Deploying Postmaster..."

# Pull latest code
git pull origin main

# Install dependencies
npm ci --only=production

# Run database migrations
npx prisma migrate deploy

# Build application
npm run build

# Restart PM2 process
npm run pm2:restart

echo "✅ Deployment complete!"

# Show status
pm2 status
pm2 logs postmaster --lines 10
```

### Environment Variables
```bash
# Server
PORT=3000
HOST=0.0.0.0
NODE_ENV=production

# Database (SQLite file on host)
DATABASE_URL=file:./data/postmaster.db

# Redis (running on host)
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=your-secure-redis-password

# Authentication (Simple shared key)
API_KEY=your-secret-api-key-here

# Platform Webhooks
SLACK_WEBHOOK_URL=https://hooks.slack.com/...
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/...
TELEGRAM_BOT_TOKEN=your-telegram-bot-token

# Rate Limiting
SLACK_RATE_LIMIT=60
DISCORD_RATE_LIMIT=30
TELEGRAM_RATE_LIMIT=30

# Queue Configuration
QUEUE_DEFAULT_RETRIES=3
QUEUE_BACKOFF_MULTIPLIER=2
QUEUE_DEFAULT_DELAY=5000

# Monitoring
METRICS_ENABLED=true
HEALTH_CHECK_INTERVAL=30
```

### Production Checklist
- [ ] **Host Setup**
  - Install and configure Redis server
  - Install Node.js and PM2
  - Setup firewall rules (allow port 3000 internally)
  - Configure log rotation for application logs
- [ ] **Application Setup**
  - Clone repository and install dependencies
  - Configure environment variables
  - Run database migrations and seeding
  - Build and start application with PM2
- [ ] **Security**
  - Set up proper file permissions
  - Configure Redis password
  - Set strong API key
  - Enable basic monitoring and alerting
- [ ] **Monitoring & Maintenance**
  - Set up log monitoring
  - Configure PM2 monitoring
  - Set up basic health checks
  - Plan for database backups (SQLite file backup)
- [ ] **Integration**
  - Test API connectivity from LMS
  - Verify webhook configurations
  - Test message delivery to all platforms

## Potential Challenges & Solutions

### 1. Message Formatting Complexity
**Challenge**: Different platforms have very different formatting rules and limitations.
**Solution**: 
- Create a unified message format that can be translated to each platform's specifics
- Implement platform-specific formatters with fallback mechanisms
- Add message size validation before sending

### 2. Rate Limiting Coordination
**Challenge**: If you scale to multiple workers, you'll need distributed rate limiting.
**Solution**: 
- Use Redis-based rate limiting with the `rate-limiter-flexible` library
- Implement per-platform and per-webhook rate limiting
- Add graceful degradation when rate limits are hit

### 3. Webhook Management
**Challenge**: Managing and validating webhooks across different platforms.
**Solution**: 
- Add webhook validation during target creation
- Implement automatic retry with exponential backoff for webhook registration
- Store webhook metadata and health status

### 4. Error Categorization
**Challenge**: Different platforms return different error formats and codes.
**Solution**: 
- Implement comprehensive error categorization system
- Map platform-specific errors to common error types
- Add retry logic based on error type (permanent vs temporary)

### 5. Message Deduplication at Scale
**Challenge**: Ensuring deduplication works across multiple workers and high throughput.
**Solution**: 
- Use Redis for distributed deduplication with TTL
- Implement message hashing for content-based deduplication
- Add cleanup jobs for expired deduplication records

### 6. Platform Downtime Handling
**Challenge**: Gracefully handling when entire platforms are down.
**Solution**: 
- Implement circuit breaker pattern for platform adapters
- Add platform health monitoring and automatic recovery
- Queue messages during downtime with extended retry windows

### 7. Configuration Management
**Challenge**: Managing platform configurations and credentials securely.
**Solution**: 
- Use environment variables for sensitive data
- Implement configuration validation on startup
- Add support for configuration hot-reloading

### 8. Monitoring and Observability
**Challenge**: Getting visibility into message delivery across platforms.
**Solution**: 
- Implement comprehensive metrics collection
- Add distributed tracing for message flows
- Create dashboards for platform health and performance

## Success Metrics

- **Delivery Rate**: > 99% successful message delivery
- **Latency**: < 5 seconds for immediate messages
- **Reliability**: < 0.1% permanent failures
- **Scalability**: Handle 1000+ messages per minute
- **Uptime**: > 99.9% service availability

## Next Steps

1. **Phase 0 Implementation**: Start with MVP validation
   - [ ] Set up basic Node.js project with TypeScript
   - [ ] Implement Slack-only adapter with webhook support
   - [ ] Create simple API endpoint for message broadcasting
   - [ ] Set up basic queue processing with BullMQ
   - [ ] Add Docker setup for local development
   - [ ] Test end-to-end message delivery to Slack

2. **Phase 1 Implementation**: Build core infrastructure
   - [ ] Set up comprehensive database schema with Prisma
   - [ ] Implement API key authentication system
   - [ ] Add request validation and error handling
   - [ ] Set up structured logging and monitoring
   - [ ] Create production-ready Docker configuration

3. **MVP Development**: Expand to multi-platform support
   - [ ] Add Discord and Telegram adapters
   - [ ] Implement message formatting for each platform
   - [ ] Add comprehensive error handling and retry logic
   - [ ] Set up rate limiting per platform

4. **Testing & Validation**: Ensure reliability
   - [ ] Write unit tests for all adapters and services
   - [ ] Create integration tests for API endpoints
   - [ ] Set up load testing for queue processing
   - [ ] Implement end-to-end testing scenarios

5. **Production Deployment**: Deploy to staging/production
   - [ ] Set up CI/CD pipeline
   - [ ] Configure monitoring and alerting
   - [ ] Set up database backups and recovery
   - [ ] Configure SSL and security headers

6. **Monitoring & Optimization**: Add observability tools
   - [ ] Implement metrics collection and dashboards
   - [ ] Set up error tracking and alerting
   - [ ] Add performance monitoring and optimization
   - [ ] Configure log aggregation and analysis

7. **Documentation**: Complete API documentation and guides
   - [ ] Create OpenAPI/Swagger documentation
   - [ ] Write deployment and troubleshooting guides
   - [ ] Document architecture decisions and patterns
   - [ ] Create user guides and examples

## Key Milestones

- **Week 1-2**: Phase 0 MVP with Slack integration
- **Week 3-4**: Phase 1 infrastructure and multi-platform support
- **Week 5-6**: Testing, monitoring, and production deployment
- **Week 7-8**: Documentation, optimization, and final polish
