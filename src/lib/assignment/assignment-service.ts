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
  scope_id: number;
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

    // Require both domain and scope
    if (!data.domain_id) {
      throw new Error('Domain is required for admin assignment');
    }
    if (!data.scope_id) {
      throw new Error('Scope is required for admin assignment');
    }

    // Verify domain exists
    const [domain] = await db
      .select({ id: domains.id })
      .from(domains)
      .where(eq(domains.id, data.domain_id))
      .limit(1);

    if (!domain) {
      throw new Error('Domain not found');
    }

    // Verify scope exists
    const [scope] = await db
      .select({ id: scopes.id })
      .from(scopes)
      .where(eq(scopes.id, data.scope_id))
      .limit(1);

    if (!scope) {
      throw new Error('Scope not found');
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
    // Both domain and scope must be present to match an assignment
    if (!params.domain_id || !params.scope_id) {
      return null;
    }

    // Only return assignments that match both domain and scope (no fallbacks)
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

    return exactMatch?.user_id || null;
  } catch (error) {
    logger.error({ error, params }, 'Error finding best assignee');
    return null;
  }
}

/**
 * Check if a specific user has an admin assignment matching the given domain and scope
 */
export async function hasMatchingAssignment(params: {
  user_id: string;
  domain_id?: number;
  scope_id?: number;
}): Promise<boolean> {
  try {
    // Both domain and scope must be present to match an assignment
    if (!params.domain_id || !params.scope_id) {
      return false;
    }

    const [match] = await db
      .select({ id: admin_assignments.id })
      .from(admin_assignments)
      .where(
        and(
          eq(admin_assignments.user_id, params.user_id),
          eq(admin_assignments.domain_id, params.domain_id),
          eq(admin_assignments.scope_id, params.scope_id)
        )
      )
      .limit(1);

    return !!match;
  } catch (error) {
    logger.error({ error, params }, 'Error checking matching assignment');
    return false;
  }
}
