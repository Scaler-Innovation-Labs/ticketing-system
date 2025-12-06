/**
 * Escalation Rules Service
 * 
 * Manages escalation rules for tickets based on TAT/SLA
 * Focused service for escalation logic
 */

import { db } from '@/db';
import { escalation_rules, domains, scopes, users } from '@/db';
import { eq, and, desc, isNull } from 'drizzle-orm';
import { logger } from '@/lib/logger';

export interface EscalationRuleData {
  domain_id: number | null;
  scope_id: number | null;
  level: number;
  escalate_to_user_id: string;
  tat_hours: number;
  notify_channel: string | null;
}

/**
 * List escalation rules
 */
export async function listEscalationRules(params?: {
  domain_id?: number;
  scope_id?: number;
}) {
  try {
    let query = db
      .select({
        id: escalation_rules.id,
        domain_id: escalation_rules.domain_id,
        domain_name: domains.name,
        scope_id: escalation_rules.scope_id,
        scope_name: scopes.name,
        level: escalation_rules.level,
        escalate_to_user_id: escalation_rules.escalate_to_user_id,
        escalate_to_name: users.full_name,
        escalate_to_email: users.email,
        tat_hours: escalation_rules.tat_hours,
        notify_channel: escalation_rules.notify_channel,
        is_active: escalation_rules.is_active,
        created_at: escalation_rules.created_at,
      })
      .from(escalation_rules)
      .leftJoin(domains, eq(escalation_rules.domain_id, domains.id))
      .leftJoin(scopes, eq(escalation_rules.scope_id, scopes.id))
      .innerJoin(users, eq(escalation_rules.escalate_to_user_id, users.id))
      .$dynamic();

    const conditions: any[] = [eq(escalation_rules.is_active, true)];

    if (params?.domain_id) {
      conditions.push(eq(escalation_rules.domain_id, params.domain_id));
    }

    if (params?.scope_id) {
      conditions.push(eq(escalation_rules.scope_id, params.scope_id));
    }

    const rules = await query
      .where(and(...conditions))
      .orderBy(escalation_rules.level, desc(escalation_rules.created_at));

    return rules;
  } catch (error) {
    logger.error({ error }, 'Error listing escalation rules');
    throw error;
  }
}

/**
 * Get escalation rule by ID
 */
export async function getEscalationRuleById(id: number) {
  try {
    const [rule] = await db
      .select()
      .from(escalation_rules)
      .where(eq(escalation_rules.id, id))
      .limit(1);

    return rule || null;
  } catch (error) {
    logger.error({ error, id }, 'Error fetching escalation rule');
    throw error;
  }
}

/**
 * Create escalation rule
 */
export async function createEscalationRule(data: EscalationRuleData) {
  try {
    // Verify user exists
    const [user] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.id, data.escalate_to_user_id))
      .limit(1);

    if (!user) {
      throw new Error('User not found');
    }

    const [rule] = await db
      .insert(escalation_rules)
      .values({
        domain_id: data.domain_id,
        scope_id: data.scope_id,
        level: data.level,
        escalate_to_user_id: data.escalate_to_user_id,
        tat_hours: data.tat_hours,
        notify_channel: data.notify_channel,
      })
      .returning();

    logger.info({ id: rule.id }, 'Escalation rule created');
    return rule.id;
  } catch (error) {
    logger.error({ error, data }, 'Error creating escalation rule');
    throw error;
  }
}

/**
 * Update escalation rule
 */
export async function updateEscalationRule(
  id: number,
  data: Partial<EscalationRuleData>
) {
  try {
    const [rule] = await db
      .update(escalation_rules)
      .set({ ...data, updated_at: new Date() })
      .where(eq(escalation_rules.id, id))
      .returning();

    if (!rule) {
      throw new Error('Escalation rule not found');
    }

    logger.info({ id }, 'Escalation rule updated');
    return rule;
  } catch (error) {
    logger.error({ error, id }, 'Error updating escalation rule');
    throw error;
  }
}

/**
 * Delete escalation rule (soft delete)
 */
export async function deleteEscalationRule(id: number) {
  try {
    await db
      .update(escalation_rules)
      .set({ is_active: false, updated_at: new Date() })
      .where(eq(escalation_rules.id, id));

    logger.info({ id }, 'Escalation rule deleted');
  } catch (error) {
    logger.error({ error, id }, 'Error deleting escalation rule');
    throw error;
  }
}

/**
 * Find applicable escalation rules for a ticket
 */
export async function findApplicableEscalations(params: {
  domain_id?: number;
  scope_id?: number;
  hours_elapsed: number;
}) {
  try {
    const rules = await db
      .select()
      .from(escalation_rules)
      .where(
        and(
          eq(escalation_rules.is_active, true),
          params.domain_id 
            ? eq(escalation_rules.domain_id, params.domain_id)
            : isNull(escalation_rules.domain_id),
          params.scope_id
            ? eq(escalation_rules.scope_id, params.scope_id)
            : isNull(escalation_rules.scope_id)
        )
      )
      .orderBy(escalation_rules.level);

    // Find rules that should trigger
    return rules.filter(rule => 
      rule.tat_hours !== null && params.hours_elapsed >= rule.tat_hours
    );
  } catch (error) {
    logger.error({ error }, 'Error finding applicable escalations');
    throw error;
  }
}
