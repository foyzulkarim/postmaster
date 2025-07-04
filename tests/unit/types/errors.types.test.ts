import {
  ErrorType,
  PostmasterError,
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
  ErrorFactory,
  ErrorUtils,
} from '../../../src/types/errors.types';

describe('Error Types', () => {
  describe('PostmasterError', () => {
    class TestError extends PostmasterError {
      constructor(message: string) {
        super(message, ErrorType.UNKNOWN_ERROR, false, 500);
      }
    }

    it('should create error with all properties', () => {
      const error = new TestError('Test error');

      expect(error.message).toBe('Test error');
      expect(error.errorType).toBe(ErrorType.UNKNOWN_ERROR);
      expect(error.retryable).toBe(false);
      expect(error.statusCode).toBe(500);
      expect(error.timestamp).toBeInstanceOf(Date);
    });

    it('should convert to JSON', () => {
      const error = new TestError('Test error');
      const json = error.toJSON();

      expect(json.name).toBe('TestError');
      expect(json.message).toBe('Test error');
      expect(json.errorType).toBe(ErrorType.UNKNOWN_ERROR);
      expect(json.retryable).toBe(false);
      expect(json.statusCode).toBe(500);
      expect(json.timestamp).toBeDefined();
    });
  });

  describe('PlatformError', () => {
    it('should create platform error', () => {
      const error = new PlatformError('Slack error', 'slack', 400, false, ErrorType.INVALID_WEBHOOK);

      expect(error.platform).toBe('slack');
      expect(error.statusCode).toBe(400);
      expect(error.retryable).toBe(false);
      expect(error.errorType).toBe(ErrorType.INVALID_WEBHOOK);
    });

    it('should default to retryable and unknown error type', () => {
      const error = new PlatformError('Generic error', 'discord');

      expect(error.retryable).toBe(true);
      expect(error.errorType).toBe(ErrorType.UNKNOWN_ERROR);
    });
  });

  describe('RateLimitError', () => {
    it('should create rate limit error', () => {
      const error = new RateLimitError('Rate limited', 60, 'slack');

      expect(error.retryAfter).toBe(60);
      expect(error.platform).toBe('slack');
      expect(error.statusCode).toBe(429);
      expect(error.retryable).toBe(true);
      expect(error.errorType).toBe(ErrorType.RATE_LIMITED);
    });

    it('should default to unknown platform', () => {
      const error = new RateLimitError('Rate limited', 30);

      expect(error.platform).toBe('unknown');
    });
  });

  describe('ValidationError', () => {
    it('should create validation error', () => {
      const validationErrors = ['Field is required', 'Invalid format'];
      const error = new ValidationError('Validation failed', validationErrors);

      expect(error.validationErrors).toEqual(validationErrors);
      expect(error.statusCode).toBe(400);
      expect(error.retryable).toBe(false);
      expect(error.errorType).toBe(ErrorType.VALIDATION_ERROR);
    });
  });

  describe('AuthenticationError', () => {
    it('should create authentication error', () => {
      const error = new AuthenticationError();

      expect(error.message).toBe('Authentication failed');
      expect(error.statusCode).toBe(401);
      expect(error.retryable).toBe(false);
      expect(error.errorType).toBe(ErrorType.UNAUTHORIZED);
    });

    it('should accept custom message', () => {
      const error = new AuthenticationError('Invalid token');

      expect(error.message).toBe('Invalid token');
    });
  });

  describe('AuthorizationError', () => {
    it('should create authorization error', () => {
      const error = new AuthorizationError();

      expect(error.message).toBe('Access forbidden');
      expect(error.statusCode).toBe(403);
      expect(error.retryable).toBe(false);
      expect(error.errorType).toBe(ErrorType.FORBIDDEN);
    });
  });

  describe('DatabaseError', () => {
    it('should create database error', () => {
      const error = new DatabaseError('Connection failed');

      expect(error.message).toBe('Connection failed');
      expect(error.statusCode).toBe(500);
      expect(error.retryable).toBe(true);
      expect(error.errorType).toBe(ErrorType.DATABASE_ERROR);
    });

    it('should allow non-retryable database errors', () => {
      const error = new DatabaseError('Schema error', false);

      expect(error.retryable).toBe(false);
    });
  });

  describe('QueueError', () => {
    it('should create queue error', () => {
      const error = new QueueError('Job failed', 'job-123');

      expect(error.message).toBe('Job failed');
      expect(error.jobId).toBe('job-123');
      expect(error.statusCode).toBe(500);
      expect(error.retryable).toBe(true);
      expect(error.errorType).toBe(ErrorType.QUEUE_ERROR);
    });
  });

  describe('TemplateError', () => {
    it('should create template error', () => {
      const error = new TemplateError('Template not found', 'my-template', ErrorType.TEMPLATE_NOT_FOUND);

      expect(error.message).toBe('Template not found');
      expect(error.templateName).toBe('my-template');
      expect(error.statusCode).toBe(400);
      expect(error.retryable).toBe(false);
      expect(error.errorType).toBe(ErrorType.TEMPLATE_NOT_FOUND);
    });
  });

  describe('NetworkError', () => {
    it('should create network error', () => {
      const error = new NetworkError('Connection timeout');

      expect(error.message).toBe('Connection timeout');
      expect(error.statusCode).toBe(503);
      expect(error.retryable).toBe(true);
      expect(error.errorType).toBe(ErrorType.NETWORK_ERROR);
    });
  });

  describe('ConfigurationError', () => {
    it('should create configuration error', () => {
      const error = new ConfigurationError('Missing API key');

      expect(error.message).toBe('Missing API key');
      expect(error.statusCode).toBe(500);
      expect(error.retryable).toBe(false);
      expect(error.errorType).toBe(ErrorType.INVALID_CONFIG);
    });
  });
});

