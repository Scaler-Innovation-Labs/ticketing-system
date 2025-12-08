/**
 * Ticket Operations Service
 * 
 * Additional ticket operations:
 * - Manual escalation
 * - Reopen tickets
 * - TAT extension
 * - Feedback submission
 */

import { db, tickets, ticket_activity, ticket_feedback, ticket_statuses, users } from '@/db';
import { eq, and, isNull } from 'drizzle-orm';
import { sql } from 'drizzle-orm';
import { logger } from '@/lib/logger';
import { Errors } from '@/lib/errors';
import { withTransaction } from '@/lib/db-transaction';
import { getUserRole } from '@/lib/auth/roles';
import { USER_ROLES, TICKET_STATUS } from '@/conf/constants';
import { getStatusId } from './ticket-service';

/**
 * Parse TAT string to hours
 * e.g. "48 hours" -> 48, "2 days" -> 48
 */
export function parseTAT(tat: string): number {
  const lower = tat.toLowerCase();
  const match = lower.match(/^(\d+)\s*(hour|day|week)s?$/);

  if (!match) {
    // Try just parsing number as hours
    const num = parseInt(tat, 10);
    if (!isNaN(num)) return num;
    throw Errors.validation('Invalid TAT format. Use "X hours" or "X days"');
  }

  const value = parseInt(match[1], 10);
  const unit = match[2];

  switch (unit) {
    case 'day': return value * 24;
    case 'week': return value * 24 * 7;
    default: return value;
  }
}

/**
 * Manual escalation by student or admin
 * Increments escalation_level and logs activity
 */
export async function escalateTicket(
  ticketId: number,
  userId: string,
  reason?: string
) {
  return withTransaction(async (txn) => {
    // Get ticket
    const [ticket] = await txn
      .select()
      .from(tickets)
      .where(eq(tickets.id, ticketId))
      .limit(1);

    if (!ticket) {
      throw Errors.notFound('Ticket', String(ticketId));
    }

    // Check if ticket is closed
    if (ticket.closed_at) {
      throw Errors.validation('Cannot escalate a closed ticket');
    }

    // Get user role
    const role = await getUserRole(userId);

    // Students can only escalate their own tickets
    if (role === USER_ROLES.STUDENT && ticket.created_by !== userId) {
      throw Errors.forbidden('You can only escalate your own tickets');
    }

    const newEscalationLevel = (ticket.escalation_level ?? 0) + 1;
    const now = new Date();

    // Update ticket
    const [updated] = await txn
      .update(tickets)
      .set({
        escalation_level: newEscalationLevel,
        escalated_at: now,
        updated_at: now,
      })
      .where(eq(tickets.id, ticketId))
      .returning();

    // Log activity
    await txn.insert(ticket_activity).values({
      ticket_id: ticketId,
      user_id: userId,
      action: 'escalated',
      details: {
        reason: reason || 'Manual escalation',
        escalation_level: newEscalationLevel,
        previous_level: ticket.escalation_level,
      },
      visibility: 'student_visible',
    });

    logger.info(
      {
        ticketId,
        ticketNumber: ticket.ticket_number,
        userId,
        escalationLevel: newEscalationLevel,
        reason,
      },
      'Ticket manually escalated'
    );

    return updated;
  });
}

/**
 * Reopen a resolved or closed ticket
 * Students can only reopen their own tickets
 */
