/**
 * Application Error Handling
 * 
 * Standardized error types and response formatting.
 * - Type-safe error codes
 * - Consistent API error responses
 * - Proper HTTP status codes
 */

import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { logError } from './logger';

// ============================================
// Error Codes
// ============================================

export const ERROR_CODES = {
  // Authentication & Authorization (401, 403)
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  INVALID_TOKEN: 'INVALID_TOKEN',
  
  // Validation (400)
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  INVALID_INPUT: 'INVALID_INPUT',
  MISSING_FIELD: 'MISSING_FIELD',
  
  // Resource (404, 409)
  NOT_FOUND: 'NOT_FOUND',
  ALREADY_EXISTS: 'ALREADY_EXISTS',
  CONFLICT: 'CONFLICT',
  
  // Business Logic (400, 422)
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',
  WEEKLY_LIMIT_EXCEEDED: 'WEEKLY_LIMIT_EXCEEDED',
  INVALID_STATUS_TRANSITION: 'INVALID_STATUS_TRANSITION',
  DUPLICATE_REQUEST: 'DUPLICATE_REQUEST',
  
  // Server (500)
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  DATABASE_ERROR: 'DATABASE_ERROR',
  EXTERNAL_SERVICE_ERROR: 'EXTERNAL_SERVICE_ERROR',
} as const;

export type ErrorCode = typeof ERROR_CODES[keyof typeof ERROR_CODES];

// ============================================
// Custom Error Class
// ============================================

export class AppError extends Error {
  constructor(
    public code: ErrorCode,
    public message: string,
    public statusCode: number = 500,
    public details?: Record<string, any>
  ) {
    super(message);
    this.name = 'AppError';
    
    // Maintains proper stack trace for where error was thrown
    Error.captureStackTrace(this, this.constructor);
  }
  
  /**
   * Convert error to JSON response
   */
  toJSON() {
    return {
      error: {
        code: this.code,
        message: this.message,
        ...(this.details && { details: this.details }),
      },
    };
  }
  
  /**
   * Convert error to NextResponse
   */
  toResponse() {
    return NextResponse.json(this.toJSON(), {
      status: this.statusCode,
    });
  }
}

// ============================================
// Error Factory Functions
// ============================================

export const Errors = {
  // Authentication
  unauthorized: (message = 'Unauthorized. Please log in.') =>
    new AppError(ERROR_CODES.UNAUTHORIZED, message, 401),
  
  forbidden: (message = 'Access denied. Insufficient permissions.') =>
    new AppError(ERROR_CODES.FORBIDDEN, message, 403),
  
  invalidToken: (message = 'Invalid or expired token.') =>
    new AppError(ERROR_CODES.INVALID_TOKEN, message, 401),
  
  // Validation
  validation: (message: string, details?: Record<string, any>) =>
    new AppError(ERROR_CODES.VALIDATION_ERROR, message, 400, details),
  
  invalidInput: (message: string, field?: string) =>
    new AppError(
      ERROR_CODES.INVALID_INPUT,
      message,
      400,
      field ? { field } : undefined
    ),
  
  // Resources
  notFound: (resource: string, identifier?: string) =>
    new AppError(
      ERROR_CODES.NOT_FOUND,
      `${resource} not found${identifier ? `: ${identifier}` : ''}`,
      404,
      identifier ? { identifier } : undefined
    ),
  
  alreadyExists: (resource: string, identifier?: string) =>
    new AppError(
      ERROR_CODES.ALREADY_EXISTS,
      `${resource} already exists${identifier ? `: ${identifier}` : ''}`,
      409,
      identifier ? { identifier } : undefined
    ),
  
  conflict: (message: string) =>
    new AppError(ERROR_CODES.CONFLICT, message, 409),
  
  // Business Logic
  rateLimitExceeded: (
    message = 'Rate limit exceeded. Please try again later.',
    resetAt?: Date
  ) =>
    new AppError(
      ERROR_CODES.RATE_LIMIT_EXCEEDED,
      message,
      429,
      resetAt ? { resetAt: resetAt.toISOString() } : undefined
    ),
  
  weeklyLimitExceeded: (remaining: number, resetAt: Date) =>
    new AppError(
      ERROR_CODES.WEEKLY_LIMIT_EXCEEDED,
      'You have reached your weekly ticket limit (3 tickets per week)',
      429,
      {
        limit: 3,
        remaining,
        resetAt: resetAt.toISOString(),
      }
    ),
  
  invalidStatusTransition: (from: string, to: string) =>
    new AppError(
      ERROR_CODES.INVALID_STATUS_TRANSITION,
      `Invalid status transition from '${from}' to '${to}'`,
      422,
      { from, to }
    ),
  
  duplicateRequest: (message = 'Duplicate request detected.') =>
    new AppError(ERROR_CODES.DUPLICATE_REQUEST, message, 409),
  
  // Server
  internal: (message = 'An unexpected error occurred. Please try again later.') =>
    new AppError(ERROR_CODES.INTERNAL_ERROR, message, 500),
  
  database: (message = 'Database operation failed.') =>
    new AppError(ERROR_CODES.DATABASE_ERROR, message, 500),
  
  externalService: (service: string, message?: string) =>
    new AppError(
      ERROR_CODES.EXTERNAL_SERVICE_ERROR,
      message || `External service error: ${service}`,
      502,
      { service }
    ),
};

