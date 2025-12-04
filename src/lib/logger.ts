/**
 * Application Logger
 * 
 * Structured logging using Pino for better observability.
 * - JSON format in production
 * - Pretty-printed in development
 * - Includes request context and error tracking
 */

import pino from 'pino';
import { isDevelopment } from '@/conf/config';

// Create logger instance
export const logger = pino({
  level: process.env.LOG_LEVEL || (isDevelopment ? 'debug' : 'info'),
  
  // Pretty print in development
  transport: isDevelopment
    ? {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'HH:MM:ss Z',
          ignore: 'pid,hostname',
        },
      }
    : undefined,
  
  // Base context
  base: {
    env: process.env.NODE_ENV,
  },
  
  // Serialize errors properly
  serializers: {
    error: pino.stdSerializers.err,
    req: pino.stdSerializers.req,
    res: pino.stdSerializers.res,
  },
});

/**
 * Create a child logger with additional context
 * 
 * @example
 * const log = createLogger({ module: 'tickets', userId: '123' });
 * log.info('Ticket created');
 */
export function createLogger(context: Record<string, any>) {
  return logger.child(context);
}

/**
 * Log with execution time
 * 
 * @example
 * const timer = startTimer();
 * // ... do work
 * timer.end('Operation completed', { ticketId: 123 });
 */
export function startTimer() {
  const start = Date.now();
  
  return {
    end: (message: string, context?: Record<string, any>) => {
      const duration = Date.now() - start;
      logger.info({
        ...context,
        duration,
      }, message);
    },
  };
}

/**
 * Log error with proper serialization
 * 
 * @example
 * try {
 *   // ... code
 * } catch (error) {
 *   logError(error, 'Failed to create ticket', { ticketId: 123 });
 * }
 */
export function logError(
  error: unknown,
  message: string,
  context?: Record<string, any>
) {
  const errorObj = error instanceof Error ? error : new Error(String(error));
  
  logger.error({
    ...context,
    error: errorObj,
    stack: errorObj.stack,
  }, message);
}

/**
 * Request logger middleware helper
 * Creates child logger with request context
 */
export function createRequestLogger(requestId: string, path: string, method: string) {
  return createLogger({
    requestId,
    path,
    method,
  });
}

export default logger;
