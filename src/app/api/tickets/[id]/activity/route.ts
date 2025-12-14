/**
 * Ticket Activity/Timeline API
 * 
 * GET - Get activity timeline for a ticket
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/helpers';
import { db } from '@/db';
import { ticket_activity, users, tickets } from '@/db';
import { eq, desc, and, or } from 'drizzle-orm';
import { logger } from '@/lib/logger';
import { USER_ROLES } from '@/conf/constants';
import { Errors } from '@/lib/errors';
import { unstable_cache } from 'next/cache';
import { cache } from 'react';

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

    // OPTIMIZATION: Parse pagination params
    const searchParams = request.nextUrl.searchParams;
    const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10), 100); // Max 100, default 50
    const offset = parseInt(searchParams.get('offset') || '0', 10);

    // OPTIMIZATION: Check ticket ownership early (cached)
    const getTicketOwnership = cache(async (ticketId: number) => {
      if (role === USER_ROLES.STUDENT) {
        const [ticket] = await db
          .select({ created_by: tickets.created_by })
          .from(tickets)
          .where(eq(tickets.id, ticketId))
          .limit(1);

        if (!ticket) {
          return { found: false, owned: false };
        }

        return { found: true, owned: ticket.created_by === dbUser.id };
      }
      return { found: true, owned: true }; // Admins can always access
    });

    const ownership = await getTicketOwnership(ticketId);
    
    if (!ownership.found) {
      return NextResponse.json(
        { error: 'Ticket not found' },
        { status: 404 }
      );
    }

    if (!ownership.owned) {
      throw Errors.forbidden('You can only view activity for your own tickets');
    }

    // OPTIMIZATION: Cached activity query with pagination
    const getActivitiesCached = cache(async () => {
      const whereConditions = role === USER_ROLES.STUDENT
        ? and(
            eq(ticket_activity.ticket_id, ticketId),
            or(
              eq(ticket_activity.visibility, 'public'),
              eq(ticket_activity.visibility, 'student_visible')
            )
          )
        : eq(ticket_activity.ticket_id, ticketId);

      return db
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
        .where(whereConditions)
        .orderBy(desc(ticket_activity.created_at))
        .limit(limit)
        .offset(offset);
    });

    const activities = await unstable_cache(
      async () => getActivitiesCached(),
      [`ticket-activity-${ticketId}-${role}-${limit}-${offset}`],
      {
        revalidate: 5, // 5 seconds
        tags: [`ticket-${ticketId}`, `ticket-activity-${ticketId}`],
      }
    )();

    return NextResponse.json({ 
      activities,
      pagination: {
        limit,
        offset,
        hasMore: activities.length === limit, // Indicates more items available
      }
    });
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
