# Postmaster Execution Flow & Architecture

This document provides visual representations of how the Postmaster system works, including class relationships, API execution flow, and data flow patterns.

## Table of Contents
1. [System Architecture Overview](#system-architecture-overview)
2. [Class Diagram](#class-diagram)
3. [API Request Flow](#api-request-flow)
4. [Job Processing Flow](#job-processing-flow)
5. [Error Handling Flow](#error-handling-flow)
6. [Database Interaction Flow](#database-interaction-flow)
7. [Platform Adapter Flow](#platform-adapter-flow)

## System Architecture Overview

```mermaid
graph TB
    subgraph "External Systems"
        LMS[LMS Application]
        SLACK[Slack API]
        DISCORD[Discord API]
        TELEGRAM[Telegram API]
    end
    
    subgraph "Postmaster System"
        subgraph "API Layer"
            API[Fastify Server]
            AUTH[Auth Middleware]
            VALID[Validation Middleware]
        end
        
        subgraph "Business Logic"
            CTRL[Broadcast Controller]
            PROD[Job Producer]
            DISP[Dispatcher Service]
        end
        
        subgraph "Queue System"
            REDIS[(Redis Queue)]
            WORKER[Notification Worker]
        end
        
        subgraph "Platform Layer"
            SLACK_ADAPTER[Slack Adapter]
            DISCORD_ADAPTER[Discord Adapter]
            TELEGRAM_ADAPTER[Telegram Adapter]
        end
        
        subgraph "Data Layer"
            DB[(SQLite Database)]
            PRISMA[Prisma Client]
        end
    end
    
    LMS -->|HTTP Request| API
    API -->|Authenticate| AUTH
    AUTH -->|Validate| VALID
    VALID -->|Process| CTRL
    CTRL -->|Create Job| PROD
    PROD -->|Add Job| REDIS
    REDIS -->|Process Job| WORKER
    WORKER -->|Dispatch| DISP
    DISP -->|Send to Slack| SLACK_ADAPTER
    DISP -->|Send to Discord| DISCORD_ADAPTER
    DISP -->|Send to Telegram| TELEGRAM_ADAPTER
    
    SLACK_ADAPTER -->|API Call| SLACK
    DISCORD_ADAPTER -->|API Call| DISCORD
    TELEGRAM_ADAPTER -->|API Call| TELEGRAM
    
    CTRL -->|Log Request| PRISMA
    WORKER -->|Log Processing| PRISMA
    PRISMA -->|DB Operations| DB
```

## Class Diagram

```mermaid
classDiagram
    class FastifyApp {
        +register(routes)
        +addHook(middleware)
        +listen(port)
    }
    
    class AuthMiddleware {
        +validateApiKey(request, reply, done)
        -checkToken(token): boolean
    }
    
    class BroadcastController {
        -producer: NotificationProducer
        -db: DatabaseService
        +broadcast(request): BroadcastResponse
        -validateRequest(body): ValidationResult
        -checkDeduplication(payload): boolean
    }
    
    class NotificationProducer {
        -queue: Queue
        +createBroadcastJob(payload): string
        -getPriority(priority): number
        -calculateDelay(schedule): number
    }
    
    class NotificationWorker {
        -dispatcher: DispatcherService
        -db: DatabaseService
        -logger: Logger
        +processJob(job): void
        -categorizeError(error): string
    }
    
    class DispatcherService {
        -adapters: Map~string, PlatformAdapter~
        -formatter: MessageFormatterService
        -rateLimiter: RateLimiterService
        +dispatch(payload): void
        -getAdapter(platform): PlatformAdapter
        -formatMessage(message, target): FormattedMessage
    }
    
    class BasePlatformAdapter {
        <<abstract>>
        #rateLimiter: RateLimiter
        #logger: Logger
        +send(message, channels)*: void
        #handleRateLimit(error): void
        #categorizeError(error): ErrorType
    }
    
    class SlackAdapter {
        -webhookUrl: string
        +send(message, channels): void
        -isRetryable(statusCode): boolean
    }
    
    class DiscordAdapter {
        -webhookUrl: string
        +send(message, channels): void
        -getWebhookUrl(channel): string
    }
    
    class TelegramAdapter {
        -botToken: string
        +send(message, channels): void
    }
    
    class DatabaseService {
        -prisma: PrismaClient
        +findTargetsByPlatform(platform): NotificationTarget[]
        +createLogEntry(entry): void
        +updateLogStatus(jobId, status, error): void
        +incrementFailureCount(targetId): void
        +resetFailureCount(targetId): void
    }
    
    class MessageFormatterService {
        +formatForPlatform(message, platform, format): FormattedMessage
        -getFormatter(platform): PlatformFormatter
    }
    
    class RateLimiterService {
        -limiters: Map~string, RateLimiterRedis~
        +checkLimit(platform, identifier): boolean
        +getRemainingPoints(platform, identifier): number
        -initializeLimiters(): void
    }
    
    class HealthController {
        -db: DatabaseService
        -redis: Redis
        -queue: Queue
        +getHealth(): HealthStatus
        -checkDatabase(): ServiceHealth
        -checkRedis(): ServiceHealth
        -checkQueue(): ServiceHealth
        -checkPlatforms(): ServiceHealth
    }
    
    FastifyApp --> AuthMiddleware
    FastifyApp --> BroadcastController
    FastifyApp --> HealthController
    BroadcastController --> NotificationProducer
    BroadcastController --> DatabaseService
    NotificationWorker --> DispatcherService
    NotificationWorker --> DatabaseService
    DispatcherService --> BasePlatformAdapter
    DispatcherService --> MessageFormatterService
    DispatcherService --> RateLimiterService
    BasePlatformAdapter <|-- SlackAdapter
    BasePlatformAdapter <|-- DiscordAdapter
    BasePlatformAdapter <|-- TelegramAdapter
```

## API Request Flow

```mermaid
sequenceDiagram
    participant LMS as LMS Application
    participant API as Fastify Server
    participant AUTH as Auth Middleware
    participant CTRL as Broadcast Controller
    participant PROD as Job Producer
    participant REDIS as Redis Queue
    participant DB as Database
    
    LMS->>+API: POST /api/v1/broadcast
    Note over LMS,API: Authorization: Bearer <api_key>
    
    API->>+AUTH: Validate Request
    AUTH->>AUTH: Check API Key
    alt Invalid API Key
        AUTH->>-API: 401 Unauthorized
        API->>-LMS: Error Response
    else Valid API Key
        AUTH->>-API: Continue
        
        API->>+CTRL: Process Broadcast Request
        CTRL->>CTRL: Validate Payload
        
        alt Invalid Payload
            CTRL->>-API: 400 Bad Request
            API->>-LMS: Validation Error
        else Valid Payload
            CTRL->>+DB: Check Deduplication
            DB->>-CTRL: Deduplication Result
            
            CTRL->>+PROD: Create Broadcast Job
            PROD->>+REDIS: Add Job to Queue
            REDIS->>-PROD: Job ID
            PROD->>-CTRL: Job Created
            
            CTRL->>+DB: Log Job Creation
            DB->>-CTRL: Log Saved
            
            CTRL->>-API: Success Response
            API->>-LMS: 200 OK with Job ID
        end
    end
```

## Job Processing Flow

```mermaid
sequenceDiagram
    participant REDIS as Redis Queue
    participant WORKER as Notification Worker
    participant DISP as Dispatcher Service
    participant RATE as Rate Limiter
    participant ADAPTER as Platform Adapter
    participant PLATFORM as External Platform
    participant DB as Database
    
    REDIS->>+WORKER: Process Job
    WORKER->>+DB: Log Job Start
    DB->>-WORKER: Logged
    
    WORKER->>+DISP: Dispatch Message
    
    loop For Each Target Platform
        DISP->>+RATE: Check Rate Limit
        RATE->>-DISP: Rate Limit OK
        
        DISP->>DISP: Format Message
        DISP->>+ADAPTER: Send Message
        
        ADAPTER->>+PLATFORM: HTTP Request
        alt Success Response
            PLATFORM->>-ADAPTER: 200 OK
            ADAPTER->>-DISP: Success
        else Rate Limited
            PLATFORM->>-ADAPTER: 429 Too Many Requests
            ADAPTER->>ADAPTER: Extract Retry-After
            ADAPTER->>-DISP: Rate Limit Error
        else Server Error
            PLATFORM->>-ADAPTER: 5xx Error
            ADAPTER->>-DISP: Retryable Error
        else Client Error
            PLATFORM->>-ADAPTER: 4xx Error
            ADAPTER->>-DISP: Permanent Error
        end
    end
    
    DISP->>-WORKER: Dispatch Complete
    
    alt All Platforms Failed
        WORKER->>+DB: Log Failure
        DB->>-WORKER: Logged
        WORKER->>-REDIS: Throw Error (Retry)
    else Success or Partial Success
        WORKER->>+DB: Log Success
        DB->>-WORKER: Logged
        WORKER->>-REDIS: Job Complete
    end
```

## Error Handling Flow

```mermaid
flowchart TD
    START[Job Processing Starts] --> SEND[Send to Platform]
    
    SEND --> CHECK{Response Status}
    
    CHECK -->|200-299| SUCCESS[Log Success]
    CHECK -->|429| RATE_LIMIT[Rate Limited]
    CHECK -->|4xx| CLIENT_ERROR[Client Error]
    CHECK -->|5xx| SERVER_ERROR[Server Error]
    CHECK -->|Network Error| NETWORK_ERROR[Network Error]
    
    RATE_LIMIT --> EXTRACT[Extract Retry-After]
    EXTRACT --> SCHEDULE[Schedule Retry]
    SCHEDULE --> RETRY_QUEUE[Add to Retry Queue]
    
    CLIENT_ERROR --> CATEGORIZE[Categorize Error]
    CATEGORIZE --> PERMANENT{Permanent?}
    PERMANENT -->|Yes| LOG_PERMANENT[Log Permanent Failure]
    PERMANENT -->|No| RETRY_LOGIC[Apply Retry Logic]
    
    SERVER_ERROR --> RETRY_LOGIC
    NETWORK_ERROR --> RETRY_LOGIC
    
    RETRY_LOGIC --> CHECK_ATTEMPTS{Max Attempts?}
    CHECK_ATTEMPTS -->|Exceeded| LOG_FAILED[Log Failed]
    CHECK_ATTEMPTS -->|Not Exceeded| BACKOFF[Calculate Backoff]
    
    BACKOFF --> SCHEDULE_RETRY[Schedule Retry]
    SCHEDULE_RETRY --> RETRY_QUEUE
    
    SUCCESS --> UPDATE_SUCCESS[Update Success Metrics]
    LOG_PERMANENT --> UPDATE_PERMANENT[Update Failure Metrics]
    LOG_FAILED --> UPDATE_FAILED[Update Failure Metrics]
    
    UPDATE_SUCCESS --> END[Job Complete]
    UPDATE_PERMANENT --> END
    UPDATE_FAILED --> END
    RETRY_QUEUE --> END
```

## Database Interaction Flow

```mermaid
erDiagram
    NotificationTarget {
        int id PK
        string name
        string platform
        string webhookUrl
        string config
        boolean active
        int rateLimitPerMinute
        datetime lastUsedAt
        int failureCount
        datetime createdAt
        datetime updatedAt
    }
    
    NotificationLog {
        int id PK
        string jobId
        int targetId FK
        string messageHash
        string status
        string errorType
        int attemptCount
        string errorMessage
        string payload
        int responseTime
        datetime createdAt
        datetime updatedAt
    }
    
    MessageDeduplication {
        int id PK
        string dedupKey
        string messageHash
        string jobId
        datetime expiresAt
        datetime createdAt
    }
    
    MessageTemplate {
        int id PK
        string name
        string platform
        string template
        string variables
        boolean active
        datetime createdAt
        datetime updatedAt
    }
    
    NotificationTarget ||--o{ NotificationLog : "has logs"
```

## Platform Adapter Flow

```mermaid
flowchart TD
    subgraph "Adapter Pattern"
        BASE[BasePlatformAdapter]
        SLACK[SlackAdapter]
        DISCORD[DiscordAdapter]
        TELEGRAM[TelegramAdapter]
        
        BASE --> SLACK
        BASE --> DISCORD
        BASE --> TELEGRAM
    end
    
    subgraph "Message Flow"
        MSG[Formatted Message] --> ADAPTER{Select Adapter}
        ADAPTER -->|slack| SLACK_SEND[Slack Send]
        ADAPTER -->|discord| DISCORD_SEND[Discord Send]
        ADAPTER -->|telegram| TELEGRAM_SEND[Telegram Send]
        
        SLACK_SEND --> SLACK_API[Slack Webhook API]
        DISCORD_SEND --> DISCORD_API[Discord Webhook API]
        TELEGRAM_SEND --> TELEGRAM_API[Telegram Bot API]
    end
    
    subgraph "Error Handling"
        SLACK_API --> SLACK_ERROR{Error?}
        DISCORD_API --> DISCORD_ERROR{Error?}
        TELEGRAM_API --> TELEGRAM_ERROR{Error?}
        
        SLACK_ERROR -->|Yes| HANDLE_ERROR[Handle Error]
        DISCORD_ERROR -->|Yes| HANDLE_ERROR
        TELEGRAM_ERROR -->|Yes| HANDLE_ERROR
        
        SLACK_ERROR -->|No| SUCCESS[Success]
        DISCORD_ERROR -->|No| SUCCESS
        TELEGRAM_ERROR -->|No| SUCCESS
        
        HANDLE_ERROR --> CATEGORIZE[Categorize Error Type]
        CATEGORIZE --> RATE_LIMITED[Rate Limited]
        CATEGORIZE --> PERMANENT[Permanent Failure]
        CATEGORIZE --> RETRYABLE[Retryable Error]
    end
```

## Data Flow Summary

### 1. **Request Ingestion**
- LMS sends HTTP request to Postmaster API
- Authentication middleware validates API key
- Request validation ensures payload correctness

### 2. **Job Creation**
- Broadcast controller processes the request
- Deduplication check prevents duplicate messages
- Job producer creates a queue job with retry configuration

### 3. **Queue Processing**
- Redis queue stores jobs with priority and scheduling
- Notification worker picks up jobs for processing
- Worker handles job lifecycle and error scenarios

### 4. **Message Dispatching**
- Dispatcher service coordinates message delivery
- Rate limiter prevents API abuse
- Message formatter adapts content for each platform

### 5. **Platform Delivery**
- Platform adapters handle platform-specific logic
- HTTP requests sent to external APIs (Slack, Discord, Telegram)
- Response handling and error categorization

### 6. **Logging & Monitoring**
- Database logs all job attempts and outcomes
- Metrics collection for monitoring and alerting
- Health checks ensure system reliability

## Key Design Patterns Used

1. **Adapter Pattern**: Platform adapters abstract different API implementations
2. **Producer-Consumer**: Queue-based job processing
3. **Strategy Pattern**: Different message formatters for different platforms
4. **Chain of Responsibility**: Middleware pipeline for request processing
5. **Template Method**: Base adapter defines common error handling flow
6. **Observer Pattern**: Metrics collection and logging throughout the system

This architecture ensures:
- **Reliability**: Queue-based processing with retries
- **Scalability**: Horizontal scaling through queue workers
- **Maintainability**: Clean separation of concerns
- **Extensibility**: Easy to add new platforms via adapter pattern
- **Observability**: Comprehensive logging and monitoring
