/**
 * Ticket Metrics API
 * 
 * GET - Get dashboard metrics for admins
 */

import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth/helpers';
import { db } from '@/db';
import { tickets, categories, ticket_statuses } from '@/db';
import { eq, sql, gte, and, inArray } from 'drizzle-orm';
import { logger } from '@/lib/logger';

/**
 * GET /api/tickets/metrics
 * Get ticket metrics for dashboard
 */
export async function GET() {
  try {
    await requireRole(['admin', 'super_admin']);

    // Total tickets
    const [{ total }] = await db
      .select({ total: sql<number>`COUNT(*)` })
      .from(tickets);

    // Counts by status
    const statusCountsQuery = await db
      .select({
        status: ticket_statuses.value,
        count: sql<number>`COUNT(*)`,
      })
      .from(tickets)
      .leftJoin(ticket_statuses, eq(tickets.status_id, ticket_statuses.id))
      .groupBy(ticket_statuses.value);

    const statusCounts = Object.fromEntries(
      statusCountsQuery
        .filter((row) => row.status)
        .map((row) => [row.status!, Number(row.count)])
    );

    // Counts by category
    const categoryRows = await db
      .select({
        category_id: tickets.category_id,
        count: sql<number>`COUNT(*)`,
        name: categories.name,
      })
      .from(tickets)
      .leftJoin(categories, eq(tickets.category_id, categories.id))
      .groupBy(tickets.category_id, categories.name);

    const categoryBreakdown = categoryRows.map((row) => ({
      category_id: row.category_id,
      category_name: row.name,
      count: Number(row.count),
    }));

    // Today's stats
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [{ createdToday }] = await db
      .select({ createdToday: sql<number>`COUNT(*)` })
      .from(tickets)
      .where(gte(tickets.created_at, today));

    // Get resolved status ID
    const [resolvedStatus] = await db
      .select({ id: ticket_statuses.id })
      .from(ticket_statuses)
      .where(eq(ticket_statuses.value, 'resolved'))
      .limit(1);

    let resolvedToday = 0;
    if (resolvedStatus) {
      const [result] = await db
        .select({ resolvedToday: sql<number>`COUNT(*)` })
        .from(tickets)
        .where(
          and(
            eq(tickets.status_id, resolvedStatus.id),
            gte(tickets.updated_at, today)
          )
        );
      resolvedToday = Number(result.resolvedToday);
    }

    // Overdue tickets (resolution_due_at < now and not resolved)
    const now = new Date();
    let overdueCount = 0;
    if (resolvedStatus) {
      const [result] = await db
        .select({ overdue: sql<number>`COUNT(*)` })
        .from(tickets)
        .where(
          and(
            sql`${tickets.resolution_due_at} < ${now}`,
            sql`${tickets.status_id} != ${resolvedStatus.id}`
          )
        );
      overdueCount = Number(result.overdue);
    }

    // Reopened tickets
    const [{ reopened }] = await db
      .select({ reopened: sql<number>`COUNT(*)` })
      .from(tickets)
      .where(sql`${tickets.reopen_count} > 0`);

    return NextResponse.json({
      total: Number(total),
      statusCounts,
      categoryBreakdown,
      today: {
        created: Number(createdToday),
        resolved: resolvedToday,
      },
      overdue: overdueCount,
      reopened: Number(reopened),
    });
  } catch (error: any) {
    logger.error({ error: error.message }, 'Failed to fetch metrics');
    return NextResponse.json(
      { error: error.message || 'Failed to fetch metrics' },
      { status: error.status || 500 }
    );
  }
}
