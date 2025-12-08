/**
 * Ticket Status Service
 * 
 * Handles ticket status transitions and validation
 */

import { db, tickets, ticket_activity, ticket_statuses, outbox } from '@/db';
import { eq, and } from 'drizzle-orm';
import { TICKET_STATUS } from '@/conf/constants';
import { logger } from '@/lib/logger';
import { Errors } from '@/lib/errors';
import { withTransaction } from '@/lib/db-transaction';
import { getStatusId } from './ticket-service';

// Valid status transitions
const VALID_TRANSITIONS: Record<string, string[]> = {
  [TICKET_STATUS.OPEN]: [
    TICKET_STATUS.ACKNOWLEDGED,
    TICKET_STATUS.CANCELLED,
    TICKET_STATUS.RESOLVED,
    TICKET_STATUS.IN_PROGRESS,
    TICKET_STATUS.AWAITING_STUDENT_RESPONSE, // allow asking a question directly from open
  ],
  [TICKET_STATUS.ACKNOWLEDGED]: [TICKET_STATUS.IN_PROGRESS, TICKET_STATUS.CANCELLED, TICKET_STATUS.RESOLVED, TICKET_STATUS.AWAITING_STUDENT_RESPONSE],
  [TICKET_STATUS.IN_PROGRESS]: [TICKET_STATUS.RESOLVED, TICKET_STATUS.CANCELLED, TICKET_STATUS.ACKNOWLEDGED, TICKET_STATUS.AWAITING_STUDENT_RESPONSE],
  [TICKET_STATUS.AWAITING_STUDENT_RESPONSE]: [TICKET_STATUS.IN_PROGRESS, TICKET_STATUS.RESOLVED, TICKET_STATUS.CANCELLED],
  [TICKET_STATUS.RESOLVED]: [TICKET_STATUS.CLOSED, TICKET_STATUS.REOPENED],
  [TICKET_STATUS.CLOSED]: [TICKET_STATUS.REOPENED],
  [TICKET_STATUS.REOPENED]: [TICKET_STATUS.ACKNOWLEDGED, TICKET_STATUS.IN_PROGRESS, TICKET_STATUS.CANCELLED, TICKET_STATUS.RESOLVED, TICKET_STATUS.CLOSED, TICKET_STATUS.AWAITING_STUDENT_RESPONSE],
  [TICKET_STATUS.CANCELLED]: [], // Terminal state
};

/**
 * Validate status transition
 */
export function isValidTransition(fromStatus: string, toStatus: string): boolean {
  const allowedTransitions = VALID_TRANSITIONS[fromStatus] || [];
  return allowedTransitions.includes(toStatus);
}

/**
 * Get current status value from status_id
 */
async function getStatusValue(statusId: number): Promise<string> {
  const [status] = await db
    .select({ value: ticket_statuses.value })
    .from(ticket_statuses)
    .where(eq(ticket_statuses.id, statusId))
    .limit(1);

  if (!status) {
    throw Errors.notFound('Status', String(statusId));
  }

  return status.value;
}

/**
 * Update ticket status
 */
