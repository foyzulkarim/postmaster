import Joi from 'joi';

// Message validation schema
const messageSchema = Joi.object({
  title: Joi.string().max(200).optional(),
  content: Joi.string().required().max(10000),
  format: Joi.string().valid('plain', 'markdown', 'rich').default('plain'),
  max_length: Joi.number().integer().min(1).max(10000).optional(),
});

// Target validation schema
const targetSchema = Joi.object({
  platform: Joi.string().valid('slack', 'discord', 'telegram', 'twitter').required(),
  channels: Joi.array().items(Joi.string().required()).min(1).required(),
  format_override: Joi.string().valid('plain', 'markdown', 'rich').optional(),
  template: Joi.string().optional(),
});

// Schedule validation schema
const scheduleSchema = Joi.object({
  send_at: Joi.string().isoDate().required(),
});

// Deduplication validation schema
const deduplicationSchema = Joi.object({
  key: Joi.string().required().max(255),
  window_seconds: Joi.number().integer().min(1).max(86400).default(3600), // Max 24 hours
});

// Retry configuration validation schema
const retryConfigSchema = Joi.object({
  max_attempts: Joi.number().integer().min(1).max(10).default(3),
  backoff_multiplier: Joi.number().min(1).max(10).default(2),
});

// Options validation schema
const optionsSchema = Joi.object({
  priority: Joi.string().valid('low', 'normal', 'high').default('normal'),
  schedule: scheduleSchema.optional(),
  deduplication: deduplicationSchema.optional(),
  retry_config: retryConfigSchema.optional(),
});

// Metadata validation schema
const metadataSchema = Joi.object({
  source_app: Joi.string().required().max(100),
  tags: Joi.array().items(Joi.string().max(50)).max(10).default([]),
  correlation_id: Joi.string().max(255).optional(),
  user_id: Joi.string().max(255).optional(),
});

// Main broadcast request validation schema
export const broadcastRequestSchema = Joi.object({
  message: messageSchema.required(),
  targets: Joi.array().items(targetSchema).min(1).max(10).required(),
  options: optionsSchema.optional(),
  metadata: metadataSchema.optional(),
});

// Validation options
export const validationOptions = {
  abortEarly: false, // Return all validation errors
  allowUnknown: false, // Don't allow unknown fields
  stripUnknown: true, // Remove unknown fields
};

// Type definitions for TypeScript support
export interface BroadcastMessage {
  title?: string;
  content: string;
  format?: 'plain' | 'markdown' | 'rich';
  max_length?: number;
}

export interface BroadcastTarget {
  platform: 'slack' | 'discord' | 'telegram' | 'twitter';
  channels: string[];
  format_override?: 'plain' | 'markdown' | 'rich';
  template?: string;
}

export interface BroadcastSchedule {
  send_at: string; // ISO 8601 timestamp
}

export interface BroadcastDeduplication {
  key: string;
  window_seconds: number;
}

export interface BroadcastRetryConfig {
  max_attempts: number;
  backoff_multiplier: number;
}

export interface BroadcastOptions {
  priority?: 'low' | 'normal' | 'high';
  schedule?: BroadcastSchedule;
  deduplication?: BroadcastDeduplication;
  retry_config?: BroadcastRetryConfig;
}

export interface BroadcastMetadata {
  source_app: string;
  tags: string[];
  correlation_id?: string;
  user_id?: string;
}

export interface BroadcastRequest {
  message: BroadcastMessage;
  targets: BroadcastTarget[];
  options?: BroadcastOptions;
  metadata?: BroadcastMetadata;
}

// Response schemas
export interface BroadcastResponse {
  success: boolean;
  job_id: string;
  message: string;
  scheduled_for?: string;
  targets_count: number;
  deduplication_applied?: boolean;
  estimated_delivery_time?: string;
}

export interface ErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: any;
  };
  request_id: string;
}

// Validation helper function
export const validateBroadcastRequest = (data: any): { error?: Joi.ValidationError; value?: BroadcastRequest } => {
  return broadcastRequestSchema.validate(data, validationOptions);
};

export default broadcastRequestSchema;
