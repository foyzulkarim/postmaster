/**
 * Error types for Postmaster application
 * Provides comprehensive error categorization for proper handling and retry logic
 */

export enum ErrorType {
  // Rate limiting errors
  RATE_LIMITED = 'rate_limited',
  
  // Configuration errors
  INVALID_WEBHOOK = 'invalid_webhook',
  INVALID_API_KEY = 'invalid_api_key',
  INVALID_CONFIG = 'invalid_config',
  
  // Platform-specific errors
  PLATFORM_DOWN = 'platform_down',
  PLATFORM_UNAVAILABLE = 'platform_unavailable',
  
  // Message validation errors
  MESSAGE_TOO_LARGE = 'message_too_large',
  INVALID_MESSAGE_FORMAT = 'invalid_message_format',
  MISSING_REQUIRED_FIELDS = 'missing_required_fields',
  
  // Authentication and authorization errors
  UNAUTHORIZED = 'unauthorized',
  FORBIDDEN = 'forbidden',
  
  // Network and connectivity errors
  NETWORK_ERROR = 'network_error',
  TIMEOUT_ERROR = 'timeout_error',
  CONNECTION_ERROR = 'connection_error',
  
  // Database errors
  DATABASE_ERROR = 'database_error',
  DATABASE_CONNECTION_ERROR = 'database_connection_error',
  
  // Queue errors
  QUEUE_ERROR = 'queue_error',
  JOB_PROCESSING_ERROR = 'job_processing_error',
  
  // Template errors
  TEMPLATE_NOT_FOUND = 'template_not_found',
  TEMPLATE_RENDER_ERROR = 'template_render_error',
  MISSING_TEMPLATE_VARIABLES = 'missing_template_variables',
  
  // Validation errors
  VALIDATION_ERROR = 'validation_error',
  SCHEMA_VALIDATION_ERROR = 'schema_validation_error',
  
  // Generic errors
  PERMANENT_FAILURE = 'permanent_failure',
  UNKNOWN_ERROR = 'unknown_error',
  INTERNAL_SERVER_ERROR = 'internal_server_error',
}

/**
 * Base error class for all Postmaster errors
 */
export abstract class PostmasterError extends Error {
  public readonly errorType: ErrorType;
  public readonly retryable: boolean;
  public readonly statusCode?: number;
  public readonly context?: Record<string, any>;
  public readonly timestamp: Date;

  constructor(
    message: string,
    errorType: ErrorType,
    retryable: boolean = false,
    statusCode?: number,
    context?: Record<string, any>
  ) {
    super(message);
    this.name = this.constructor.name;
    this.errorType = errorType;
    this.retryable = retryable;
    this.statusCode = statusCode;
    this.context = context;
    this.timestamp = new Date();
    
    // Ensure proper prototype chain for instanceof checks
    Object.setPrototypeOf(this, new.target.prototype);
  }

  /**
   * Convert error to JSON for logging and API responses
   */
  toJSON(): Record<string, any> {
    return {
      name: this.name,
      message: this.message,
      errorType: this.errorType,
      retryable: this.retryable,
      statusCode: this.statusCode,
      context: this.context,
      timestamp: this.timestamp.toISOString(),
      stack: this.stack,
    };
  }
}

/**
 * Platform-specific errors (Slack, Discord, Telegram)
 */
export class PlatformError extends PostmasterError {
  public readonly platform: string;

  constructor(
    message: string,
    platform: string,
    statusCode?: number,
    retryable: boolean = true,
    errorType: ErrorType = ErrorType.UNKNOWN_ERROR,
    context?: Record<string, any>
  ) {
    super(message, errorType, retryable, statusCode, { ...context, platform });
    this.platform = platform;
  }
}

/**
 * Rate limiting specific errors
 */
export class RateLimitError extends PlatformError {
  public readonly retryAfter: number;

  constructor(
    message: string,
    retryAfter: number,
    platform: string = 'unknown',
    context?: Record<string, any>
  ) {
    super(
      message,
      platform,
      429,
      true,
      ErrorType.RATE_LIMITED,
      { ...context, retryAfter }
    );
    this.retryAfter = retryAfter;
  }
}

/**
 * Validation errors
 */
export class ValidationError extends PostmasterError {
  public readonly validationErrors: string[];

  constructor(
    message: string,
    validationErrors: string[] = [],
    context?: Record<string, any>
  ) {
    super(
      message,
      ErrorType.VALIDATION_ERROR,
      false,
      400,
      { ...context, validationErrors }
    );
    this.validationErrors = validationErrors;
  }
}

/**
 * Authentication errors
 */
export class AuthenticationError extends PostmasterError {
  constructor(
    message: string = 'Authentication failed',
    context?: Record<string, any>
  ) {
    super(message, ErrorType.UNAUTHORIZED, false, 401, context);
  }
}

/**
 * Authorization errors
 */
export class AuthorizationError extends PostmasterError {
  constructor(
    message: string = 'Access forbidden',
    context?: Record<string, any>
  ) {
    super(message, ErrorType.FORBIDDEN, false, 403, context);
  }
}

/**
 * Database errors
 */
export class DatabaseError extends PostmasterError {
  constructor(
    message: string,
    retryable: boolean = true,
    context?: Record<string, any>
  ) {
    super(
      message,
      ErrorType.DATABASE_ERROR,
      retryable,
      500,
      context
    );
  }
}

/**
 * Queue processing errors
 */
export class QueueError extends PostmasterError {
  public readonly jobId?: string;

