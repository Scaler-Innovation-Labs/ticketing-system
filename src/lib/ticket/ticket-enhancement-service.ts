/**
 * Ticket Enhancement Service
 * 
 * Handles advanced ticket operations: archive, comments, watchers, tags, merge
 * Separated from main ticket service for modularity
 */

import { db } from '@/db';
import { tickets, ticket_activity, ticket_comments, ticket_watchers, ticket_tags } from '@/db';
import { eq, and, inArray } from 'drizzle-orm';
import { logger } from '@/lib/logger';

/**
 * Archive ticket (change status)
 */
export async function archiveTicket(ticketId: number, userId: string, statusId: number) {
  try {
    await db.transaction(async (tx) => {
      // Update ticket status to archived status
      await tx
        .update(tickets)
        .set({ status_id: statusId, updated_at: new Date() })
        .where(eq(tickets.id, ticketId));

      // Log activity
      await tx.insert(ticket_activity).values({
        ticket_id: ticketId,
        user_id: userId,
        action: 'archived',
        details: null,
        visibility: 'public',
      });
    });

    logger.info({ ticketId, userId }, 'Ticket archived');
  } catch (error) {
    logger.error({ error, ticketId }, 'Error archiving ticket');
    throw error;
  }
}

/**
 * Add comment to ticket
 */
export async function addComment(
  ticketId: number,
  userId: string,
  commentText: string,
  isInternal: boolean = false
) {
  try {
    const [comment] = await db
      .insert(ticket_comments)
      .values({
        ticket_id: ticketId,
        user_id: userId,
        comment: commentText,
        is_internal: isInternal,
      })
      .returning();

    logger.info({ ticketId, commentId: comment.id }, 'Comment added');
    return comment;
  } catch (error) {
    logger.error({ error, ticketId }, 'Error adding comment');
    throw error;
  }
}

/**
 * Add watcher to ticket
 */
export async function addWatcher(ticketId: number, userId: string) {
  try {
    await db
      .insert(ticket_watchers)
      .values({
        ticket_id: ticketId,
        user_id: userId,
      })
      .onConflictDoNothing();

    logger.info({ ticketId, userId }, 'Watcher added');
  } catch (error) {
    logger.error({ error, ticketId }, 'Error adding watcher');
    throw error;
  }
}

/**
 * Remove watcher from ticket
 */
export async function removeWatcher(ticketId: number, userId: string) {
  try {
    await db
      .delete(ticket_watchers)
      .where(
        and(
          eq(ticket_watchers.ticket_id, ticketId),
          eq(ticket_watchers.user_id, userId)
        )
      );

    logger.info({ ticketId, userId }, 'Watcher removed');
  } catch (error) {
    logger.error({ error, ticketId }, 'Error removing watcher');
    throw error;
  }
}

/**
 * Add tags to ticket
 */
export async function addTags(ticketId: number, tags: string[]) {
  try {
    if (tags.length === 0) return;

    await db
      .insert(ticket_tags)
      .values(
        tags.map(tag => ({
          ticket_id: ticketId,
          tag: tag.toLowerCase().trim(),
        }))
      )
      .onConflictDoNothing();

    logger.info({ ticketId, count: tags.length }, 'Tags added');
  } catch (error) {
    logger.error({ error, ticketId }, 'Error adding tags');
    throw error;
  }
}

/**
 * Remove tag from ticket
 */
export async function removeTag(ticketId: number, tag: string) {
  try {
    await db
      .delete(ticket_tags)
      .where(
        and(
          eq(ticket_tags.ticket_id, ticketId),
          eq(ticket_tags.tag, tag.toLowerCase().trim())
        )
      );

    logger.info({ ticketId, tag }, 'Tag removed');
  } catch (error) {
    logger.error({ error, ticketId }, 'Error removing tag');
    throw error;
  }
}

/**
 * Merge tickets
 */
export async function mergeTickets(params: {
  source_ticket_ids: number[];
  target_ticket_id: number;
  merged_by: string;
  reason: string;
  merged_status_id: number;
}) {
  try {
    await db.transaction(async (tx) => {
      // Update source tickets
      await tx
        .update(tickets)
        .set({
          status_id: params.merged_status_id,
          updated_at: new Date(),
        })
        .where(inArray(tickets.id, params.source_ticket_ids));

      // Log activity on all tickets
      const activities = params.source_ticket_ids.map(ticketId => ({
        ticket_id: ticketId,
        user_id: params.merged_by,
        action: 'merged',
        details: JSON.stringify({
          merged_into: params.target_ticket_id,
          reason: params.reason,
        }),
        visibility: 'public' as const,
      }));

      await tx.insert(ticket_activity).values(activities);

      // Log on target ticket
      await tx.insert(ticket_activity).values({
        ticket_id: params.target_ticket_id,
        user_id: params.merged_by,
        action: 'merged_from',
        details: JSON.stringify({
          merged_from: params.source_ticket_ids,
          reason: params.reason,
        }),
        visibility: 'public',
      });
    });

    logger.info(
      { source: params.source_ticket_ids, target: params.target_ticket_id },
      'Tickets merged'
    );
  } catch (error) {
    logger.error({ error, params }, 'Error merging tickets');
    throw error;
  }
}
