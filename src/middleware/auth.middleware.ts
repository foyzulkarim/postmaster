import { FastifyRequest, FastifyReply } from 'fastify';
import { config } from '../config';
import { apiLogger } from '../utils/logger';

export interface AuthenticatedRequest extends FastifyRequest {
  apiKey?: string;
}

export class AuthMiddleware {
  static async validateApiKey(
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    const startTime = Date.now();
    
    try {
      const authHeader = request.headers.authorization;
      
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        apiLogger.warn('Missing or invalid authorization header', {
          ip: request.ip,
          userAgent: request.headers['user-agent'],
          url: request.url,
        });
        
        return reply.status(401).send({
          success: false,
          error: {
            code: 'MISSING_AUTH',
            message: 'Authorization header required. Format: Bearer <api_key>',
          },
          request_id: request.id,
        });
      }
      
      const token = authHeader.substring(7); // Remove 'Bearer ' prefix
      const expectedToken = config.auth.apiKey;
      
      if (!expectedToken) {
        apiLogger.error('API key not configured in environment', {
          url: request.url,
        });
        
        return reply.status(500).send({
          success: false,
          error: {
            code: 'SERVER_CONFIG_ERROR',
            message: 'API key not configured',
          },
          request_id: request.id,
        });
      }
      
      if (token !== expectedToken) {
        apiLogger.warn('Invalid API key provided', {
          ip: request.ip,
          userAgent: request.headers['user-agent'],
          url: request.url,
          providedKeyLength: token.length,
        });
        
        return reply.status(401).send({
          success: false,
          error: {
            code: 'INVALID_API_KEY',
            message: 'Invalid API key',
          },
          request_id: request.id,
        });
      }
      
      // Add API key to request for potential future use
      (request as AuthenticatedRequest).apiKey = token;
      
      const responseTime = Date.now() - startTime;
      apiLogger.debug('API key validation successful', {
        ip: request.ip,
        url: request.url,
        responseTime,
      });
      
    } catch (error) {
      const responseTime = Date.now() - startTime;
      apiLogger.error('Error during API key validation', {
        error: error instanceof Error ? error.message : 'Unknown error',
        ip: request.ip,
        url: request.url,
        responseTime,
      });
      
      return reply.status(500).send({
        success: false,
        error: {
          code: 'AUTH_ERROR',
          message: 'Authentication error',
        },
        request_id: request.id,
      });
    }
  }
  
  /**
   * Fastify preHandler hook for API key validation
   */
  static preHandler = AuthMiddleware.validateApiKey;
}

export default AuthMiddleware;
