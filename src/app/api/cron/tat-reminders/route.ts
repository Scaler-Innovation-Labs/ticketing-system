/**
 * TAT Reminders Cron Job
 * 
 * Runs daily to remind admins of tickets due today
 * 
 * Setup in vercel.json:
 * {
 *   "crons": [{
 *     "path": "/api/cron/tat-reminders",
 *     "schedule": "0 9 * * *"
 *   }]
 * }
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { tickets, users, ticket_statuses } from '@/db';
import { and, gte, lt, ne, eq } from 'drizzle-orm';
import { verifyCronAuth } from '@/lib/cron-auth';
import { logger } from '@/lib/logger';

// Force Node.js runtime for integrations
export const runtime = 'nodejs';

const envEnabled = (value: string | undefined) =>
  value === undefined || value !== 'false';

/**
 * GET /api/cron/tat-reminders
 * Send reminders for tickets due today
 */
export async function GET(request: NextRequest) {
  try {
    // Verify cron authentication
    const authError = verifyCronAuth(request);
    if (authError) {
      return authError;
    }

    logger.info('[TAT Cron] Starting TAT reminder job');

    const tatEnabled = envEnabled(process.env.ENABLE_TAT_REMINDERS);
    if (!tatEnabled) {
      logger.info('[TAT Cron] TAT reminders disabled in settings');
      return NextResponse.json({ message: 'TAT reminders disabled' });
    }

    // Get today's date range
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // Skip weekends
    const dayOfWeek = today.getDay();
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      logger.info('[TAT Cron] Weekend - skipping reminders');
      return NextResponse.json({
        success: true,
        message: 'Weekend - TAT reminders skipped',
      });
    }

    // Find resolved status
    const [resolvedStatus] = await db
      .select({ id: ticket_statuses.id })
      .from(ticket_statuses)
      .where(eq(ticket_statuses.value, 'resolved'))
      .limit(1);

    // Get tickets due today that are not resolved
    const whereConditions = [
      gte(tickets.resolution_due_at, today),
      lt(tickets.resolution_due_at, tomorrow),
    ];
    if (resolvedStatus) {
      whereConditions.push(ne(tickets.status_id, resolvedStatus.id));
    }

    const dueTickets = await db
      .select({
        id: tickets.id,
        description: tickets.description,
        assigned_to: tickets.assigned_to,
        resolution_due_at: tickets.resolution_due_at,
        status_id: tickets.status_id,
        assigned_user_email: users.email,
        assigned_user_name: users.full_name,
      })
      .from(tickets)
      .leftJoin(users, eq(tickets.assigned_to, users.id))
      .where(and(...whereConditions));

    logger.info(
      { count: dueTickets.length },
      '[TAT Cron] Found tickets due today'
    );

    // TODO: Send email/Slack notifications
    // For now, just log the tickets
    for (const ticket of dueTickets) {
      logger.info(
        {
          ticketId: ticket.id,
          assignedTo: ticket.assigned_to,
          email: ticket.assigned_user_email,
        },
        '[TAT Cron] Would send reminder for ticket'
      );
    }

    return NextResponse.json({
      success: true,
      message: `Processed ${dueTickets.length} tickets`,
      count: dueTickets.length,
    });
  } catch (error: any) {
    logger.error({ error: error.message }, '[TAT Cron] Job failed');
    return NextResponse.json(
      { error: 'TAT reminder job failed' },
      { status: 500 }
    );
  }
}
