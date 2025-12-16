/**
 * Cached Global Stats
 * 
 * Caches expensive global stats queries to avoid scanning all tickets on every request.
 * 
 * Strategy:
 * - Cache per role + domain combination
 * - TTL: 30-60 seconds (stats don't need to be real-time)
 * - Invalidate on ticket updates via cache tags
 */

import { unstable_cache } from 'next/cache';
import { db, tickets, ticket_statuses } from '@/db';
import { count, eq, sql } from 'drizzle-orm';
import type { DashboardStats } from './types';
import type { RolePolicy } from './types';

/**
 * Get cached global stats for a role
 * 
 * @param userId - User ID
 * @param roleName - Role name (admin, snr-admin, superadmin)
 * @param baseCondition - Base SQL condition from role policy
 * @param cacheKey - Unique cache key (role + domain combination)
 */
export async function getCachedGlobalStats(
  baseCondition: any,
  cacheKey: string
): Promise<DashboardStats['overall']> {
  return unstable_cache(
    async () => {
      const [stats] = await db
        .select({
          total: count(),
          open: sql<number>`COUNT(*) FILTER (WHERE ${ticket_statuses.value} = 'open')`,
          inProgress: sql<number>`COUNT(*) FILTER (WHERE ${ticket_statuses.value} IN ('in_progress', 'escalated'))`,
          awaitingStudent: sql<number>`COUNT(*) FILTER (WHERE ${ticket_statuses.value} = 'awaiting_student_response')`,
          resolved: sql<number>`COUNT(*) FILTER (WHERE ${ticket_statuses.value} IN ('resolved', 'closed'))`,
          escalated: sql<number>`COUNT(*) FILTER (WHERE ${tickets.escalation_level} > 0)`,
          unassigned: sql<number>`COUNT(*) FILTER (WHERE ${tickets.assigned_to} IS NULL)`,
        })
        .from(tickets)
        .leftJoin(ticket_statuses, eq(ticket_statuses.id, tickets.status_id))
        .where(baseCondition);

      return {
        total: Number(stats?.total || 0),
        open: Number(stats?.open || 0),
        inProgress: Number(stats?.inProgress || 0),
        awaitingStudent: Number(stats?.awaitingStudent || 0),
        resolved: Number(stats?.resolved || 0),
        escalated: Number(stats?.escalated || 0),
        unassigned: Number(stats?.unassigned || 0),
      };
    },
    [`dashboard-global-stats-${cacheKey}`],
    {
      revalidate: 30, // 30 seconds - stats don't need to be real-time
      tags: ['tickets', 'dashboard-stats'],
    }
  )();
}

/**
 * Generate cache key for global stats
 * Based on role + domain combination
 */
export function generateStatsCacheKey(
  roleName: string,
  domainId: number | null
): string {
  return `${roleName}-${domainId ?? 'all'}`;
}