// ============================================
// Error Handler for API Routes
// ============================================

/**
 * Handle errors in API routes with proper logging and response formatting
 * 
 * @example
 * try {
 *   // ... route logic
 * } catch (error) {
 *   return handleApiError(error, 'Failed to create ticket', { userId });
 * }
 */
export function handleApiError(
  error: unknown,
  context?: string,
  additionalContext?: Record<string, any>
): NextResponse {
  // AppError - already formatted
  if (error instanceof AppError) {
    logError(error, context || error.message, {
      ...additionalContext,
      code: error.code,
      statusCode: error.statusCode,
    });
    return error.toResponse();
  }
  
  // Zod validation error
  if (error instanceof ZodError) {
    const validationError = Errors.validation('Validation failed', {
      fieldErrors: error.flatten().fieldErrors,
    });
    
    logError(error, context || 'Validation error', additionalContext);
    return validationError.toResponse();
  }
  
  // Generic Error
  if (error instanceof Error) {
    // Check for specific database errors
    if ('code' in error) {
      const dbCode = (error as any).code;
      
      // PostgreSQL error codes
      if (dbCode === '23505') {
        // Unique constraint violation
        const conflictError = Errors.alreadyExists('Resource');
        logError(error, context || 'Duplicate entry', additionalContext);
        return conflictError.toResponse();
      }
      
      if (dbCode === '23503') {
        // Foreign key violation
        const notFoundError = Errors.notFound('Related resource');
        logError(error, context || 'Foreign key violation', additionalContext);
        return notFoundError.toResponse();
      }
      
      if (dbCode === '40001') {
        // Serialization failure (deadlock)
        const conflictError = Errors.conflict('Database conflict. Please try again.');
        logError(error, context || 'Database deadlock', additionalContext);
        return conflictError.toResponse();
      }
    }
    
    // Generic internal error
    logError(error, context || 'Unexpected error', additionalContext);
    return Errors.internal(
      process.env.NODE_ENV === 'development' ? error.message : undefined
    ).toResponse();
  }
  
  // Unknown error type
  logError(new Error(String(error)), context || 'Unknown error', additionalContext);
  return Errors.internal().toResponse();
}

/**
 * Assert condition or throw error
 * 
 * @example
 * assert(ticket, Errors.notFound('Ticket', ticketId));
 */
export function assert(
  condition: any,
  error: AppError
): asserts condition {
  if (!condition) {
    throw error;
  }
}

/**
 * Check if error is a specific error code
 * 
 * @example
 * if (isErrorCode(error, ERROR_CODES.NOT_FOUND)) {
 *   // handle not found
 * }
 */
export function isErrorCode(error: unknown, code: ErrorCode): boolean {
  return error instanceof AppError && error.code === code;
}