export async function reopenTicket(
  ticketId: number,
  userId: string,
  reason: string
) {
  return withTransaction(async (txn) => {
    // Get ticket
    const [ticket] = await txn
      .select()
      .from(tickets)
      .where(eq(tickets.id, ticketId))
      .limit(1);

    if (!ticket) {
      throw Errors.notFound('Ticket', String(ticketId));
    }

    // Get user role
    const role = await getUserRole(userId);

    // Students can only reopen their own tickets
    if (role === USER_ROLES.STUDENT && ticket.created_by !== userId) {
      throw Errors.forbidden('You can only reopen your own tickets');
    }

    // Check if ticket can be reopened (must be resolved or closed)
    if (!ticket.resolved_at && !ticket.closed_at) {
      throw Errors.validation('Only resolved or closed tickets can be reopened');
    }

    const newReopenCount = (ticket.reopen_count ?? 0) + 1;
    const now = new Date();

    // Warning threshold
    const WARNING_THRESHOLD = 3;
    if (newReopenCount > WARNING_THRESHOLD) {
      logger.warn(
        {
          ticketId,
          ticketNumber: ticket.ticket_number,
          reopenCount: newReopenCount,
        },
        'Ticket reopened multiple times - may need escalation'
      );
    }

    // Get "reopened" status (or fall back to "open")
    // Note: You should have a "reopened" status in ticket_statuses table
    const reopenedStatus = await txn
      .select()
      .from(ticket_statuses)
      .where(eq(ticket_statuses.value, 'reopened'))
      .limit(1);

    const statusId = reopenedStatus[0]?.id || ticket.status_id;

    // Update ticket
    const [updated] = await txn
      .update(tickets)
      .set({
        status_id: statusId,
        reopen_count: newReopenCount,
        reopened_at: now,
        resolved_at: null,
        closed_at: null,
        updated_at: now,
      })
      .where(eq(tickets.id, ticketId))
      .returning();

    // Log activity
    await txn.insert(ticket_activity).values({
      ticket_id: ticketId,
      user_id: userId,
      action: 'reopened',
      details: {
        reason,
        reopen_count: newReopenCount,
        previous_status: ticket.status_id,
      },
      visibility: 'student_visible',
    });

    logger.info(
      {
        ticketId,
        ticketNumber: ticket.ticket_number,
        userId,
        reopenCount: newReopenCount,
        reason,
      },
      'Ticket reopened'
    );

    return {
      ticket: updated,
      reopenCount: newReopenCount,
      warning:
        newReopenCount >= WARNING_THRESHOLD
          ? `This ticket has been reopened ${newReopenCount} times. After 3 reopens, tickets are flagged for review.`
          : undefined,
    };
  });
}

/**
 * Extend TAT (Turn Around Time) for a ticket
 * Only admins can extend TAT
 */
export async function extendTAT(
  ticketId: number,
  userId: string,
  hours: number,
  reason: string
) {
  return withTransaction(async (txn) => {
    // Check user is admin
    const role = await getUserRole(userId);
    if (role === USER_ROLES.STUDENT) {
      throw Errors.forbidden('Only admins can extend TAT');
    }

    // Get ticket
    const [ticket] = await txn
      .select()
      .from(tickets)
      .where(eq(tickets.id, ticketId))
      .limit(1);

    if (!ticket) {
      throw Errors.notFound('Ticket', String(ticketId));
    }

    // Check if ticket is closed
    if (ticket.closed_at) {
      throw Errors.validation('Cannot extend TAT for closed tickets');
    }

    if (!ticket.resolution_due_at) {
      throw Errors.validation('Ticket has no resolution deadline to extend');
    }

    const newTatExtensions = (ticket.tat_extensions ?? 0) + 1;
    const WARNING_THRESHOLD = 3;

    if (newTatExtensions > WARNING_THRESHOLD) {
      logger.warn(
        {
          ticketId,
          ticketNumber: ticket.ticket_number,
          tatExtensions: newTatExtensions,
        },
        'Ticket TAT extended multiple times - may trigger escalation'
      );
    }

    // Extend resolution deadline
    const currentDeadline = new Date(ticket.resolution_due_at);
    const newDeadline = new Date(currentDeadline.getTime() + hours * 60 * 60 * 1000);

    // Update ticket
    const [updated] = await txn
      .update(tickets)
      .set({
        resolution_due_at: newDeadline,
        tat_extensions: newTatExtensions,
        updated_at: new Date(),
      })
      .where(eq(tickets.id, ticketId))
      .returning();

    // Log activity
    await txn.insert(ticket_activity).values({
      ticket_id: ticketId,
      user_id: userId,
      action: 'tat_extended',
      details: {
        reason,
        hours_extended: hours,
        previous_deadline: ticket.resolution_due_at,
        new_deadline: newDeadline,
        tat_extensions: newTatExtensions,
      },
      visibility: 'admin_only',
    });

    logger.info(
      {
        ticketId,
        ticketNumber: ticket.ticket_number,
        userId,
        hours,
        tatExtensions: newTatExtensions,
        reason,
      },
      'Ticket TAT extended'
    );

    return {
      ticket: updated,
      tatExtensions: newTatExtensions,
      warning:
        newTatExtensions >= WARNING_THRESHOLD
          ? `This is TAT extension #${newTatExtensions}. After 3 extensions, tickets are flagged for review.`
          : undefined,
    };
  });
}

/**
 * Submit feedback for a ticket
 * Only students can submit feedback for their own tickets
 * Ticket must be resolved or closed
 */
