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

    // 3. Get ticket
    const ticket = await getTicketById(ticketId);

    // 4. Check access permissions
    // Students can only view their own tickets
    if (role === USER_ROLES.STUDENT && ticket.ticket.created_by !== dbUser.id) {
      throw Errors.forbidden('You can only view your own tickets');
    }

    // 5. Get activity history
    const activity = await getTicketActivity(ticketId);

    // 6. Return ticket with activity
    return ApiResponse.success({
      ticket,
      activity,
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

      await updateTicketStatus(ticketId, status, dbUser.id, body.comment);
      
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
