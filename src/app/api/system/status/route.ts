import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth/helpers';
import { db } from '@/db';
import { tickets, categories, ticket_statuses } from '@/db/schema-tickets';
import { students, users } from '@/db';
import { sql } from 'drizzle-orm';

/**
 * GET /api/system/status
 * System health and statistics (super_admin only)
 */
export async function GET() {
  try {
    await requireRole(['super_admin']);
    
    // Database connectivity check
    const dbCheck = await db.execute(sql`SELECT 1 as healthy`);
    
    // Get counts
    const [ticketCount] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(tickets);
    
    const [userCount] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(users);
    
    const [studentCount] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(students);
    
    const [categoryCount] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(categories);
    
    const [statusCount] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(ticket_statuses);
    
    // Get open tickets
    const [openTickets] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(tickets)
      .where(
        sql`${tickets.status_id} NOT IN (SELECT id FROM ${ticket_statuses} WHERE ${ticket_statuses.label} LIKE '%Resolved%' OR ${ticket_statuses.label} LIKE '%Closed%')`
      );
    
    return NextResponse.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      database: {
        connected: true,
        responsive: !!dbCheck,
      },
      statistics: {
        total_tickets: ticketCount.count,
        open_tickets: openTickets.count,
        total_users: userCount.count,
        total_students: studentCount.count,
        total_categories: categoryCount.count,
        total_statuses: statusCount.count,
      },
      version: '1.0.0',
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes('Unauthorized')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }
    return NextResponse.json(
      {
        status: 'unhealthy',
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
