/**
 * Ticket Filter Service
 * 
 * Manages saved filter configurations for ticket views
 * Allows users to save and reuse complex filters
 */

import { db } from '@/db';
import { ticket_filters } from '@/db';
import { eq, and, desc } from 'drizzle-orm';
import { logger } from '@/lib/logger';

export interface FilterData {
  user_id: string;
  name: string;
  filter_config: any; // JSON configuration
  is_default: boolean;
}

/**
 * List user's filters
 */
export async function listUserFilters(userId: string) {
  try {
    const filters = await db
      .select()
      .from(ticket_filters)
      .where(eq(ticket_filters.user_id, userId))
      .orderBy(desc(ticket_filters.is_default), desc(ticket_filters.created_at));

    return filters;
  } catch (error) {
    logger.error({ error, userId }, 'Error listing filters');
    throw error;
  }
}

/**
 * Create filter
 */
export async function createFilter(data: FilterData) {
  try {
    // If setting as default, unset other defaults for this user
    if (data.is_default) {
      await db
        .update(ticket_filters)
        .set({ is_default: false })
        .where(eq(ticket_filters.user_id, data.user_id));
    }

    const [filter] = await db
      .insert(ticket_filters)
      .values({
        user_id: data.user_id,
        name: data.name,
        filter_config: data.filter_config,
        is_default: data.is_default,
      })
      .returning();

    logger.info({ id: filter.id, userId: data.user_id }, 'Filter created');
    return filter.id;
  } catch (error) {
    logger.error({ error, data }, 'Error creating filter');
    throw error;
  }
}

/**
 * Update filter
 */
export async function updateFilter(
  id: number,
  userId: string,
  data: Partial<FilterData>
) {
  try {
    // If setting as default, unset other defaults
    if (data.is_default) {
      await db
        .update(ticket_filters)
        .set({ is_default: false })
        .where(eq(ticket_filters.user_id, userId));
    }

    const [filter] = await db
      .update(ticket_filters)
      .set({ ...data, updated_at: new Date() })
      .where(and(eq(ticket_filters.id, id), eq(ticket_filters.user_id, userId)))
      .returning();

    if (!filter) {
      throw new Error('Filter not found');
    }

    logger.info({ id, userId }, 'Filter updated');
    return filter;
  } catch (error) {
    logger.error({ error, id }, 'Error updating filter');
    throw error;
  }
}

/**
 * Delete filter
 */
export async function deleteFilter(id: number, userId: string) {
  try {
    await db
      .delete(ticket_filters)
      .where(and(eq(ticket_filters.id, id), eq(ticket_filters.user_id, userId)));

    logger.info({ id, userId }, 'Filter deleted');
  } catch (error) {
    logger.error({ error, id }, 'Error deleting filter');
    throw error;
  }
}

/**
 * Get default filter for user
 */
export async function getDefaultFilter(userId: string) {
  try {
    const [filter] = await db
      .select()
      .from(ticket_filters)
      .where(
        and(
          eq(ticket_filters.user_id, userId),
          eq(ticket_filters.is_default, true)
        )
      )
      .limit(1);

    return filter || null;
  } catch (error) {
    logger.error({ error, userId }, 'Error getting default filter');
    throw error;
  }
}
