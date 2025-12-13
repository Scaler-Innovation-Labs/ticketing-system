/**
 * Ticket Escalation Service
 * 
 * Handles automatic escalation of overdue tickets
 * Uses escalation rules hierarchy based on category domain/scope
 */

import { db, tickets, ticket_activity, categories, escalation_rules, ticket_statuses } from '@/db';
import { and, isNull, isNotNull, lt, asc, sql, eq, ne } from 'drizzle-orm';
import { logger } from '@/lib/logger';
import { withTransaction } from '@/lib/db-transaction';
import { TICKET_STATUS } from '@/conf/constants';
import { addBusinessHours } from '@/lib/ticket/utils/tat-calculator';

/**
 * Check if a date is a weekend (Saturday or Sunday)
 */
function isWeekend(date: Date): boolean {
  const day = date.getDay();
  return day === 0 || day === 6; // 0 = Sunday, 6 = Saturday
}

// Acknowledgement deadline escalation has been removed
// Only resolution deadline escalation is used

/**
 * Escalate tickets that are past their resolution deadline
 */
export async function escalateUnresolvedTickets() {
  return withTransaction(async (txn) => {
    const now = new Date();

    // Find tickets past resolution_due_at without resolved_at
    // Exclude tickets in "awaiting_student_response" status (TAT is paused)
    
    // First, get the status ID for awaiting_student_response
    const [awaitingStatus] = await txn
      .select({ id: ticket_statuses.id })
      .from(ticket_statuses)
      .where(eq(ticket_statuses.value, TICKET_STATUS.AWAITING_STUDENT_RESPONSE))
      .limit(1);
    
    const overdueTickets = await txn
      .select()
      .from(tickets)
      .where(
        and(
          isNull(tickets.resolved_at),
          isNull(tickets.closed_at), // Not already closed
          isNotNull(tickets.resolution_due_at), // resolution_due_at is not null
          lt(tickets.resolution_due_at, now), // Past due date
          awaitingStatus ? ne(tickets.status_id, awaitingStatus.id) : sql`true` // Not in awaiting_student_response
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

  const resolveResult = await escalateUnresolvedTickets();

  logger.info(
    {
      resolution: resolveResult.escalated,
      total: resolveResult.escalated,
    },
    'Ticket escalation job completed'
  );

  return {
    resolution: resolveResult.escalated,
    total: resolveResult.escalated,
  };
}