/**
 * Application Logger
 * 
 * Simple console-based logger that works in Next.js without worker threads.
 * Provides structured logging with levels.
 */

const isDev = process.env.NODE_ENV !== 'production';

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogContext {
  [key: string]: unknown;
}

function formatMessage(level: LogLevel, context: LogContext, message: string): string {
  const timestamp = new Date().toISOString();
  const contextStr = Object.keys(context).length > 0
    ? ` ${JSON.stringify(context)}`
    : '';
  return `[${timestamp}] ${level.toUpperCase()}: ${message}${contextStr}`;
}

function createLogMethod(level: LogLevel) {
  return (contextOrMessage: LogContext | string, message?: string) => {
    if (typeof contextOrMessage === 'string') {
      // Called with just a message
      console[level === 'debug' ? 'log' : level](formatMessage(level, {}, contextOrMessage));
    } else {
      // Called with context and message
      console[level === 'debug' ? 'log' : level](formatMessage(level, contextOrMessage, message || ''));
    }
  };
}

export const logger = {
  debug: createLogMethod('debug'),
  info: createLogMethod('info'),
  warn: createLogMethod('warn'),
  error: createLogMethod('error'),

  child: (context: LogContext) => ({
    debug: (ctx: LogContext | string, msg?: string) => {
      const fullContext = typeof ctx === 'string' ? context : { ...context, ...ctx };
      const message = typeof ctx === 'string' ? ctx : msg || '';
      if (isDev) console.log(formatMessage('debug', fullContext, message));
    },
    info: (ctx: LogContext | string, msg?: string) => {
      const fullContext = typeof ctx === 'string' ? context : { ...context, ...ctx };
      const message = typeof ctx === 'string' ? ctx : msg || '';
      console.info(formatMessage('info', fullContext, message));
    },
    warn: (ctx: LogContext | string, msg?: string) => {
      const fullContext = typeof ctx === 'string' ? context : { ...context, ...ctx };
      const message = typeof ctx === 'string' ? ctx : msg || '';
      console.warn(formatMessage('warn', fullContext, message));
    },
    error: (ctx: LogContext | string, msg?: string) => {
      const fullContext = typeof ctx === 'string' ? context : { ...context, ...ctx };
      const message = typeof ctx === 'string' ? ctx : msg || '';
      console.error(formatMessage('error', fullContext, message));
    },
  }),
};

/**
 * Create a child logger with additional context
 */
export function createLogger(context: LogContext) {
  return logger.child(context);
}

/**
 * Log with execution time
 */
export function startTimer() {
  const start = Date.now();

  return {
    end: (message: string, context?: LogContext) => {
      const duration = Date.now() - start;
      logger.info({ ...context, duration }, message);
    },
  };
}

/**
 * Log error with proper serialization
 */
export function logError(
  error: unknown,
  message: string,
  context?: LogContext
) {
  const errorObj = error instanceof Error ? error : new Error(String(error));

  logger.error({
    ...context,
    error: errorObj.message,
    stack: errorObj.stack,
  }, message);
}

/**
 * Request logger middleware helper
 */
export function createRequestLogger(requestId: string, path: string, method: string) {
  return createLogger({
    requestId,
    path,
    method,
  });
}

export default logger;
