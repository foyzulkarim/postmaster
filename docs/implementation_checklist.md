# Postmaster Implementation Checklist

This document provides a sequential checklist for implementing the Postmaster project. Each task should be completed in order. Refer to `docs/plan.md` for detailed specifications, code snippets, and context for each task.

## Phase 1: Project Setup & Core Infrastructure

### 1.1: Project Initialization & Dependencies
- [x] Initialize a new Node.js project: `npm init -y`
- [x] Add `typescript`, `@types/node`, `nodemon`, `ts-node` as development dependencies.
- [x] Add `fastify`, `prisma`, `@prisma/client`, `bullmq`, `redis`, `pino`, `pino-pretty`, `joi` as production dependencies.
- [x] Create a `tsconfig.json` file for TypeScript configuration.
- [x] Create a comprehensive `.gitignore` file.

### 1.2: Directory Structure
- [x] Create the initial directory structure as defined in `plan.md`: `src`, `prisma`, `docs`, `tests`, etc.

### 1.3: Database Setup
- [x] Initialize Prisma: `npx prisma init`
- [x] Copy the full Prisma schema from `plan.md` into `prisma/schema.prisma`.
- [x] Generate the Prisma client: `npx prisma generate`
- [x] Create an initial migration: `npx prisma migrate dev --name init`
- [x] Create a `prisma/seed.ts` file to populate the database with initial data (e.g., sample notification targets).
- [x] Configure `package.json` to run the seed script.
- [x] Seed the database: `npx prisma db seed`

### 1.4: Configuration
- [x] Create the `src/config/index.ts` file with the structure from `plan.md`.
- [x] Create a `.env.example` file listing all required environment variables.

### 1.5: Basic Server & Logging
- [x] Create the main application file `src/app.ts` to set up the Fastify server.
- [x] Create the server entry point `src/server.ts` to start the application.
- [x] Create the logger utility in `src/utils/logger.ts` using Pino.
- [x] Add a basic health check endpoint `/api/v1/health`.

## Phase 2: API & Job Queuing Core

### 2.1: Authentication
- [x] Create the API key authentication middleware in `src/middleware/auth.middleware.ts`.
- [x] Integrate the authentication middleware into the Fastify application.

### 2.2: API Implementation
- [x] Create the Joi validation schema for the broadcast request in `src/api/v1/broadcast/broadcast.schema.ts`.
- [x] Implement the broadcast controller in `src/api/v1/broadcast/broadcast.controller.ts`.
- [x] Register the `/api/v1/broadcast` route.

### 2.3: Job Production
- [x] Implement the `NotificationProducer` in `src/jobs/notification.producer.ts` to add jobs to the BullMQ queue.

### 2.4: Database Service
- [x] Implement the `DatabaseService` in `src/services/db.service.ts` with all the methods defined in the plan.

### 2.5: Worker Implementation
- [x] Create the worker entry point `src/worker.ts`.
- [x] Implement the `NotificationWorker` in `src/jobs/notification.worker.ts` to process jobs from the queue.

## Phase 3: Dispatching, Adapters & Error Handling

### 3.1: Core Services
- [x] Implement the `DispatcherService` in `src/services/dispatcher.service.ts`.
- [x] Implement the `MessageFormatterService` in `src/services/message-formatter.service.ts`.

### 3.2: Platform Adapters
- [x] Create the `BasePlatformAdapter` in `src/adapters/base.adapter.ts`.
- [x] Implement the `SlackAdapter` in `src/adapters/slack.adapter.ts`.
- [x] Implement the `DiscordAdapter` in `src/adapters/discord.adapter.ts`.
- [x] Implement the `TelegramAdapter` in `src/adapters/telegram.adapter.ts`.

### 3.3: Error Handling
- [x] Define the custom error types in `src/types/errors.types.ts`.
- [x] Enhance the worker's `processJob` method with the advanced error handling logic from the plan.

## Phase 4: Advanced Features & Monitoring

### 4.1: Advanced Services
- [x] Implement the `TemplateService` in `src/services/template.service.ts`.
- [x] Implement the `RateLimiterService` in `src/services/rate-limiter.service.ts`.

### 4.2: Advanced API Endpoints
- [x] Implement the `JobsController` in `src/api/v1/jobs/jobs.controller.ts` to provide job status and retry functionality.
- [x] Register the `/api/v1/jobs/:jobId` routes.
- [x] Enhance the `HealthController` in `src/api/v1/health/health.controller.ts` with comprehensive checks for the database, Redis, and queue.

### 4.3: Testing
- [x] Set up Jest with `jest.config.js`.
- [x] Write unit tests for all services and adapters.
- [x] Write integration tests for the API endpoints and job processing flow.
