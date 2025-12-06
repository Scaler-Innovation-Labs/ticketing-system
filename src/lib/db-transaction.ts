/**
 * Database Transaction Utilities
 * 
 * Helper functions for safe transaction handling with proper error management.
 * Implements the transaction wrapper pattern to prevent data inconsistencies.
 */

import { db, type DbTransaction } from '@/db';
import { logger, logError } from './logger';
import { Errors, AppError } from './errors';

/**
 * Execute a function within a database transaction
 * 
 * Automatically rolls back on error and provides proper typing.
 * Use this for all multi-step database operations to ensure atomicity.
 * 
 * @example
 * const ticket = await withTransaction(async (txn) => {
 *   const [ticket] = await txn.insert(tickets).values(...).returning();
 *   await txn.insert(ticket_activity).values(...);
 *   await txn.insert(outbox).values(...);
 *   return ticket;
 * });
 */
export async function withTransaction<T>(
  callback: (txn: DbTransaction) => Promise<T>
): Promise<T> {
  try {
    return await db.transaction(async (txn) => {
      return await callback(txn);
    });
  } catch (error) {
    // Log transaction failure
    logError(error, 'Transaction failed');
    
    // Re-throw as AppError for consistent error handling
    if (error instanceof AppError) {
      throw error;
    }
    
    // Handle specific database errors
    if (error && typeof error === 'object' && 'code' in error) {
      const dbCode = (error as any).code;
      
      // PostgreSQL error codes
      switch (dbCode) {
        case '23505': // Unique violation
          throw Errors.alreadyExists('Resource');
        
        case '23503': // Foreign key violation
          throw Errors.notFound('Related resource');
        
        case '40001': // Serialization failure (deadlock)
        case '40P01': // Deadlock detected
          throw Errors.conflict('Database conflict. Please try again.');
        
        case '57014': // Query canceled
          throw Errors.internal('Operation timed out.');
        
        default:
          throw Errors.database(`Database error: ${dbCode}`);
      }
    }
    
    // Unknown error
    throw Errors.internal('Transaction failed unexpectedly.');
  }
}

/**
 * Execute a function with retry logic for transient failures
 * 
 * Useful for operations that might fail due to temporary issues
 * like network glitches or connection pool exhaustion.
 * 
 * @example
 * const ticket = await withRetry(() => createTicket(data), {
 *   maxAttempts: 3,
 *   delayMs: 100,
 * });
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  options: {
    maxAttempts?: number;
    delayMs?: number;
    retryIf?: (error: unknown) => boolean;
  } = {}
): Promise<T> {
  const {
    maxAttempts = 3,
    delayMs = 100,
    retryIf = (error) => {
      // Retry on transient errors only
      if (error && typeof error === 'object' && 'code' in error) {
        const code = (error as any).code;
        // Retry on deadlocks and connection errors
        return ['40001', '40P01', '08000', '08003', '08006'].includes(code);
      }
      return false;
    },
  } = options;

  let lastError: unknown;
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      
      if (attempt === maxAttempts || !retryIf(error)) {
        throw error;
      }
      
      // Exponential backoff
      const delay = delayMs * Math.pow(2, attempt - 1);
      logger.warn({
        error: error instanceof Error ? error.message : String(error),
        attempt,
        maxAttempts,
        delay,
      }, `Retry attempt ${attempt}/${maxAttempts} after ${delay}ms`);
      
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  throw lastError;
}

/**
 * Execute multiple operations in parallel within a transaction
 * 
 * Useful when you have independent operations that can run concurrently
 * but all need to be atomic (all succeed or all fail).
 * 
 * @example
 * const [ticket, activity, outboxEvent] = await withParallelTransaction([
 *   (txn) => txn.insert(tickets).values(...).returning(),
 *   (txn) => txn.insert(ticket_activity).values(...).returning(),
 *   (txn) => txn.insert(outbox).values(...).returning(),
 * ]);
 */
export async function withParallelTransaction<T extends readonly any[]>(
  operations: { [K in keyof T]: (txn: DbTransaction) => Promise<T[K]> }
): Promise<T> {
  return withTransaction(async (txn) => {
    return Promise.all(operations.map(op => op(txn))) as unknown as Promise<T>;
  });
}

/**
 * Check if error is a database deadlock
 * 
 * Useful for implementing custom retry logic
 */
export function isDeadlock(error: unknown): boolean {
  if (error && typeof error === 'object' && 'code' in error) {
    const code = (error as any).code;
    return code === '40001' || code === '40P01';
  }
  return false;
}

/**
 * Check if error is a unique constraint violation
 */
export function isUniqueViolation(error: unknown): boolean {
  if (error && typeof error === 'object' && 'code' in error) {
    return (error as any).code === '23505';
  }
  return false;
}

/**
 * Check if error is a foreign key violation
 */
export function isForeignKeyViolation(error: unknown): boolean {
  if (error && typeof error === 'object' && 'code' in error) {
    return (error as any).code === '23503';
  }
  return false;
}
