# Postmaster Implementation Checklist

This document provides a sequential checklist for implementing the Postmaster project. Each task should be completed in order. Refer to `docs/plan.md` for detailed specifications, code snippets, and context for each task.

## Phase 1: Project Setup & Core Infrastructure

### 1.1: Project Initialization & Dependencies
- [ ] Initialize a new Node.js project: `npm init -y`
- [ ] Add `typescript`, `@types/node`, `nodemon`, `ts-node` as development dependencies.
- [ ] Add `fastify`, `prisma`, `@prisma/client`, `bullmq`, `redis`, `pino`, `pino-pretty`, `joi` as production dependencies.
- [ ] Create a `tsconfig.json` file for TypeScript configuration.
- [ ] Create a comprehensive `.gitignore` file.
- [ ] Create a `.dockerignore` file to exclude unnecessary files from the Docker build context.

### 1.2: Directory Structure
- [ ] Create the initial directory structure as defined in `plan.md`: `src`, `prisma`, `docs`, `tests`, etc.

### 1.3: Database Setup
- [ ] Initialize Prisma: `npx prisma init`
- [ ] Copy the full Prisma schema from `plan.md` into `prisma/schema.prisma`.
- [ ] Generate the Prisma client: `npx prisma generate`
- [ ] Create an initial migration: `npx prisma migrate dev --name init`
- [ ] Create a `prisma/seed.ts` file to populate the database with initial data (e.g., sample notification targets).
- [ ] Configure `package.json` to run the seed script.
- [ ] Seed the database: `npx prisma db seed`

### 1.4: Configuration
- [ ] Create the `src/config/index.ts` file with the structure from `plan.md`.
- [ ] Create a `.env.example` file listing all required environment variables.

### 1.5: Basic Server & Logging
- [ ] Create the main application file `src/app.ts` to set up the Fastify server.
- [ ] Create the server entry point `src/server.ts` to start the application.
- [ ] Create the logger utility in `src/utils/logger.ts` using Pino.
- [ ] Add a basic health check endpoint `/api/v1/health`.

### 1.6: Containerization & Process Management
- [ ] Create the `Dockerfile` as specified in the plan.
- [ ] Create the `docker-compose.yml` file.
- [ ] Create the `ecosystem.config.js` file for PM2.
- [ ] Add the `build`, `start`, `dev`, and `pm2:*` scripts to `package.json`.

## Phase 2: API & Job Queuing Core

### 2.1: Authentication
- [ ] Create the API key authentication middleware in `src/middleware/auth.middleware.ts`.
- [ ] Integrate the authentication middleware into the Fastify application.

### 2.2: API Implementation
- [ ] Create the Joi validation schema for the broadcast request in `src/api/v1/broadcast/broadcast.schema.ts`.
- [ ] Implement the broadcast controller in `src/api/v1/broadcast/broadcast.controller.ts`.
- [ ] Register the `/api/v1/broadcast` route.

### 2.3: Job Production
- [ ] Implement the `NotificationProducer` in `src/jobs/notification.producer.ts` to add jobs to the BullMQ queue.

### 2.4: Database Service
- [ ] Implement the `DatabaseService` in `src/services/db.service.ts` with all the methods defined in the plan.

### 2.5: Worker Implementation
- [ ] Create the worker entry point `src/worker.ts`.
- [ ] Implement the `NotificationWorker` in `src/jobs/notification.worker.ts` to process jobs from the queue.
- [ ] Add a new `worker` service to the `docker-compose.yml` file to run the worker process.

## Phase 3: Dispatching, Adapters & Error Handling

### 3.1: Core Services
- [ ] Implement the `DispatcherService` in `src/services/dispatcher.service.ts`.
- [ ] Implement the `MessageFormatterService` in `src/services/message-formatter.service.ts`.

### 3.2: Platform Adapters
- [ ] Create the `BasePlatformAdapter` in `src/adapters/base.adapter.ts`.
- [ ] Implement the `SlackAdapter` in `src/adapters/slack.adapter.ts`.
- [ ] Implement the `DiscordAdapter` in `src/adapters/discord.adapter.ts`.
- [ ] Implement the `TelegramAdapter` in `src/adapters/telegram.adapter.ts`.

### 3.3: Error Handling
- [ ] Define the custom error types in `src/types/errors.types.ts`.
- [ ] Enhance the worker's `processJob` method with the advanced error handling logic from the plan.

## Phase 4: Advanced Features & Monitoring

### 4.1: Advanced Services
- [ ] Implement the `TemplateService` in `src/services/template.service.ts`.
- [ ] Implement the `RateLimiterService` in `src/services/rate-limiter.service.ts`.

### 4.2: Advanced API Endpoints
- [ ] Implement the `JobsController` in `src/api/v1/jobs/jobs.controller.ts` to provide job status and retry functionality.
- [ ] Register the `/api/v1/jobs/:jobId` routes.
- [ ] Enhance the `HealthController` in `src/api/v1/health/health.controller.ts` with comprehensive checks for the database, Redis, and queue.

### 4.3: Testing
- [ ] Set up Jest with `jest.config.js`.
- [ ] Write unit tests for all services and adapters.
- [ ] Write integration tests for the API endpoints and job processing flow.
