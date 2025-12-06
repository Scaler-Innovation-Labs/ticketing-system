/**
 * Ticket Comments Service
 * 
 * Handles adding comments and internal notes to tickets
 */

import { db, ticket_activity, tickets } from '@/db';
import { eq } from 'drizzle-orm';
import { logger } from '@/lib/logger';
import { Errors } from '@/lib/errors';
import { withTransaction } from '@/lib/db-transaction';

export interface AddCommentInput {
  comment: string;
  is_internal?: boolean;
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
export async function addTicketComment(
  ticketId: number,
  userId: string,
  input: AddCommentInput
) {
  return withTransaction(async (txn) => {
    // Verify ticket exists
    const [ticket] = await txn
      .select()
      .from(tickets)
      .where(eq(tickets.id, ticketId))
      .limit(1);

    if (!ticket) {
      throw Errors.notFound('Ticket', String(ticketId));
    }

    // Add comment as activity
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

    // Update ticket's updated_at
    await txn
      .update(tickets)
      .set({ updated_at: new Date() })
      .where(eq(tickets.id, ticketId));

    logger.info(
      {
        ticketId,
        userId,
        isInternal: input.is_internal,
        hasAttachments: (input.attachments?.length || 0) > 0,
      },
      'Comment added to ticket'
    );

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