export async function submitFeedback(
  ticketId: number,
  userId: string,
  rating: number,
  feedbackText?: string
) {
  return withTransaction(async (txn) => {
    // Validate rating
    if (rating < 1 || rating > 5) {
      throw Errors.validation('Rating must be between 1 and 5');
    }

    // Get ticket
    const [ticket] = await txn
      .select()
      .from(tickets)
      .where(eq(tickets.id, ticketId))
      .limit(1);

    if (!ticket) {
      throw Errors.notFound('Ticket', String(ticketId));
    }

    // Check ticket is resolved or closed
    if (!ticket.resolved_at && !ticket.closed_at) {
      throw Errors.validation(
        'Feedback can only be submitted for resolved or closed tickets'
      );
    }

    // Students can only submit feedback for their own tickets
    const role = await getUserRole(userId);
    if (role === USER_ROLES.STUDENT && ticket.created_by !== userId) {
      throw Errors.forbidden('You can only submit feedback for your own tickets');
    }

    // Check if feedback already exists
    const existing = await txn
      .select()
      .from(ticket_feedback)
      .where(eq(ticket_feedback.ticket_id, ticketId))
      .limit(1);

    if (existing.length > 0) {
      throw Errors.validation('Feedback already submitted for this ticket');
    }

    // Insert feedback
    const [feedback] = await txn
      .insert(ticket_feedback)
      .values({
        ticket_id: ticketId,
        rating,
        feedback: feedbackText || null,
      })
      .returning();

    // Log activity
    await txn.insert(ticket_activity).values({
      ticket_id: ticketId,
      user_id: userId,
      action: 'feedback_submitted',
      details: {
        rating,
        has_feedback: !!feedbackText,
      },
      visibility: 'admin_only',
    });

    // Poor ratings (<=2) should trigger review
    if (rating <= 2) {
      logger.warn(
        {
          ticketId,
          ticketNumber: ticket.ticket_number,
          rating,
          userId,
        },
        'Poor rating received - may need review'
      );

      // You could trigger escalation or notification here
    }

    logger.info(
      {
        ticketId,
        ticketNumber: ticket.ticket_number,
        userId,
        rating,
      },
      'Feedback submitted'
    );

    return feedback;
  });
}

/**
 * Set initial TAT for a ticket
 * Can also mark ticket as in_progress
 */
export async function setTAT(
  ticketId: number,
  userId: string,
  tatString: string,
  markInProgress: boolean = false
) {
  return withTransaction(async (txn) => {
    // Parse TAT
    const hours = parseTAT(tatString);

    // Get ticket
    const [ticket] = await txn
      .select()
      .from(tickets)
      .where(eq(tickets.id, ticketId))
      .limit(1);

    if (!ticket) {
      throw Errors.notFound('Ticket', String(ticketId));
    }

    // Calculate deadline
    const now = new Date();
    const deadline = new Date(now.getTime() + hours * 60 * 60 * 1000);

    // Skip user lookup to avoid blocking TAT set on user fetch issues
    const userName = 'Admin';

    // Prepare metadata updates
    const metadataUpdates = {
      tatSetAt: now.toISOString(),
      tatSetBy: userName,
      tatDate: deadline.toISOString(),
    };

    const updates: any = {
      resolution_due_at: deadline,
      updated_at: now,
      metadata: sql`COALESCE(metadata, '{}'::jsonb) || ${JSON.stringify(metadataUpdates)}::jsonb`,
    };

    // Mark in progress if requested and not already
    let statusChanged = false;

    if (markInProgress) {
      const inProgressId = await getStatusId(TICKET_STATUS.IN_PROGRESS);
      if (ticket.status_id !== inProgressId) {
        updates.status_id = inProgressId;
        statusChanged = true;
      }
    }

    // Update ticket
    const [updated] = await txn
      .update(tickets)
      .set(updates)
      .where(eq(tickets.id, ticketId))
      .returning();

    // Log activity
    await txn.insert(ticket_activity).values({
      ticket_id: ticketId,
      user_id: userId,
      action: 'tat_set',
      details: {
        tat_string: tatString,
        hours,
        deadline,
        status_changed: statusChanged,
      },
      visibility: 'admin_only',
    });

    logger.info(
      {
        ticketId,
        userId,
        tat: tatString,
        deadline,
      },
      'Ticket TAT set'
    );

    return updated;
  });
}
