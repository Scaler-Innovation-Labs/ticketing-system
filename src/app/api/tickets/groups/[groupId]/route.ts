/**
 * Ticket Group Details API
 * 
 * GET /api/tickets/groups/[groupId] - Get group details with tickets
 * DELETE /api/tickets/groups/[groupId] - Delete group
 * POST /api/tickets/groups/[groupId] - Add tickets to group
 */

import { NextRequest } from 'next/server';
import { requireDbUser, ApiResponse } from '@/lib/auth/helpers';
import { handleApiError, Errors } from '@/lib/errors';
import {
  getTicketGroup,
  getGroupTickets,
  deleteTicketGroup,
  addTicketsToGroup,
} from '@/lib/ticket/ticket-groups-service';
import { logger } from '@/lib/logger';
import { z } from 'zod';

type RouteContext = {
  params: Promise<{ groupId: string }>;
};

const AddTicketsSchema = z.object({
  ticketIds: z.array(z.number().int().positive()).min(1),
});

export async function GET(req: NextRequest, context: RouteContext) {
  try {
    await requireDbUser();

    const { groupId } = await context.params;
    const id = parseInt(groupId, 10);

    if (isNaN(id)) {
      throw Errors.validation('Invalid group ID');
    }

    const group = await getTicketGroup(id);
    const tickets = await getGroupTickets(id);

    return ApiResponse.success({
      group,
      tickets,
      ticket_count: tickets.length,
    });
  } catch (error) {
    logger.error({ error }, 'Failed to get ticket group');
    return handleApiError(error);
  }
}

export async function POST(req: NextRequest, context: RouteContext) {
  try {
    const { dbUser } = await requireDbUser();

    const { groupId } = await context.params;
    const id = parseInt(groupId, 10);

    if (isNaN(id)) {
      throw Errors.validation('Invalid group ID');
    }

    const body = await req.json();
    const validation = AddTicketsSchema.safeParse(body);

    if (!validation.success) {
      throw Errors.validation(
        'Invalid ticket IDs',
        validation.error.issues.map((e) => e.message)
      );
    }

    const { ticketIds } = validation.data;

    await addTicketsToGroup(id, ticketIds, dbUser.id);

    logger.info(
      {
        groupId: id,
        ticketIds,
        userId: dbUser.id,
      },
      'Tickets added to group via API'
    );

    return ApiResponse.success({
      message: `${ticketIds.length} ticket(s) added to group`,
    });
  } catch (error) {
    logger.error({ error }, 'Failed to add tickets to group');
    return handleApiError(error);
  }
}

export async function DELETE(req: NextRequest, context: RouteContext) {
  try {
    const { dbUser } = await requireDbUser();

    const { groupId } = await context.params;
    const id = parseInt(groupId, 10);

    if (isNaN(id)) {
      throw Errors.validation('Invalid group ID');
    }

    await deleteTicketGroup(id, dbUser.id);

    logger.info(
      {
        groupId: id,
        userId: dbUser.id,
      },
      'Ticket group deleted via API'
    );

    return ApiResponse.success({
      message: 'Ticket group deleted',
    });
  } catch (error) {
    logger.error({ error }, 'Failed to delete ticket group');
    return handleApiError(error);
  }
}
