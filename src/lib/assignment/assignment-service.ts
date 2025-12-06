/**
 * Assignment Service
 * 
 * Handles admin assignment rules and auto-assignment logic
 * Separate from ticket service to maintain modularity
 */

import { db } from '@/db';
import { admin_assignments, domains, scopes, users } from '@/db';
import { eq, and, desc, sql } from 'drizzle-orm';
import { logger } from '@/lib/logger';

export interface AssignmentRule {
  user_id: string;
  domain_id: number;
  scope_id: number | null;
}

/**
 * Get all assignment rules
 */
export async function getAssignmentRules() {
  try {
    const rules = await db
      .select({
        id: admin_assignments.id,
        user_id: admin_assignments.user_id,
        admin_name: users.full_name,
        admin_email: users.email,
        domain_id: admin_assignments.domain_id,
        domain_name: domains.name,
        scope_id: admin_assignments.scope_id,
        scope_name: scopes.name,
        created_at: admin_assignments.created_at,
      })
      .from(admin_assignments)
      .innerJoin(users, eq(admin_assignments.user_id, users.id))
      .leftJoin(domains, eq(admin_assignments.domain_id, domains.id))
      .leftJoin(scopes, eq(admin_assignments.scope_id, scopes.id))
      .orderBy(desc(admin_assignments.created_at));

    return rules;
  } catch (error) {
    logger.error({ error }, 'Error fetching assignment rules');
    throw error;
  }
}

/**
 * Create a new assignment rule
 */
export async function createAssignmentRule(data: AssignmentRule) {
  try {
    // Verify user exists and is admin
    const [user] = await db
      .select({ id: users.id, role_id: users.role_id })
      .from(users)
      .where(eq(users.id, data.user_id))
      .limit(1);

    if (!user) {
      throw new Error('User not found');
    }

    // Verify domain exists if specified
    if (data.domain_id) {
      const [domain] = await db
        .select({ id: domains.id })
        .from(domains)
        .where(eq(domains.id, data.domain_id))
        .limit(1);

      if (!domain) {
        throw new Error('Domain not found');
      }
    }

    // Verify scope exists if specified
    if (data.scope_id) {
      const [scope] = await db
        .select({ id: scopes.id })
        .from(scopes)
        .where(eq(scopes.id, data.scope_id))
        .limit(1);

      if (!scope) {
        throw new Error('Scope not found');
      }
    }

    const [rule] = await db
      .insert(admin_assignments)
      .values({
        user_id: data.user_id,
        domain_id: data.domain_id,
        scope_id: data.scope_id,
      })
      .returning();

    logger.info({ id: rule.id, user_id: data.user_id }, 'Assignment rule created');
    return rule.id;
  } catch (error) {
    logger.error({ error, data }, 'Error creating assignment rule');
    throw error;
  }
}

/**
 * Delete an assignment rule
 */
export async function deleteAssignmentRule(id: number) {
  try {
    await db
      .delete(admin_assignments)
      .where(eq(admin_assignments.id, id));

    logger.info({ id }, 'Assignment rule deleted');
  } catch (error) {
    logger.error({ error, id }, 'Error deleting assignment rule');
    throw error;
  }
}

/**
 * Find best assignee for a ticket
 * Based on domain and scope matching
 */
export async function findBestAssignee(params: {
  domain_id?: number;
  scope_id?: number;
}): Promise<string | null> {
  try {
    // Priority 1: Exact match (domain + scope)
    if (params.domain_id && params.scope_id) {
      const [exactMatch] = await db
        .select({ user_id: admin_assignments.user_id })
        .from(admin_assignments)
        .where(
          and(
            eq(admin_assignments.domain_id, params.domain_id),
            eq(admin_assignments.scope_id, params.scope_id)
          )
        )
        .limit(1);

      if (exactMatch) return exactMatch.user_id;
    }

    // Priority 2: Domain match with null scope (catch-all for domain)
    if (params.domain_id) {
      const [domainMatch] = await db
        .select({ user_id: admin_assignments.user_id })
        .from(admin_assignments)
        .where(
          and(
            eq(admin_assignments.domain_id, params.domain_id),
            sql`${admin_assignments.scope_id} IS NULL`
          )
        )
        .limit(1);

      if (domainMatch) return domainMatch.user_id;
    }

    // Priority 3: Catch-all admin (null domain and scope)
    const [catchAll] = await db
      .select({ user_id: admin_assignments.user_id })
      .from(admin_assignments)
      .where(
        and(
          sql`${admin_assignments.domain_id} IS NULL`,
          sql`${admin_assignments.scope_id} IS NULL`
        )
      )
      .limit(1);

    return catchAll?.user_id || null;
  } catch (error) {
    logger.error({ error, params }, 'Error finding best assignee');
    return null;
  }
}
