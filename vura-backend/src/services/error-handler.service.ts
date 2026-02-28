// vura-backend/src/services/error-handler.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { Request, Response } from 'express';

export interface SecurityError {
  type:
    | 'authentication'
    | 'authorization'
    | 'validation'
    | 'rate_limit'
    | 'fraud'
    | 'system';
  message: string;
  details?: any;
  timestamp: Date;
  userId?: string;
  ip?: string;
  userAgent?: string;
}

@Injectable()
export class ErrorHandlerService {
  private readonly logger = new Logger(ErrorHandlerService.name);

  handleSecurityError(error: SecurityError, req: Request, res: Response): void {
    // Log the error with full context
    this.logger.error({
      type: error.type,
      message: error.message,
      details: error.details,
      timestamp: error.timestamp,
      userId: error.userId || (req as any).user?.id,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      url: req.url,
      method: req.method,
    });

    // Determine response based on error type
    let statusCode = 500;
    let responseMessage = 'An unexpected error occurred';

    switch (error.type) {
      case 'authentication':
        statusCode = 401;
        responseMessage = 'Authentication required';
        break;
      case 'authorization':
        statusCode = 403;
        responseMessage = 'Access denied';
        break;
      case 'validation':
        statusCode = 400;
        responseMessage = 'Invalid request';
        break;
      case 'rate_limit':
        statusCode = 429;
        responseMessage = 'Too many requests';
        break;
      case 'fraud':
        statusCode = 403;
        responseMessage = 'Transaction blocked for security reasons';
        break;
      case 'system':
        statusCode = 500;
        responseMessage = 'Service temporarily unavailable';
        break;
    }

    // Send error response
    res.status(statusCode).json({
      error: {
        type: error.type,
        message: responseMessage,
        timestamp: error.timestamp.toISOString(),
        requestId: req.headers['x-request-id'] || 'unknown',
      },
    });
  }

  handleValidationError(
    validationErrors: any[],
    req: Request,
    res: Response,
  ): void {
    const error: SecurityError = {
      type: 'validation',
      message: 'Request validation failed',
      details: validationErrors,
      timestamp: new Date(),
      userId: (req as any).user?.id,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
    };

    this.handleSecurityError(error, req, res);
  }

  handleFraudDetectionError(
    fraudScore: any,
    req: Request,
    res: Response,
  ): void {
    const error: SecurityError = {
      type: 'fraud',
      message: 'Transaction blocked due to suspicious activity',
      details: {
        score: fraudScore.score,
        riskLevel: fraudScore.riskLevel,
        reasons: fraudScore.reasons,
      },
      timestamp: new Date(),
      userId: (req as any).user?.id,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
    };

    this.handleSecurityError(error, req, res);
  }

  logSecurityEvent(eventType: string, details: any, req: Request): void {
    this.logger.warn({
      event: eventType,
      details,
      timestamp: new Date(),
      userId: (req as any).user?.id,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      url: req.url,
      method: req.method,
    });
  }

  sanitizeError(error: any): any {
    // Remove sensitive information from error objects
    const sanitized = { ...error };

    // Remove sensitive fields
    delete sanitized.stack;
    delete sanitized.config;
    delete sanitized.request;
    delete sanitized.response;

    return sanitized;
  }
}