  constructor(
    message: string,
    jobId?: string,
    retryable: boolean = true,
    context?: Record<string, any>
  ) {
    super(
      message,
      ErrorType.QUEUE_ERROR,
      retryable,
      500,
      { ...context, jobId }
    );
    this.jobId = jobId;
  }
}

/**
 * Template processing errors
 */
export class TemplateError extends PostmasterError {
  public readonly templateName?: string;

  constructor(
    message: string,
    templateName?: string,
    errorType: ErrorType = ErrorType.TEMPLATE_RENDER_ERROR,
    context?: Record<string, any>
  ) {
    super(
      message,
      errorType,
      false,
      400,
      { ...context, templateName }
    );
    this.templateName = templateName;
  }
}

/**
 * Network and connectivity errors
 */
export class NetworkError extends PostmasterError {
  constructor(
    message: string,
    retryable: boolean = true,
    context?: Record<string, any>
  ) {
    super(
      message,
      ErrorType.NETWORK_ERROR,
      retryable,
      503,
      context
    );
  }
}

/**
 * Configuration errors
 */
export class ConfigurationError extends PostmasterError {
  constructor(
    message: string,
    context?: Record<string, any>
  ) {
    super(
      message,
      ErrorType.INVALID_CONFIG,
      false,
      500,
      context
    );
  }
}

/**
 * Error factory for creating appropriate error instances
 */
export class ErrorFactory {
  /**
   * Create error from HTTP response
   */
  static fromHttpResponse(
    response: Response,
    platform?: string,
    context?: Record<string, any>
  ): PostmasterError {
    const statusCode = response.status;
    const statusText = response.statusText;
    
    if (statusCode === 401) {
      return new AuthenticationError(
        `HTTP ${statusCode}: ${statusText}`,
        { ...context, statusCode, platform }
      );
    }
    
    if (statusCode === 403) {
      return new AuthorizationError(
        `HTTP ${statusCode}: ${statusText}`,
        { ...context, statusCode, platform }
      );
    }
    
    if (statusCode === 429) {
      return new RateLimitError(
        `HTTP ${statusCode}: ${statusText}`,
        60, // Default retry after 60 seconds
        platform || 'unknown',
        { ...context, statusCode }
      );
    }
    
    if (platform) {
      return new PlatformError(
        `HTTP ${statusCode}: ${statusText}`,
        platform,
        statusCode,
        statusCode >= 500,
        statusCode >= 500 ? ErrorType.PLATFORM_DOWN : ErrorType.PERMANENT_FAILURE,
        context
      );
    }
    
    return new NetworkError(
      `HTTP ${statusCode}: ${statusText}`,
      statusCode >= 500,
      { ...context, statusCode }
    );
  }

  /**
   * Create error from generic error object
   */
  static fromError(
    error: any,
    platform?: string,
    context?: Record<string, any>
  ): PostmasterError {
    if (error instanceof PostmasterError) {
      return error;
    }
    
    if (error instanceof TypeError && error.message.includes('fetch')) {
      return new NetworkError(
        `Network error: ${error.message}`,
        true,
        { ...context, platform, originalError: error.message }
      );
    }
    
    if (platform) {
      return new PlatformError(
        error.message || 'Unknown platform error',
        platform,
        error.statusCode || error.status,
        true,
        ErrorType.UNKNOWN_ERROR,
        { ...context, originalError: error.message }
      );
    }
    
    return new PostmasterError(
      error.message || 'Unknown error',
      ErrorType.UNKNOWN_ERROR,
      false,
      500,
      { ...context, originalError: error.message }
    ) as any; // Cast needed due to abstract class
  }
}

/**
 * Error utilities
 */
export class ErrorUtils {
  /**
   * Check if error is retryable
   */
  static isRetryable(error: any): boolean {
    if (error instanceof PostmasterError) {
      return error.retryable;
    }
    
    // Default retry logic for non-Postmaster errors
    if (error.statusCode || error.status) {
      const statusCode = error.statusCode || error.status;
      return statusCode >= 500 || statusCode === 429;
    }
    
    return false;
  }

  /**
   * Get retry delay based on error type
   */
  static getRetryDelay(error: any, attempt: number): number {
    if (error instanceof RateLimitError) {
      return error.retryAfter * 1000; // Convert to milliseconds
    }
    
    // Exponential backoff: 2^attempt * 1000ms, max 60 seconds
    return Math.min(Math.pow(2, attempt) * 1000, 60000);
  }

  /**
   * Extract error context for logging
   */
  static extractContext(error: any): Record<string, any> {
    if (error instanceof PostmasterError) {
      return error.context || {};
    }
    
    return {
      name: error.name,
      message: error.message,
      statusCode: error.statusCode || error.status,
      stack: error.stack,
    };
  }

  /**
   * Format error for API response
   */
  static formatForApi(error: any): Record<string, any> {
    if (error instanceof PostmasterError) {
      return {
        success: false,
        error: {
          code: error.errorType,
          message: error.message,
          retryable: error.retryable,
          details: error.context,
        },
        timestamp: error.timestamp.toISOString(),
      };
    }
    
    return {
      success: false,
      error: {
        code: ErrorType.UNKNOWN_ERROR,
        message: error.message || 'An unexpected error occurred',
        retryable: false,
      },
      timestamp: new Date().toISOString(),
    };
  }
}

// Re-export for backward compatibility
export {
  PlatformError,
  RateLimitError,
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  DatabaseError,
  QueueError,
  TemplateError,
  NetworkError,
  ConfigurationError,
};
