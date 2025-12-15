/**
 * Ticket Operations Service
 * 
 * Additional ticket operations:
 * - Manual escalation
 * - Reopen tickets
 * - TAT extension
 * - Feedback submission
 */

import { db, tickets, ticket_activity, ticket_feedback, ticket_statuses, users, categories, escalation_rules } from '@/db';
import { eq, and, isNull, isNotNull, asc, sql } from 'drizzle-orm';
import { logger } from '@/lib/logger';
import { Errors } from '@/lib/errors';
import { withTransaction } from '@/lib/db-transaction';
import { getUserRole } from '@/lib/auth/roles';
import { USER_ROLES, TICKET_STATUS } from '@/conf/constants';
import { getStatusId } from './status-ids';
// FIX 3: Move import to module scope (not inside transaction)
import { addBusinessHours } from './utils/tat-calculator';

/**
 * Helper function to escalate a ticket to the next level
 * Used by various escalation triggers (TAT extension, reopen, negative feedback)
 */
async function escalateTicketToNextLevel(
  txn: any,
  ticket: any,
  reason: string
) {
  const now = new Date();
  
  // Get category to find domain_id
  const [category] = await txn
    .select({
      domain_id: categories.domain_id,
    })
    .from(categories)
    .where(eq(categories.id, ticket.category_id))
    .limit(1);

  if (!category) {
    logger.warn({ ticketId: ticket.id }, 'Ticket category not found, skipping escalation');
    return;
  }

  // Find next escalation rule based on current escalation level
  const currentEscalationLevel = ticket.escalation_level ?? 0;
  const nextLevel = currentEscalationLevel + 1;

  // Find escalation rule matching domain, scope (if any), and next level
  const applicableRules = await txn
    .select()
    .from(escalation_rules)
    .where(
      and(
        eq(escalation_rules.is_active, true),
        category.domain_id
          ? eq(escalation_rules.domain_id, category.domain_id)
          : isNull(escalation_rules.domain_id),
        ticket.scope_id
          ? eq(escalation_rules.scope_id, ticket.scope_id)
          : isNull(escalation_rules.scope_id),
        eq(escalation_rules.level, nextLevel)
      )
    )
    .orderBy(asc(escalation_rules.level))
    .limit(1);

  const prevAssignee = ticket.assigned_to;
  const updateData: any = {
    escalation_level: nextLevel,
    escalated_at: now,
    updated_at: now,
  };

  // Add 48 business hours to TAT deadlines when escalating
  if (ticket.acknowledgement_due_at) {
    updateData.acknowledgement_due_at = addBusinessHours(new Date(ticket.acknowledgement_due_at), 48);
  }
  if (ticket.resolution_due_at) {
    updateData.resolution_due_at = addBusinessHours(new Date(ticket.resolution_due_at), 48);
  }

  if (applicableRules.length > 0) {
    const rule = applicableRules[0];
    if (rule.escalate_to_user_id) {
      updateData.assigned_to = rule.escalate_to_user_id;
      const metadata = ticket.metadata as any || {};
      const updatedMetadata = { ...metadata, previous_assigned_to: prevAssignee };
      updateData.metadata = sql`COALESCE(${tickets.metadata}, '{}'::jsonb) || ${JSON.stringify(updatedMetadata)}::jsonb`;
    }

    // Log escalation activity
    await txn.insert(ticket_activity).values({
      ticket_id: ticket.id,
      user_id: null, // System action
      action: 'escalated',
      details: {
        reason,
        escalation_level: nextLevel,
        previous_level: currentEscalationLevel,
        escalated_to_user_id: rule.escalate_to_user_id,
        rule_id: rule.id,
      },
      visibility: 'admin_only',
    });

    logger.warn(
      {
        ticketId: ticket.id,
        ticketNumber: ticket.ticket_number,
        escalationLevel: nextLevel,
        escalatedTo: rule.escalate_to_user_id,
        ruleId: rule.id,
        reason,
      },
      'Ticket escalated (using escalation rule)'
    );
  } else {
    // No matching rule found, just increment escalation level
    await txn.insert(ticket_activity).values({
      ticket_id: ticket.id,
      user_id: null,
      action: 'escalated',
      details: {
        reason: `${reason} (no matching escalation rule found)`,
        escalation_level: nextLevel,
        previous_level: currentEscalationLevel,
      },
      visibility: 'admin_only',
    });

    logger.warn(
      {
        ticketId: ticket.id,
        ticketNumber: ticket.ticket_number,
        escalationLevel: nextLevel,
        domainId: category.domain_id,
        scopeId: ticket.scope_id,
        reason,
      },
      'Ticket escalated but no matching escalation rule found'
    );
  }

  await txn
    .update(tickets)
    .set(updateData)
    .where(eq(tickets.id, ticket.id));
}

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

    // Escalation threshold: escalate on 3rd reopen
    const ESCALATION_THRESHOLD = 3;
    const WARNING_THRESHOLD = 3;

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

    // Auto-escalate on 3rd reopen
    if (newReopenCount === ESCALATION_THRESHOLD) {
      await escalateTicketToNextLevel(txn, updated, 'Repeated reopening (3rd time)');
    }

    return {
      ticket: updated,
      reopenCount: newReopenCount,
      warning:
        newReopenCount >= WARNING_THRESHOLD
          ? `This ticket has been reopened ${newReopenCount} times. Tickets are auto-escalated on the 3rd reopen.`
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
    // Escalation thresholds on TAT extensions: 1st at 3, next at 5, then at 7
    const ESCALATION_THRESHOLDS = [3, 5, 7];
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

    // Extend resolution deadline (excluding weekends)
    // FIX 3: Use module-scoped import (no dynamic require inside transaction)
    const currentDeadline = new Date(ticket.resolution_due_at);
    const newDeadline = addBusinessHours(currentDeadline, hours);

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

    // Auto-escalate on configured extension thresholds (3, 5, 7)
    if (ESCALATION_THRESHOLDS.includes(newTatExtensions)) {
      await escalateTicketToNextLevel(txn, updated, `TAT extension limit reached (extension #${newTatExtensions})`);
    }

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
          ? `This is TAT extension #${newTatExtensions}. Auto-escalations occur at 3, 5, and 7 extensions.`
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

    // Poor ratings (1-2 stars) should trigger escalation
    if (rating <= 2) {
      logger.warn(
        {
          ticketId,
          ticketNumber: ticket.ticket_number,
          rating,
          userId,
        },
        'Poor rating received - escalating ticket'
      );

      // Escalate ticket due to negative feedback
      await escalateTicketToNextLevel(txn, ticket, `Negative feedback (${rating} star${rating === 1 ? '' : 's'})`);
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

    // Calculate deadline (excluding weekends)
    // FIX 3: Use module-scoped import (no dynamic require inside transaction)
    const now = new Date();
    const deadline = addBusinessHours(now, hours);

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
