/**
 * Ticket Escalation Service
 * 
 * Handles automatic escalation of overdue tickets
 */

import { db, tickets, ticket_activity } from '@/db';
import { and, isNull, lt } from 'drizzle-orm';
import { logger } from '@/lib/logger';
import { withTransaction } from '@/lib/db-transaction';
import { eq } from 'drizzle-orm';

/**
 * Escalate tickets that are past their acknowledgement deadline
 */
export async function escalateUnacknowledgedTickets() {
  return withTransaction(async (txn) => {
    const now = new Date();

    // Find tickets past acknowledgement_due_at without resolved_at
    // (No explicit acknowledged_at field, so we check if still not resolved)
    const overdueTickets = await txn
      .select()
      .from(tickets)
      .where(
        and(
          isNull(tickets.resolved_at),
          lt(tickets.acknowledgement_due_at, now),
          isNull(tickets.closed_at) // Not already closed
        )
      );

    if (overdueTickets.length === 0) {
      logger.info('No tickets to escalate for acknowledgement');
      return { escalated: 0 };
    }

    let escalatedCount = 0;

    for (const ticket of overdueTickets) {
      // Only escalate if escalation_level is 0 (not yet escalated for ack)
      if (ticket.escalation_level > 0) {
        continue;
      }

      // Increment escalation level
      const newEscalationLevel = (ticket.escalation_level ?? 0) + 1;

      await txn
        .update(tickets)
        .set({
          escalation_level: newEscalationLevel,
          updated_at: now,
        })
        .where(eq(tickets.id, ticket.id));

      // Log escalation activity
      await txn.insert(ticket_activity).values({
        ticket_id: ticket.id,
        user_id: null, // System action
        action: 'escalated',
        details: {
          reason: 'Not acknowledged within SLA',
          escalation_level: newEscalationLevel,
          due_at: ticket.acknowledgement_due_at,
        },
        visibility: 'admin_only',
      });

      escalatedCount++;

      logger.warn(
        {
          ticketId: ticket.id,
          ticketNumber: ticket.ticket_number,
          escalationLevel: newEscalationLevel,
          dueAt: ticket.acknowledgement_due_at,
        },
        'Ticket escalated for missing acknowledgement'
      );
    }

    return { escalated: escalatedCount };
  });
}

/**
 * Escalate tickets that are past their resolution deadline
 */
export async function escalateUnresolvedTickets() {
  return withTransaction(async (txn) => {
    const now = new Date();

    // Find tickets past resolution_due_at without resolved_at
    const overdueTickets = await txn
      .select()
      .from(tickets)
      .where(
        and(
          isNull(tickets.resolved_at),
          lt(tickets.resolution_due_at, now),
          isNull(tickets.closed_at) // Not already closed
        )
      );

    if (overdueTickets.length === 0) {
      logger.info('No tickets to escalate for resolution');
      return { escalated: 0 };
    }

    let escalatedCount = 0;

    for (const ticket of overdueTickets) {
      // Increment escalation level
      const newEscalationLevel = (ticket.escalation_level ?? 0) + 1;

      await txn
        .update(tickets)
        .set({
          escalation_level: newEscalationLevel,
          updated_at: now,
        })
        .where(eq(tickets.id, ticket.id));

      // Log escalation activity
      await txn.insert(ticket_activity).values({
        ticket_id: ticket.id,
        user_id: null, // System action
        action: 'escalated',
        details: {
          reason: 'Not resolved within SLA',
          escalation_level: newEscalationLevel,
          due_at: ticket.resolution_due_at,
        },
        visibility: 'admin_only',
      });

      escalatedCount++;

      logger.warn(
        {
          ticketId: ticket.id,
          ticketNumber: ticket.ticket_number,
          escalationLevel: newEscalationLevel,
          dueAt: ticket.resolution_due_at,
        },
        'Ticket escalated for missing resolution'
      );
    }

    return { escalated: escalatedCount };
  });
}

/**
 * Run all escalation checks
 */
export async function runEscalation() {
  logger.info('Starting ticket escalation job');

  const [ackResult, resolveResult] = await Promise.all([
    escalateUnacknowledgedTickets(),
    escalateUnresolvedTickets(),
  ]);

  const totalEscalated = ackResult.escalated + resolveResult.escalated;

  logger.info(
    {
      acknowledgement: ackResult.escalated,
      resolution: resolveResult.escalated,
      total: totalEscalated,
    },
    'Ticket escalation job completed'
  );

  return {
    acknowledgement: ackResult.escalated,
    resolution: resolveResult.escalated,
    total: totalEscalated,
  };
}
