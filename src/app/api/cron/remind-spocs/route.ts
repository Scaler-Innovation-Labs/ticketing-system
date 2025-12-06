/**
 * SPOC Reminders Cron Job
 * 
 * Runs daily to remind SPOCs (admins) of pending tickets
 * 
 * Setup in vercel.json:
 * {
 *   "crons": [{
 *     "path": "/api/cron/remind-spocs",
 *     "schedule": "0 10 * * *"
 *   }]
 * }
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { tickets, users, ticket_statuses } from '@/db';
import { and, ne, eq, isNotNull, count } from 'drizzle-orm';
import { verifyCronAuth } from '@/lib/cron-auth';
import { logger } from '@/lib/logger';

// Force Node.js runtime for integrations
export const runtime = 'nodejs';

const envEnabled = (value: string | undefined) =>
  value === undefined || value !== 'false';

/**
 * GET /api/cron/remind-spocs
 * Send daily summary to SPOCs (admins) about their pending tickets
 */
export async function GET(request: NextRequest) {
  try {
    // Verify cron authentication
    const authError = verifyCronAuth(request);
    if (authError) {
      return authError;
    }

    logger.info('[SPOC Cron] Starting SPOC reminder job');

    const spocEnabled = envEnabled(process.env.ENABLE_SPOC_REMINDERS);
    if (!spocEnabled) {
      logger.info('[SPOC Cron] SPOC reminders disabled in settings');
      return NextResponse.json({ message: 'SPOC reminders disabled' });
    }

    // Skip weekends
    const today = new Date();
    const dayOfWeek = today.getDay();
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      logger.info('[SPOC Cron] Weekend - skipping reminders');
      return NextResponse.json({
        success: true,
        message: 'Weekend - SPOC reminders skipped',
      });
    }

    // Find resolved and closed statuses
    const completedStatuses = await db
      .select({ id: ticket_statuses.id })
      .from(ticket_statuses)
      .where(
        eq(ticket_statuses.value, 'resolved') ||
        eq(ticket_statuses.value, 'closed')
      );

    const completedStatusIds = completedStatuses.map((s) => s.id);

    // Get pending tickets grouped by assignee
    const pendingTicketsByAdmin = await db
      .select({
        assigned_to: tickets.assigned_to,
        admin_email: users.email,
        admin_name: users.full_name,
        ticket_count: count(tickets.id),
      })
      .from(tickets)
      .leftJoin(users, eq(tickets.assigned_to, users.id))
      .where(
        and(
          isNotNull(tickets.assigned_to),
          completedStatusIds.length > 0
            ? ne(tickets.status_id, completedStatusIds[0])
            : undefined
        )
      )
      .groupBy(tickets.assigned_to, users.email, users.full_name);

    logger.info(
      { count: pendingTicketsByAdmin.length },
      '[SPOC Cron] Found admins with pending tickets'
    );

    // TODO: Send email/Slack notifications
    // For now, just log the summaries
    for (const admin of pendingTicketsByAdmin) {
      logger.info(
        {
          adminId: admin.assigned_to,
          email: admin.admin_email,
          pendingCount: admin.ticket_count,
        },
        '[SPOC Cron] Would send reminder to SPOC'
      );
    }

    return NextResponse.json({
      success: true,
      message: `Processed ${pendingTicketsByAdmin.length} admins`,
      count: pendingTicketsByAdmin.length,
    });
  } catch (error: any) {
    logger.error({ error: error.message }, '[SPOC Cron] Job failed');
    return NextResponse.json(
      { error: 'SPOC reminder job failed' },
      { status: 500 }
    );
  }
}
