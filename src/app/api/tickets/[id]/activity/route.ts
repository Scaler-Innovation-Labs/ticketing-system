/**
 * Ticket Activity/Timeline API
 * 
 * GET - Get activity timeline for a ticket
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/helpers';
import { db } from '@/db';
import { ticket_activity, users, tickets } from '@/db';
import { eq, desc } from 'drizzle-orm';
import { logger } from '@/lib/logger';
import { USER_ROLES } from '@/conf/constants';
import { Errors } from '@/lib/errors';

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

    // Check ticket ownership for students
    if (role === USER_ROLES.STUDENT) {
      const [ticket] = await db
        .select({ created_by: tickets.created_by })
        .from(tickets)
        .where(eq(tickets.id, ticketId))
        .limit(1);

      if (!ticket) {
        return NextResponse.json(
          { error: 'Ticket not found' },
          { status: 404 }
        );
      }

      if (ticket.created_by !== dbUser.id) {
        throw Errors.forbidden('You can only view activity for your own tickets');
      }
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
    logger.error({ error: error.message || error }, 'Failed to get ticket activity');
    const status = error?.statusCode || error?.status || 500;
    const message = error?.message || 'Failed to get ticket activity';
    return NextResponse.json(
      { error: message },
      { status }
    );
  }
}
