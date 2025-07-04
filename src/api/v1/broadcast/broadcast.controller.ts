import { FastifyRequest, FastifyReply } from 'fastify';
import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';
import { 
  BroadcastRequest, 
  BroadcastResponse, 
  ErrorResponse,
  validateBroadcastRequest 
} from './broadcast.schema';
import { apiLogger } from '../../../utils/logger';
import { notificationProducer } from '../../../jobs/notification.producer';

// Initialize Prisma client
const prisma = new PrismaClient();

export class BroadcastController {
  /**
   * Handle broadcast request
   */
  static async broadcast(
    request: FastifyRequest<{ Body: BroadcastRequest }>,
    reply: FastifyReply
  ): Promise<BroadcastResponse | ErrorResponse> {
    const startTime = Date.now();
    const requestId = request.id;
    
    try {
      apiLogger.info('Processing broadcast request', {
        requestId,
        ip: request.ip,
        userAgent: request.headers['user-agent'],
      });

      // 1. Validate request payload
      const validation = validateBroadcastRequest(request.body);
      if (validation.error) {
        apiLogger.warn('Broadcast request validation failed', {
          requestId,
          errors: validation.error.details.map(detail => ({
            field: detail.path.join('.'),
            message: detail.message,
          })),
        });

        return reply.status(400).send({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Request validation failed',
            details: validation.error.details.map(detail => ({
              field: detail.path.join('.'),
              message: detail.message,
            })),
          },
          request_id: requestId,
        });
      }

      const payload = validation.value!;

      // 2. Check deduplication if specified
      let dedupApplied = false;
      if (payload.options?.deduplication) {
        dedupApplied = await BroadcastController.checkDeduplication(
          payload.options.deduplication.key,
          payload,
          requestId
        );

        if (dedupApplied) {
          apiLogger.info('Duplicate request detected, skipping broadcast', {
            requestId,
            dedupKey: payload.options.deduplication.key,
          });

          return reply.status(200).send({
            success: true,
            job_id: 'duplicate-request',
            message: 'Duplicate request detected, broadcast skipped',
            targets_count: payload.targets.length,
            deduplication_applied: true,
          });
        }
      }

      // 3. Create notification job using NotificationProducer
      const jobId = await notificationProducer.createBroadcastJob(payload);

      // 4. Calculate estimated delivery time
      const estimatedDeliveryTime = BroadcastController.calculateEstimatedDeliveryTime(payload);

      // 5. Prepare response
      const response: BroadcastResponse = {
        success: true,
        job_id: jobId,
        message: 'Broadcast job created successfully',
        targets_count: payload.targets.length,
        deduplication_applied: dedupApplied,
        estimated_delivery_time: estimatedDeliveryTime,
      };

      // Add scheduled_for if scheduling is specified
      if (payload.options?.schedule) {
        response.scheduled_for = payload.options.schedule.send_at;
      }

      const responseTime = Date.now() - startTime;
      apiLogger.info('Broadcast request processed successfully', {
        requestId,
        jobId,
        targetsCount: payload.targets.length,
        responseTime,
      });

      return reply.status(200).send(response);

    } catch (error) {
      const responseTime = Date.now() - startTime;
      apiLogger.error('Error processing broadcast request', {
        requestId,
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        responseTime,
      });

      return reply.status(500).send({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Internal server error',
        },
        request_id: requestId,
      });
    }
  }

  /**
   * Check for duplicate requests using deduplication key
   */
  private static async checkDeduplication(
    dedupKey: string,
    payload: BroadcastRequest,
    requestId: string
  ): Promise<boolean> {
    try {
      const messageHash = BroadcastController.generateMessageHash(payload.message);
      const windowSeconds = payload.options?.deduplication?.window_seconds || 3600;
      const expiresAt = new Date(Date.now() + windowSeconds * 1000);

      // Try to create a new deduplication record
      await prisma.messageDeduplication.create({
        data: {
          dedupKey,
          messageHash,
          jobId: '', // Will be updated after job creation
          expiresAt,
        },
      });

      return false; // Not a duplicate
    } catch (error) {
      // If we get a unique constraint violation, it's a duplicate
      if (error instanceof Error && error.message.includes('UNIQUE constraint failed')) {
        return true; // Is a duplicate
      }
      
      // For other errors, log and continue (don't block the request)
      apiLogger.warn('Error checking deduplication', {
        requestId,
        dedupKey,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      
      return false; // Assume not a duplicate on error
    }
  }

  /**
   * Generate a hash of the message content for deduplication
   */
  private static generateMessageHash(message: any): string {
    const messageString = JSON.stringify(message, Object.keys(message).sort());
    return crypto.createHash('sha256').update(messageString).digest('hex');
  }

  /**
   * Calculate estimated delivery time based on targets and options
   */
  private static calculateEstimatedDeliveryTime(payload: BroadcastRequest): string {
    let estimatedSeconds = 5; // Base processing time

    // Add time based on number of targets
    estimatedSeconds += payload.targets.length * 2;

    // Add delay if scheduled
    if (payload.options?.schedule) {
      const scheduledTime = new Date(payload.options.schedule.send_at);
      const now = new Date();
      if (scheduledTime > now) {
        estimatedSeconds = Math.floor((scheduledTime.getTime() - now.getTime()) / 1000);
      }
    }

    const estimatedTime = new Date(Date.now() + estimatedSeconds * 1000);
    return estimatedTime.toISOString();
  }
}

export default BroadcastController;
