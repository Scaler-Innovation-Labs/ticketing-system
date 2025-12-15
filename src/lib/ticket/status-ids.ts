/**
 * Status ID Constants
 * 
 * FIX 1: Static status ID map to eliminate dynamic DB queries
 * 
 * Status IDs are static and should NEVER be fetched dynamically.
 * This module loads all status IDs once per Lambda instance and provides
 * O(1) lookups without any DB roundtrips.
 */

import { db, ticket_statuses } from '@/db';
import { TICKET_STATUS } from '@/conf/constants';
import { logger } from '@/lib/logger';

// Module-level cache (persists for Lambda instance lifetime)
let STATUS_ID_MAP: Record<string, number> | null = null;
let STATUS_ID_MAP_PROMISE: Promise<Record<string, number>> | null = null;

/**
 * Load all status IDs once per Lambda instance
 * Uses a promise to prevent concurrent loads
 */
async function loadStatusIds(): Promise<Record<string, number>> {
  // If already loaded, return immediately
  if (STATUS_ID_MAP) {
    return STATUS_ID_MAP;
  }

  // If loading in progress, wait for it
  if (STATUS_ID_MAP_PROMISE) {
    return STATUS_ID_MAP_PROMISE;
  }

  // Start loading
  STATUS_ID_MAP_PROMISE = (async () => {
    try {
      const allStatuses = await db
        .select({
          id: ticket_statuses.id,
          value: ticket_statuses.value,
        })
        .from(ticket_statuses);

      const map: Record<string, number> = {};
      for (const status of allStatuses) {
        map[status.value.toLowerCase()] = status.id;
      }

      STATUS_ID_MAP = map;
      logger.info(
        { statusCount: allStatuses.length },
        'Status ID map loaded (module-level cache)'
      );

      return map;
    } catch (error) {
      logger.error({ error }, 'Failed to load status ID map');
      STATUS_ID_MAP_PROMISE = null; // Allow retry
      throw error;
    }
  })();

  return STATUS_ID_MAP_PROMISE;
}

/**
 * Get status ID by value (O(1) lookup after first load)
 * 
 * FIX 1: Replaces dynamic DB queries with static map lookup
 * 
 * @param statusValue - Status value (case-insensitive)
 * @returns Status ID
 * @throws Error if status not found
 */
export async function getStatusId(statusValue: string): Promise<number> {
  const map = await loadStatusIds();
  const normalizedValue = statusValue.toLowerCase();
  const statusId = map[normalizedValue];

  if (!statusId) {
    throw new Error(`Status not found: ${statusValue}`);
  }

  return statusId;
}

