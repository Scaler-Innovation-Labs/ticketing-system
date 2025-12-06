/**
 * Ticket Reminders API
 * 
 * GET - Get reminder list for tickets (upcoming due dates, etc.)
 */

import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth/helpers';
import { db } from '@/db';
import { tickets, ticket_statuses } from '@/db';
import { eq, gte, lt, and, ne, or } from 'drizzle-orm';
import { logger } from '@/lib/logger';

/**
 * GET /api/tickets/reminders
 * Get tickets requiring attention (due soon, overdue)
 */
export async function GET() {
  try {
    const { dbUser, role } = await requireRole(['admin', 'super_admin']);

    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const nextWeek = new Date(now);
    nextWeek.setDate(nextWeek.getDate() + 7);

    // Get resolved/closed status IDs
    const completedStatuses = await db
      .select({ id: ticket_statuses.id })
      .from(ticket_statuses)
      .where(
        or(
          eq(ticket_statuses.value, 'resolved'),
          eq(ticket_statuses.value, 'closed')
        )
      );

    const completedStatusIds = completedStatuses.map((s) => s.id);

    // Build filter based on role
    const roleFilter =
      role === 'admin'
        ? eq(tickets.assigned_to, dbUser.id)
        : undefined;

    // Overdue tickets
    const overdueTickets = await db
      .select({
        id: tickets.id,
        ticket_number: tickets.ticket_number,
        title: tickets.title,
        resolution_due_at: tickets.resolution_due_at,
        status_id: tickets.status_id,
      })
      .from(tickets)
      .where(
        and(
          roleFilter,
          lt(tickets.resolution_due_at, now),
          completedStatusIds.length > 0
            ? ne(tickets.status_id, completedStatusIds[0])
            : undefined
        )
      )
      .limit(50);

    const overdueWithType = overdueTickets.map(t => ({ ...t, type: 'overdue' as const }));

    // Due today
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const endOfToday = new Date(today);
    endOfToday.setDate(endOfToday.getDate() + 1);

    const dueTodayTickets = await db
      .select({
        id: tickets.id,
        ticket_number: tickets.ticket_number,
        title: tickets.title,
        resolution_due_at: tickets.resolution_due_at,
        status_id: tickets.status_id,
      })
      .from(tickets)
      .where(
        and(
          roleFilter,
          gte(tickets.resolution_due_at, today),
          lt(tickets.resolution_due_at, endOfToday),
          completedStatusIds.length > 0
            ? ne(tickets.status_id, completedStatusIds[0])
            : undefined
        )
      )
      .limit(50);

    const dueTodayWithType = dueTodayTickets.map(t => ({ ...t, type: 'due_today' as const }));

    // Due this week
    const dueThisWeekTickets = await db
      .select({
        id: tickets.id,
        ticket_number: tickets.ticket_number,
        title: tickets.title,
        resolution_due_at: tickets.resolution_due_at,
        status_id: tickets.status_id,
      })
      .from(tickets)
      .where(
        and(
          roleFilter,
          gte(tickets.resolution_due_at, endOfToday),
          lt(tickets.resolution_due_at, nextWeek),
          completedStatusIds.length > 0
            ? ne(tickets.status_id, completedStatusIds[0])
            : undefined
        )
      )
      .limit(50);

    const dueThisWeekWithType = dueThisWeekTickets.map(t => ({ ...t, type: 'due_this_week' as const }));

    return NextResponse.json({
      overdue: overdueWithType,
      dueToday: dueTodayWithType,
      dueThisWeek: dueThisWeekWithType,
      counts: {
        overdue: overdueTickets.length,
        dueToday: dueTodayTickets.length,
        dueThisWeek: dueThisWeekTickets.length,
      },
    });
  } catch (error: any) {
    logger.error({ error: error.message }, 'Failed to fetch reminders');
    return NextResponse.json(
      { error: error.message || 'Failed to fetch reminders' },
      { status: error.status || 500 }
    );
  }
}
