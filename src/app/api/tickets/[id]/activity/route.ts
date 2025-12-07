/**
 * Ticket Activity/Timeline API
 * 
 * GET - Get activity timeline for a ticket
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/helpers';
import { db } from '@/db';
import { ticket_activity, users } from '@/db';
import { eq, desc } from 'drizzle-orm';
import { logger } from '@/lib/logger';

/**
 * GET /api/tickets/[id]/activity
 * Get activity timeline for a ticket
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { dbUser, role } = await getCurrentUser();

    const { id } = await params;
    const ticketId = parseInt(id, 10);

    if (isNaN(ticketId)) {
      return NextResponse.json(
        { error: 'Invalid ticket ID' },
        { status: 400 }
      );
    }

    // Get all activity with user details
    const activities = await db
      .select({
        id: ticket_activity.id,
        ticket_id: ticket_activity.ticket_id,
        user_id: ticket_activity.user_id,
        action: ticket_activity.action,
        details: ticket_activity.details,
        visibility: ticket_activity.visibility,
        created_at: ticket_activity.created_at,
        user_name: users.full_name,
        user_email: users.email,
      })
      .from(ticket_activity)
      .leftJoin(users, eq(ticket_activity.user_id, users.id))
      .where(eq(ticket_activity.ticket_id, ticketId))
      .orderBy(desc(ticket_activity.created_at));

    // Filter based on user role - students see public and student_visible items
    const filteredActivities =
      role === 'student'
        ? activities.filter((a) => a.visibility === 'public' || a.visibility === 'student_visible')
        : activities;

    return NextResponse.json({ activities: filteredActivities });
  } catch (error: any) {
    logger.error({ error: error.message }, 'Failed to get ticket activity');
    return NextResponse.json(
      { error: error.message || 'Failed to get ticket activity' },
      { status: error.status || 500 }
    );
  }
}
