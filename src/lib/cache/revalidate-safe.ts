/**
 * Safe Cache Revalidation Utilities
 * 
 * Provides fire-and-forget cache revalidation that won't block responses
 * or cause connection timeout errors.
 */

import { revalidateTag } from 'next/cache';
import { logger } from '@/lib/logger';

/**
 * Safely revalidate a cache tag without blocking the response
 * 
 * This wraps revalidateTag in a fire-and-forget pattern to prevent:
 * - Blocking API responses
 * - Database connection timeouts during revalidation
 * - Cascading failures from cache revalidation errors
 * 
 * @param tag - Cache tag to revalidate
 * @param profile - Cache profile (default: 'default')
 */
export function safeRevalidateTag(tag: string, profile: 'default' = 'default'): void {
  // Use queueMicrotask for true fire-and-forget (runs after current call stack)
  queueMicrotask(async () => {
    try {
      revalidateTag(tag, profile);
    } catch (error) {
      // Log but don't throw - cache revalidation failures shouldn't break the app
      logger.warn(
        {
          error: error instanceof Error ? {
            message: error.message,
            stack: error.stack,
            name: error.name,
          } : error,
          tag,
        },
        'Cache revalidation failed (non-critical, fire-and-forget)'
      );
    }
  });
}

/**
 * Safely revalidate multiple cache tags without blocking the response
 * 
 * @param tags - Array of cache tags to revalidate
 * @param profile - Cache profile (default: 'default')
 */
export function safeRevalidateTags(tags: string[], profile: 'default' = 'default'): void {
  queueMicrotask(async () => {
    for (const tag of tags) {
      try {
        revalidateTag(tag, profile);
      } catch (error) {
        // Log but don't throw - continue with other tags even if one fails
        logger.warn(
          {
            error: error instanceof Error ? {
              message: error.message,
              stack: error.stack,
              name: error.name,
            } : error,
            tag,
          },
          'Cache revalidation failed for tag (non-critical, fire-and-forget)'
        );
      }
    }
  });
}