describe('ErrorFactory', () => {
  describe('fromHttpResponse', () => {
    it('should create authentication error for 401', () => {
      const response = { status: 401, statusText: 'Unauthorized' } as Response;
      const error = ErrorFactory.fromHttpResponse(response, 'slack');

      expect(error).toBeInstanceOf(AuthenticationError);
      expect(error.statusCode).toBe(401);
    });

    it('should create authorization error for 403', () => {
      const response = { status: 403, statusText: 'Forbidden' } as Response;
      const error = ErrorFactory.fromHttpResponse(response, 'slack');

      expect(error).toBeInstanceOf(AuthorizationError);
      expect(error.statusCode).toBe(403);
    });

    it('should create rate limit error for 429', () => {
      const response = { status: 429, statusText: 'Too Many Requests' } as Response;
      const error = ErrorFactory.fromHttpResponse(response, 'slack');

      expect(error).toBeInstanceOf(RateLimitError);
      expect(error.statusCode).toBe(429);
    });

    it('should create platform error for other status codes', () => {
      const response = { status: 500, statusText: 'Internal Server Error' } as Response;
      const error = ErrorFactory.fromHttpResponse(response, 'slack');

      expect(error).toBeInstanceOf(PlatformError);
      expect(error.statusCode).toBe(500);
      expect((error as PlatformError).platform).toBe('slack');
    });

    it('should create network error when no platform specified', () => {
      const response = { status: 500, statusText: 'Internal Server Error' } as Response;
      const error = ErrorFactory.fromHttpResponse(response);

      expect(error).toBeInstanceOf(NetworkError);
      expect(error.statusCode).toBe(500);
    });
  });

  describe('fromError', () => {
    it('should return PostmasterError as-is', () => {
      const originalError = new PlatformError('Test', 'slack');
      const error = ErrorFactory.fromError(originalError);

      expect(error).toBe(originalError);
    });

    it('should convert fetch TypeError to NetworkError', () => {
      const originalError = new TypeError('fetch failed');
      const error = ErrorFactory.fromError(originalError);

      expect(error).toBeInstanceOf(NetworkError);
      expect(error.message).toContain('fetch failed');
    });

    it('should convert to PlatformError when platform specified', () => {
      const originalError = new Error('Generic error');
      const error = ErrorFactory.fromError(originalError, 'slack');

      expect(error).toBeInstanceOf(PlatformError);
      expect((error as PlatformError).platform).toBe('slack');
    });
  });
});

