import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth/helpers';
import { db } from '@/db';
import { tickets, ticket_statuses, categories } from '@/db/schema-tickets';
import { users } from '@/db';
import { eq, and, gte, desc, sql, aliasedTable } from 'drizzle-orm';

/**
 * GET /api/analytics/tickets
 * Advanced analytics for tickets (trends, performance, SLA compliance)
 */
export async function GET(request: Request) {
  try {
    await requireRole(['super_admin', 'admin']);
    
    const { searchParams } = new URL(request.url);
    const days = parseInt(searchParams.get('days') || '30');
    
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    
    // Tickets created over time
    const ticketTrend = await db
      .select({
        date: sql<string>`DATE(${tickets.created_at})`,
        count: sql<number>`count(*)::int`,
      })
      .from(tickets)
      .where(gte(tickets.created_at, startDate))
      .groupBy(sql`DATE(${tickets.created_at})`)
      .orderBy(sql`DATE(${tickets.created_at})`);
    
    // Resolution time average by category
    const resolutionByCategory = await db
      .select({
        category_id: tickets.category_id,
        category_name: categories.name,
        avg_resolution_hours: sql<number>`
          AVG(EXTRACT(EPOCH FROM (${tickets.updated_at} - ${tickets.created_at})) / 3600)::numeric(10,2)
        `,
        count: sql<number>`count(*)::int`,
      })
      .from(tickets)
      .leftJoin(categories, eq(tickets.category_id, categories.id))
      .where(
        and(
          gte(tickets.created_at, startDate),
          sql`${tickets.status_id} IN (SELECT id FROM ${ticket_statuses} WHERE ${ticket_statuses.label} LIKE '%Resolved%' OR ${ticket_statuses.label} LIKE '%Closed%')`
        )
      )
      .groupBy(tickets.category_id, categories.name);
    
    // Top performers (users with most resolved tickets)
    const assignedUser = aliasedTable(users, 'assigned_user');
    const topPerformers = await db
      .select({
        user_id: tickets.assigned_to,
        user_name: assignedUser.full_name,
        resolved_count: sql<number>`count(*)::int`,
      })
      .from(tickets)
      .leftJoin(assignedUser, eq(tickets.assigned_to, assignedUser.id))
      .where(
        and(
          gte(tickets.created_at, startDate),
          sql`${tickets.status_id} IN (SELECT id FROM ${ticket_statuses} WHERE ${ticket_statuses.label} LIKE '%Resolved%' OR ${ticket_statuses.label} LIKE '%Closed%')`
        )
      )
      .groupBy(tickets.assigned_to, assignedUser.full_name)
      .orderBy(desc(sql`count(*)`))
      .limit(10);
    
    // SLA compliance rate
    const [slaCompliance] = await db
      .select({
        total: sql<number>`count(*)::int`,
        on_time: sql<number>`count(CASE WHEN ${tickets.updated_at} <= ${tickets.resolution_due_at} THEN 1 END)::int`,
        compliance_rate: sql<number>`
          (count(CASE WHEN ${tickets.updated_at} <= ${tickets.resolution_due_at} THEN 1 END)::float / 
          NULLIF(count(*)::float, 0) * 100)::numeric(5,2)
        `,
      })
      .from(tickets)
      .where(
        and(
          gte(tickets.created_at, startDate),
          sql`${tickets.resolution_due_at} IS NOT NULL`
        )
      );
    
    return NextResponse.json({
      period_days: days,
      ticket_trend: ticketTrend,
      resolution_by_category: resolutionByCategory,
      top_performers: topPerformers,
      sla_compliance: slaCompliance,
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes('Unauthorized')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
