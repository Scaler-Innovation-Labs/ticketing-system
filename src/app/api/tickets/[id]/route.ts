/**
 * Single Ticket API
 * 
 * GET /api/tickets/[id]
 * Get ticket details by ID
 */

import { NextRequest } from 'next/server';
import { requireDbUser, ApiResponse } from '@/lib/auth/helpers';
import { handleApiError, Errors } from '@/lib/errors';
import { getTicketById, getTicketActivity } from '@/lib/ticket/ticket-service';
import { updateTicketStatus, assignTicket, forwardTicket } from '@/lib/ticket/ticket-status-service';
import { updateTicketDescription, updateTicketTitle } from '@/lib/ticket/ticket-comment-service';
import { logger } from '@/lib/logger';
import { getUserRole } from '@/lib/auth/roles';
import { USER_ROLES } from '@/conf/constants';
import { unstable_cache } from 'next/cache';
import { cache } from 'react';
import { revalidateTag } from 'next/cache';

export const dynamic = 'force-dynamic';

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/tickets/[id]
 * Get ticket details with activity history
 */
export async function GET(
  req: NextRequest,
  context: RouteContext
) {
  try {
    // 1. Authenticate user
    const { dbUser } = await requireDbUser();
    const role = await getUserRole(dbUser.id);

    // 2. Get ticket ID from params
    const { id } = await context.params;
    const ticketId = parseInt(id, 10);

    if (isNaN(ticketId)) {
      throw Errors.validation('Invalid ticket ID');
    }

    // OPTIMIZATION: Cache ticket lookup with ownership check
    const getTicketCached = cache(async () => {
      const ticket = await getTicketById(ticketId);
      
      // Check access permissions early
      if (role === USER_ROLES.STUDENT && ticket.ticket.created_by !== dbUser.id) {
        throw Errors.forbidden('You can only view your own tickets');
      }
      
      return ticket;
    });

    // OPTIMIZATION: Use unstable_cache for cross-request caching
    const ticket = await unstable_cache(
      async () => getTicketCached(),
      [`ticket-${ticketId}-${role}-${dbUser.id}`],
      {
        revalidate: 5, // 5 seconds
        tags: [`ticket-${ticketId}`, `user-${dbUser.id}`],
      }
    )();

    // OPTIMIZATION: Get activity with pagination (limit to recent 50)
    const activity = await getTicketActivity(ticketId);

    // OPTIMIZATION: Return minimal payload - activity can be fetched separately via /activity endpoint
    return ApiResponse.success({
      ticket,
      // Only include recent activity (last 20) to reduce payload
      activity: activity.slice(0, 20),
    });
  } catch (error) {
    logger.error({ error }, 'Failed to get ticket');
    return handleApiError(error);
  }
}

/**
 * PATCH /api/tickets/[id]
 * Update ticket (status, assignment, title, description)
 */
export async function PATCH(
  req: NextRequest,
  context: RouteContext
) {
  try {
    const { dbUser } = await requireDbUser();
    const role = await getUserRole(dbUser.id);

    const { id } = await context.params;
    const ticketId = parseInt(id, 10);

    if (isNaN(ticketId)) {
      throw Errors.validation('Invalid ticket ID');
    }

    const body = await req.json();
    const { status, assigned_to, title, description, action } = body;

    // Handle different update actions
    if (status) {
      // Only admins can change status
      if (role === USER_ROLES.STUDENT) {
        throw Errors.forbidden('Students cannot change ticket status');
      }

      // OPTIMIZATION: Fetch ticket to get created_by for cache invalidation
      const ticket = await getTicketById(ticketId);
      const createdBy = ticket.ticket.created_by;

      await updateTicketStatus(ticketId, status, dbUser.id, body.comment);
      
      // OPTIMIZATION: Revalidate cache tags on mutation
      // Note: revalidateTag requires a profile argument in Next.js 16
      revalidateTag(`ticket-${ticketId}`, 'default');
      if (createdBy) {
        revalidateTag(`student-tickets:${createdBy}`, 'default');
        revalidateTag(`student-stats:${createdBy}`, 'default');
      }
      
      return ApiResponse.success({
        message: 'Ticket status updated',
        status,
      });
    }

    if (assigned_to) {
      // Only admins can assign tickets
      if (role === USER_ROLES.STUDENT) {
        throw Errors.forbidden('Students cannot assign tickets');
      }

      if (action === 'forward') {
        await forwardTicket(ticketId, assigned_to, dbUser.id, body.reason);
        return ApiResponse.success({ message: 'Ticket forwarded' });
      } else {
        await assignTicket(ticketId, assigned_to, dbUser.id);
        return ApiResponse.success({ message: 'Ticket assigned' });
      }
    }

    if (title) {
      // Students can only update their own tickets
      if (role === USER_ROLES.STUDENT) {
        const { db: dbInstance, tickets: ticketsTable } = await import('@/db');
        const { eq } = await import('drizzle-orm');
        
        const [ticket] = await dbInstance
          .select({ created_by: ticketsTable.created_by })
          .from(ticketsTable)
          .where(eq(ticketsTable.id, ticketId))
          .limit(1);

        if (!ticket) {
          throw Errors.notFound('Ticket', String(ticketId));
        }

        if (ticket.created_by !== dbUser.id) {
          throw Errors.forbidden('You can only update your own tickets');
        }
      }

      await updateTicketTitle(ticketId, dbUser.id, title);
      return ApiResponse.success({ message: 'Ticket title updated' });
    }

    if (description) {
      // Students can only update their own tickets
      if (role === USER_ROLES.STUDENT) {
        const { db: dbInstance, tickets: ticketsTable } = await import('@/db');
        const { eq } = await import('drizzle-orm');
        
        const [ticket] = await dbInstance
          .select({ created_by: ticketsTable.created_by })
          .from(ticketsTable)
          .where(eq(ticketsTable.id, ticketId))
          .limit(1);

        if (!ticket) {
          throw Errors.notFound('Ticket', String(ticketId));
        }

        if (ticket.created_by !== dbUser.id) {
          throw Errors.forbidden('You can only update your own tickets');
        }
      }

      await updateTicketDescription(ticketId, dbUser.id, description);
      return ApiResponse.success({ message: 'Ticket description updated' });
    }

    throw Errors.validation('No valid update action provided');
  } catch (error) {
    logger.error({ error }, 'Failed to update ticket');
    return handleApiError(error);
  }
}