describe('ErrorUtils', () => {
  describe('isRetryable', () => {
    it('should return retryable property for PostmasterError', () => {
      const retryableError = new PlatformError('Test', 'slack', 500, true);
      const nonRetryableError = new PlatformError('Test', 'slack', 400, false);

      expect(ErrorUtils.isRetryable(retryableError)).toBe(true);
      expect(ErrorUtils.isRetryable(nonRetryableError)).toBe(false);
    });

    it('should return true for 5xx status codes', () => {
      const error = { statusCode: 500 };

      expect(ErrorUtils.isRetryable(error)).toBe(true);
    });

    it('should return true for 429 status code', () => {
      const error = { status: 429 };

      expect(ErrorUtils.isRetryable(error)).toBe(true);
    });

    it('should return false for 4xx status codes (except 429)', () => {
      const error = { statusCode: 400 };

      expect(ErrorUtils.isRetryable(error)).toBe(false);
    });

    it('should return false for unknown errors', () => {
      const error = new Error('Unknown');

      expect(ErrorUtils.isRetryable(error)).toBe(false);
    });
  });

  describe('getRetryDelay', () => {
    it('should return retryAfter for RateLimitError', () => {
      const error = new RateLimitError('Rate limited', 30);
      const delay = ErrorUtils.getRetryDelay(error, 1);

      expect(delay).toBe(30000); // 30 seconds in milliseconds
    });

    it('should return exponential backoff for other errors', () => {
      const error = new Error('Generic error');
      
      expect(ErrorUtils.getRetryDelay(error, 1)).toBe(2000); // 2^1 * 1000
      expect(ErrorUtils.getRetryDelay(error, 2)).toBe(4000); // 2^2 * 1000
      expect(ErrorUtils.getRetryDelay(error, 3)).toBe(8000); // 2^3 * 1000
    });

    it('should cap delay at 60 seconds', () => {
      const error = new Error('Generic error');
      const delay = ErrorUtils.getRetryDelay(error, 10);

      expect(delay).toBe(60000); // Max 60 seconds
    });
  });

  describe('extractContext', () => {
    it('should extract context from PostmasterError', () => {
      const error = new PlatformError('Test', 'slack', 400, false, ErrorType.INVALID_WEBHOOK, {
        customField: 'value',
      });
      const context = ErrorUtils.extractContext(error);

      expect(context.customField).toBe('value');
      expect(context.platform).toBe('slack');
    });

    it('should extract basic info from generic error', () => {
      const error = new Error('Generic error');
      error.name = 'CustomError';
      (error as any).statusCode = 500;

      const context = ErrorUtils.extractContext(error);

      expect(context.name).toBe('CustomError');
      expect(context.message).toBe('Generic error');
      expect(context.statusCode).toBe(500);
    });
  });

  describe('formatForApi', () => {
    it('should format PostmasterError for API response', () => {
      const error = new ValidationError('Invalid input', ['Field required']);
      const formatted = ErrorUtils.formatForApi(error);

      expect(formatted.success).toBe(false);
      expect(formatted.error.code).toBe(ErrorType.VALIDATION_ERROR);
      expect(formatted.error.message).toBe('Invalid input');
      expect(formatted.error.retryable).toBe(false);
      expect(formatted.timestamp).toBeDefined();
    });

    it('should format generic error for API response', () => {
      const error = new Error('Generic error');
      const formatted = ErrorUtils.formatForApi(error);

      expect(formatted.success).toBe(false);
      expect(formatted.error.code).toBe(ErrorType.UNKNOWN_ERROR);
      expect(formatted.error.message).toBe('Generic error');
      expect(formatted.error.retryable).toBe(false);
      expect(formatted.timestamp).toBeDefined();
    });

    it('should handle error without message', () => {
      const error = {};
      const formatted = ErrorUtils.formatForApi(error);

      expect(formatted.error.message).toBe('An unexpected error occurred');
    });
  });
});
