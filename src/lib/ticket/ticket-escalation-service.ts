/**
 * Ticket Escalation Service
 * 
 * Handles automatic escalation of overdue tickets
 * Uses escalation rules hierarchy based on category domain/scope
 */

import { db, tickets, ticket_activity, categories, escalation_rules } from '@/db';
import { and, isNull, lt, asc } from 'drizzle-orm';
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
        continue;
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

      const updateData: any = {
        escalation_level: nextLevel,
        escalated_at: now,
        updated_at: now,
      };

      if (applicableRules.length > 0) {
        const rule = applicableRules[0];
        if (rule.escalate_to_user_id) {
          updateData.assigned_to = rule.escalate_to_user_id;
        }

        // Log escalation activity
        await txn.insert(ticket_activity).values({
          ticket_id: ticket.id,
          user_id: null, // System action
          action: 'escalated',
          details: {
            reason: 'Not acknowledged within SLA',
            escalation_level: nextLevel,
            previous_level: currentEscalationLevel,
            escalated_to_user_id: rule.escalate_to_user_id,
            rule_id: rule.id,
            due_at: ticket.acknowledgement_due_at,
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
            dueAt: ticket.acknowledgement_due_at,
          },
          'Ticket escalated for missing acknowledgement (using escalation rule)'
        );
      } else {
        // No matching rule found, just increment escalation level
        await txn.insert(ticket_activity).values({
          ticket_id: ticket.id,
          user_id: null,
          action: 'escalated',
          details: {
            reason: 'Not acknowledged within SLA (no matching escalation rule found)',
            escalation_level: nextLevel,
            previous_level: currentEscalationLevel,
            due_at: ticket.acknowledgement_due_at,
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
            dueAt: ticket.acknowledgement_due_at,
          },
          'Ticket escalated for missing acknowledgement but no matching escalation rule found'
        );
      }

      await txn
        .update(tickets)
        .set(updateData)
        .where(eq(tickets.id, ticket.id));

      escalatedCount++;
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
        continue;
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

      const updateData: any = {
        escalation_level: nextLevel,
        escalated_at: now,
        updated_at: now,
      };

      if (applicableRules.length > 0) {
        const rule = applicableRules[0];
        if (rule.escalate_to_user_id) {
          updateData.assigned_to = rule.escalate_to_user_id;
        }

        // Log escalation activity
        await txn.insert(ticket_activity).values({
          ticket_id: ticket.id,
          user_id: null, // System action
          action: 'escalated',
          details: {
            reason: 'Not resolved within SLA',
            escalation_level: nextLevel,
            previous_level: currentEscalationLevel,
            escalated_to_user_id: rule.escalate_to_user_id,
            rule_id: rule.id,
            due_at: ticket.resolution_due_at,
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
            dueAt: ticket.resolution_due_at,
          },
          'Ticket escalated for missing resolution (using escalation rule)'
        );
      } else {
        // No matching rule found, just increment escalation level
        await txn.insert(ticket_activity).values({
          ticket_id: ticket.id,
          user_id: null,
          action: 'escalated',
          details: {
            reason: 'Not resolved within SLA (no matching escalation rule found)',
            escalation_level: nextLevel,
            previous_level: currentEscalationLevel,
            due_at: ticket.resolution_due_at,
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
            dueAt: ticket.resolution_due_at,
          },
          'Ticket escalated for missing resolution but no matching escalation rule found'
        );
      }

      await txn
        .update(tickets)
        .set(updateData)
        .where(eq(tickets.id, ticket.id));

      escalatedCount++;
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
