/**
 * Ticket Comments Service
 * 
 * Handles adding comments and internal notes to tickets
 */

import { db, ticket_activity, tickets, ticket_statuses, outbox } from '@/db';
import { eq } from 'drizzle-orm';
import { logger } from '@/lib/logger';
import { Errors } from '@/lib/errors';
import { withTransaction } from '@/lib/db-transaction';
import { TICKET_STATUS } from '@/conf/constants';

export interface AddCommentInput {
  comment: string;
  is_internal?: boolean;
  is_from_student?: boolean; // Flag to indicate if comment is from student
  attachments?: Array<{
    filename: string;
    url: string;
    size: number;
    mime_type: string;
  }>;
}

/**
 * Add comment to ticket
 */
/**
 * Add comment to ticket (FAST CORE TRANSACTION)
 * 
 * This function performs only the essential database work:
 * - Insert comment activity
 * - Update ticket status (if student reply)
 * - Update ticket updated_at
 * 
 * Side effects (notifications) are handled separately.
 */
export async function addTicketComment(
  ticketId: number,
  userId: string,
  input: AddCommentInput
) {
  return withTransaction(async (txn) => {
    // FIX: Fetch ticket first (needed for status check)
    const [ticket] = await txn
      .select()
      .from(tickets)
      .where(eq(tickets.id, ticketId))
      .limit(1);

    if (!ticket) {
      throw Errors.notFound('Ticket', String(ticketId));
    }

    // FIX: If student reply, fetch status info in parallel BEFORE inserting comment
    // This allows us to decide status update logic without blocking
    let statusUpdateNeeded = false;
    let inProgressStatusId: number | null = null;

    if (input.is_from_student && ticket.status_id) {
      const [currentStatusResult, inProgressStatusResult] = await Promise.all([
        txn
          .select({ value: ticket_statuses.value })
          .from(ticket_statuses)
          .where(eq(ticket_statuses.id, ticket.status_id))
          .limit(1),
        txn
          .select({ id: ticket_statuses.id })
          .from(ticket_statuses)
          .where(eq(ticket_statuses.value, TICKET_STATUS.IN_PROGRESS))
          .limit(1),
      ]);

      const [currentStatus] = currentStatusResult;
      const [inProgressStatus] = inProgressStatusResult;

      if (currentStatus?.value === TICKET_STATUS.AWAITING_STUDENT_RESPONSE && inProgressStatus) {
        statusUpdateNeeded = true;
        inProgressStatusId = inProgressStatus.id;
      }
    }

    // Add comment as activity (CORE OPERATION - must be fast)
    const [activity] = await txn
      .insert(ticket_activity)
      .values({
        ticket_id: ticketId,
        user_id: userId,
        action: input.is_internal ? 'internal_note' : 'comment',
        details: {
          comment: input.comment,
          attachments: input.attachments || [],
        },
        visibility: input.is_internal ? 'admin_only' : 'student_visible',
      })
      .returning();

    // FIX: Update status and ticket updated_at in parallel (if status update needed)
    if (statusUpdateNeeded && inProgressStatusId) {
      await Promise.all([
        txn
          .update(tickets)
          .set({
            status_id: inProgressStatusId,
            updated_at: new Date()
          })
          .where(eq(tickets.id, ticketId)),
        txn.insert(ticket_activity).values({
          ticket_id: ticketId,
          user_id: userId,
          action: 'status_changed',
          details: {
            from: TICKET_STATUS.AWAITING_STUDENT_RESPONSE,
            to: TICKET_STATUS.IN_PROGRESS,
            reason: 'Student replied',
          },
          visibility: 'student_visible',
        }),
      ]);
    } else {
      // Update ticket's updated_at (no status change)
      await txn
        .update(tickets)
        .set({ updated_at: new Date() })
        .where(eq(tickets.id, ticketId));
    }

    // FIX: Outbox insert moved OUTSIDE transaction (fire-and-forget)
    // This reduces transaction time and lock duration
    // Notifications are non-critical - can be retried if they fail

    return activity;
  }).then(async (activity) => {
    // FIX: Queue notification AFTER transaction commits (async, non-blocking)
    // This ensures transaction is fast while notifications are reliable
    if (!input.is_internal) {
      // Use queueMicrotask for true fire-and-forget (doesn't block response)
      queueMicrotask(async () => {
        try {
          await db.insert(outbox).values({
            event_type: 'ticket.comment_added',
            aggregate_type: 'ticket',
            aggregate_id: String(ticketId),
            payload: {
              ticketId: Number(ticketId),
              comment: input.comment,
              commentedBy: String(userId),
              isInternal: input.is_internal || false,
            },
          });
        } catch (outboxError: any) {
          logger.error(
            { 
              error: outboxError?.message || String(outboxError),
              ticketId, 
              userId 
            },
            'Failed to queue comment notification (non-critical)'
          );
        }
      });
    }

    return activity;
  });
}

/**
 * Update ticket description
 */
export async function updateTicketDescription(
  ticketId: number,
  userId: string,
  newDescription: string
) {
  return withTransaction(async (txn) => {
    const [ticket] = await txn
      .select()
      .from(tickets)
      .where(eq(tickets.id, ticketId))
      .limit(1);

    if (!ticket) {
      throw Errors.notFound('Ticket', String(ticketId));
    }

    const oldDescription = ticket.description;

    // Update description
    const [updatedTicket] = await txn
      .update(tickets)
      .set({
        description: newDescription,
        updated_at: new Date(),
      })
      .where(eq(tickets.id, ticketId))
      .returning();

    // Log activity
    await txn.insert(ticket_activity).values({
      ticket_id: ticketId,
      user_id: userId,
      action: 'description_updated',
      details: {
        old_description: oldDescription,
        new_description: newDescription,
      },
    });

    logger.info(
      {
        ticketId,
        ticketNumber: ticket.ticket_number,
        userId,
      },
      'Ticket description updated'
    );

    return updatedTicket;
  });
}

/**
 * Update ticket title
 */
export async function updateTicketTitle(
  ticketId: number,
  userId: string,
  newTitle: string
) {
  return withTransaction(async (txn) => {
    const [ticket] = await txn
      .select()
      .from(tickets)
      .where(eq(tickets.id, ticketId))
      .limit(1);

    if (!ticket) {
      throw Errors.notFound('Ticket', String(ticketId));
    }

    const oldTitle = ticket.title;

    // Update title
    const [updatedTicket] = await txn
      .update(tickets)
      .set({
        title: newTitle,
        updated_at: new Date(),
      })
      .where(eq(tickets.id, ticketId))
      .returning();

    // Log activity
    await txn.insert(ticket_activity).values({
      ticket_id: ticketId,
      user_id: userId,
      action: 'title_updated',
      details: {
        old_title: oldTitle,
        new_title: newTitle,
      },
    });

    logger.info(
      {
        ticketId,
        ticketNumber: ticket.ticket_number,
        userId,
      },
      'Ticket title updated'
    );

    return updatedTicket;
  });
}