export async function updateTicketStatus(
  ticketId: number,
  newStatusValue: string,
  userId: string,
  comment?: string
) {
  return withTransaction(async (txn) => {
    // 1. Get current ticket
    const [ticket] = await txn
      .select()
      .from(tickets)
      .where(eq(tickets.id, ticketId))
      .limit(1);

    if (!ticket) {
      throw Errors.notFound('Ticket', String(ticketId));
    }

    // 2. Get current and new status values
    const currentStatus = await getStatusValue(ticket.status_id);

    // 3. Validate transition
    if (!isValidTransition(currentStatus, newStatusValue)) {
      throw Errors.invalidStatusTransition(currentStatus, newStatusValue);
    }

    // 4. Get new status ID
    const newStatusId = await getStatusId(newStatusValue);

    // 5. Update ticket
    const updates: any = {
      status_id: newStatusId,
      updated_at: new Date(),
    };

    // Track specific status changes
    if (newStatusValue === TICKET_STATUS.RESOLVED) {
      updates.resolved_at = new Date();
    }

    if (newStatusValue === TICKET_STATUS.CLOSED) {
      updates.closed_at = new Date();
    }

    if (newStatusValue === TICKET_STATUS.REOPENED) {
      updates.reopen_count = ticket.reopen_count + 1;
      updates.resolved_at = null;
      updates.closed_at = null;
    }

    const [updatedTicket] = await txn
      .update(tickets)
      .set(updates)
      .where(eq(tickets.id, ticketId))
      .returning();

    // 6. Log activity
    await txn.insert(ticket_activity).values({
      ticket_id: ticketId,
      user_id: userId,
      action: 'status_changed',
      details: {
        from: currentStatus,
        to: newStatusValue,
        comment,
      },
    });

    // Queue notification
    await txn.insert(outbox).values({
      event_type: 'ticket.status_updated',
      aggregate_type: 'ticket',
      aggregate_id: String(ticketId),
      payload: {
        ticketId,
        oldStatus: currentStatus,
        newStatus: newStatusValue,
        updatedBy: userId,
      },
    });

    logger.info(
      {
        ticketId,
        ticketNumber: ticket.ticket_number,
        from: currentStatus,
        to: newStatusValue,
        userId,
      },
      'Ticket status updated'
    );

    return updatedTicket;
  });
}

/**
 * Assign ticket to user
 */
export async function assignTicket(
  ticketId: number,
  assignToUserId: string,
  assignedByUserId: string
) {
  return withTransaction(async (txn) => {
    // Get current ticket
    const [ticket] = await txn
      .select()
      .from(tickets)
      .where(eq(tickets.id, ticketId))
      .limit(1);

    if (!ticket) {
      throw Errors.notFound('Ticket', String(ticketId));
    }

    const previousAssignee = ticket.assigned_to;

    // Update assignment
    const [updatedTicket] = await txn
      .update(tickets)
      .set({
        assigned_to: assignToUserId,
        updated_at: new Date(),
      })
      .where(eq(tickets.id, ticketId))
      .returning();

    // Log activity
    await txn.insert(ticket_activity).values({
      ticket_id: ticketId,
      user_id: assignedByUserId,
      action: 'assigned',
      details: {
        assigned_to: assignToUserId,
        previous_assignee: previousAssignee,
      },
    });

    // Queue notification
    await txn.insert(outbox).values({
      event_type: 'ticket.assigned',
      aggregate_type: 'ticket',
      aggregate_id: String(ticketId),
      payload: {
        ticketId,
        assignedTo: assignToUserId,
        assignedBy: assignedByUserId,
      },
    });

    logger.info(
      {
        ticketId,
        ticketNumber: ticket.ticket_number,
        assignedTo: assignToUserId,
        assignedBy: assignedByUserId,
      },
      'Ticket assigned'
    );

    return updatedTicket;
  });
}

/**
 * Forward ticket (increment forward count)
 */
export async function forwardTicket(
  ticketId: number,
  forwardToUserId: string,
  forwardedByUserId: string,
  reason?: string
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

    const previousAssignee = ticket.assigned_to;

    // Update ticket
    const [updatedTicket] = await txn
      .update(tickets)
      .set({
        assigned_to: forwardToUserId,
        forward_count: ticket.forward_count + 1,
        updated_at: new Date(),
      })
      .where(eq(tickets.id, ticketId))
      .returning();

    // Log activity
    await txn.insert(ticket_activity).values({
      ticket_id: ticketId,
      user_id: forwardedByUserId,
      action: 'forwarded',
      details: {
        forwarded_to: forwardToUserId,
        previous_assignee: previousAssignee,
        reason,
        forward_count: updatedTicket.forward_count,
      },
    });

    // Queue notification
    await txn.insert(outbox).values({
      event_type: 'ticket.assigned',
      aggregate_type: 'ticket',
      aggregate_id: String(ticketId),
      payload: {
        ticketId,
        assignedTo: forwardToUserId,
        assignedBy: forwardedByUserId,
      },
    });

    logger.info(
      {
        ticketId,
        ticketNumber: ticket.ticket_number,
        forwardedTo: forwardToUserId,
        forwardCount: updatedTicket.forward_count,
      },
      'Ticket forwarded'
    );

    return updatedTicket;
  });
}
