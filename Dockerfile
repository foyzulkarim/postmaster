# Multi-stage Dockerfile for Postmaster

# Base stage with Node.js
FROM node:18-alpine AS base
WORKDIR /app

# Install system dependencies
RUN apk add --no-cache \
    sqlite \
    openssl \
    && rm -rf /var/cache/apk/*

# Copy package files
COPY package*.json ./
COPY prisma ./prisma/

# Development stage
FROM base AS development
ENV NODE_ENV=development

# Install all dependencies (including dev dependencies)
RUN npm ci

# Copy source code
COPY . .

# Generate Prisma client
RUN npx prisma generate

# Create necessary directories
RUN mkdir -p data logs

# Expose port
EXPOSE 3000

# Default command (can be overridden in docker-compose)
CMD ["npm", "run", "dev"]

# Build stage
FROM base AS build
ENV NODE_ENV=production

# Install all dependencies first (for building)
RUN npm ci

# Copy source code
COPY . .

# Generate Prisma client
RUN npx prisma generate

# Build the application
RUN npm run build

# Remove dev dependencies
RUN npm ci --only=production && npm cache clean --force

# Production stage
FROM node:18-alpine AS production
WORKDIR /app

# Install system dependencies
RUN apk add --no-cache \
    sqlite \
    openssl \
    && rm -rf /var/cache/apk/*

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S postmaster -u 1001

# Copy built application from build stage
COPY --from=build --chown=postmaster:nodejs /app/dist ./dist
COPY --from=build --chown=postmaster:nodejs /app/node_modules ./node_modules
COPY --from=build --chown=postmaster:nodejs /app/prisma ./prisma
COPY --from=build --chown=postmaster:nodejs /app/package*.json ./

# Create necessary directories
RUN mkdir -p data logs && \
    chown -R postmaster:nodejs data logs

# Switch to non-root user
USER postmaster

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3000/api/v1/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) })"

# Start the application
CMD ["npm", "start"]
