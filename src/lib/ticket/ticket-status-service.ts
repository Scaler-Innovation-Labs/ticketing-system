/**
 * Ticket Status Service
 * 
 * Handles ticket status transitions and validation
 */

import { db, tickets, ticket_activity, ticket_statuses, outbox, users } from '@/db';
import { eq, and, sql } from 'drizzle-orm';
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
    TICKET_STATUS.CLOSED, // allow direct close from open
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
 * Validate status transition (case-insensitive)
 */
export function isValidTransition(fromStatus: string, toStatus: string): boolean {
  const normalizedFrom = (fromStatus || '').toLowerCase();
  const normalizedTo = (toStatus || '').toLowerCase();
  const allowedTransitions = VALID_TRANSITIONS[normalizedFrom] || [];
  // VALID_TRANSITIONS values are already lowercase, so direct comparison
  return allowedTransitions.includes(normalizedTo);
}

/**
 * Get current status value from status_id
 */
export async function getStatusValue(statusId: number): Promise<string> {
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
  // OPTIMIZATION: Move read-only status lookups outside transaction
  // These are read-only operations that don't need transaction isolation
  // First, get the ticket to read its status_id
  const [ticket] = await db
    .select({ status_id: tickets.status_id })
    .from(tickets)
    .where(eq(tickets.id, ticketId))
    .limit(1);

  if (!ticket || !ticket.status_id) {
    throw Errors.notFound('Ticket', String(ticketId));
  }

  // OPTIMIZATION: Parallelize status lookups
  const normalizedNewStatus = (newStatusValue || '').toLowerCase();
  const [currentStatus, newStatusId] = await Promise.all([
    getStatusValue(ticket.status_id),
    getStatusId(normalizedNewStatus),
  ]);

  const normalizedCurrentStatus = (currentStatus || '').toLowerCase();

  // Validate transition
  if (!isValidTransition(normalizedCurrentStatus, normalizedNewStatus)) {
    throw Errors.invalidStatusTransition(currentStatus, newStatusValue);
  }

  if (!newStatusId || typeof newStatusId !== 'number') {
    throw Errors.invalidRequest(`Invalid status ID for status: ${newStatusValue}`);
  }

  // Now proceed with transaction for writes
  return withTransaction(async (txn) => {
    // Get full ticket data for updates
    const [ticketData] = await txn
      .select()
      .from(tickets)
      .where(eq(tickets.id, ticketId))
      .limit(1);

    if (!ticketData || typeof ticketData !== 'object') {
      throw Errors.notFound('Ticket', String(ticketId));
    }

    // 5. Handle TAT pause/resume for awaiting_student_response
    const { calculateRemainingBusinessHours, addBusinessHours } = require('./utils/tat-calculator');
    const metadata = (ticketData.metadata as Record<string, any>) || {};
    const now = new Date();
    let metadataUpdated = false;
    
    // Initialize updates object
    const updates: Record<string, any> = {
      status_id: Number(newStatusId),
      updated_at: new Date(),
    };
    
    // If transitioning TO awaiting_student_response, pause TAT
    if (normalizedNewStatus === TICKET_STATUS.AWAITING_STUDENT_RESPONSE.toLowerCase() && 
        normalizedCurrentStatus !== TICKET_STATUS.AWAITING_STUDENT_RESPONSE.toLowerCase()) {
      // Calculate remaining TAT hours
      if (ticketData.resolution_due_at) {
        const remainingHours = calculateRemainingBusinessHours(now, new Date(ticketData.resolution_due_at));
        metadata.tatPausedAt = now.toISOString();
        metadata.tatRemainingHours = remainingHours;
        metadata.tatPausedStatus = normalizedCurrentStatus;
        metadataUpdated = true;
      }
    }
    
    // If transitioning FROM awaiting_student_response, resume TAT
    if (normalizedCurrentStatus === TICKET_STATUS.AWAITING_STUDENT_RESPONSE.toLowerCase() &&
        normalizedNewStatus !== TICKET_STATUS.AWAITING_STUDENT_RESPONSE.toLowerCase()) {
      if (metadata.tatPausedAt && metadata.tatRemainingHours) {
        // Resume TAT by adding remaining hours from now
        const remainingHours = typeof metadata.tatRemainingHours === 'number' 
          ? metadata.tatRemainingHours 
          : parseFloat(metadata.tatRemainingHours);
        
        if (remainingHours > 0) {
          const newDeadline = addBusinessHours(now, remainingHours);
          updates.resolution_due_at = newDeadline;
          
          // Clear pause metadata
          delete metadata.tatPausedAt;
          delete metadata.tatRemainingHours;
          delete metadata.tatPausedStatus;
          metadataUpdated = true;
        }
      }
    }

    // Update metadata if it was modified
    if (metadataUpdated) {
      updates.metadata = sql`COALESCE(${tickets.metadata}, '{}'::jsonb) || ${JSON.stringify(metadata)}::jsonb`;
    }

    // Track specific status changes (use normalized value for comparison)
    if (normalizedNewStatus === TICKET_STATUS.RESOLVED.toLowerCase()) {
      updates.resolved_at = new Date();
    }

    if (normalizedNewStatus === TICKET_STATUS.CLOSED.toLowerCase()) {
      updates.closed_at = new Date();
    }

    if (normalizedNewStatus === TICKET_STATUS.REOPENED.toLowerCase()) {
      const currentReopenCount = ticketData?.reopen_count;
      const reopenCountValue = (typeof currentReopenCount === 'number' ? currentReopenCount : 0) + 1;
      updates.reopen_count = reopenCountValue;
      updates.resolved_at = null;
      updates.closed_at = null;
    }

    const updatedTickets = await txn
      .update(tickets)
      .set(updates)
      .where(eq(tickets.id, ticketId))
      .returning();

    if (!updatedTickets || updatedTickets.length === 0) {
      throw Errors.notFound('Ticket', String(ticketId));
    }

    const [updatedTicket] = updatedTickets;

    // OPTIMIZATION: Parallelize activity and outbox inserts
    // These are independent operations and can run simultaneously
    const activityDetails: Record<string, string> = {
      from: String(currentStatus || 'unknown'),
      to: String(newStatusValue || 'unknown'),
    };
    if (comment && typeof comment === 'string' && comment.trim()) {
      activityDetails.comment = String(comment.trim());
    }

    await Promise.allSettled([
      // 6. Log activity
      txn.insert(ticket_activity).values({
        ticket_id: Number(ticketId),
        user_id: String(userId),
        action: 'status_changed',
        details: activityDetails as any, // JSONB field
      }),

      // 7. Queue notification
      txn.insert(outbox).values({
        event_type: 'ticket.status_updated',
        aggregate_type: 'ticket',
        aggregate_id: String(ticketId),
        payload: {
          ticketId: Number(ticketId),
          oldStatus: String(currentStatus || 'unknown'),
          newStatus: String(newStatusValue || 'unknown'),
          updatedBy: String(userId || 'unknown'),
        } as any, // JSONB field
      }),
    ]).then((results) => {
      // Log any failures but don't throw (these are non-critical operations)
      results.forEach((result, index) => {
        if (result.status === 'rejected') {
          const operation = ['activity', 'outbox'][index];
          logger.error(
            { 
              error: result.reason?.message || String(result.reason),
              ticketId, 
              userId,
              operation
            },
            `Failed to ${operation} insert during status update`
          );
        }
      });
    });

    logger.info(
      {
        ticketId: Number(ticketId),
        ticketNumber: ticketData?.ticket_number || null,
        from: String(currentStatus || 'unknown'),
        to: String(newStatusValue || 'unknown'),
        userId: String(userId || 'unknown'),
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
        isForward: false,
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

    // Validate target user exists to avoid FK failure
    const [targetUser] = await txn
      .select({ id: users.id })
      .from(users)
      .where(eq(users.id, forwardToUserId))
      .limit(1);
    if (!targetUser) {
      throw Errors.notFound('User', forwardToUserId);
    }

    // Merge metadata in JS to avoid SQL jsonb path/cast issues
    const mergedMetadata = {
      ...(typeof ticket.metadata === 'object' && ticket.metadata !== null ? ticket.metadata : {}),
      previous_assigned_to: previousAssignee,
    };

    // Update ticket
    const [updatedTicket] = await txn
      .update(tickets)
      .set({
        assigned_to: forwardToUserId,
        forward_count: Number(ticket.forward_count ?? 0) + 1,
        updated_at: new Date(),
        metadata: mergedMetadata,
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
        isForward: true,
        reason,
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
