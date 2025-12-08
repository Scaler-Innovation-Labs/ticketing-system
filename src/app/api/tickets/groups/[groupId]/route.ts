/**
 * Ticket Group Details API
 * 
 * GET /api/tickets/groups/[groupId] - Get group details with tickets
 * PATCH /api/tickets/groups/[groupId] - Update group (name, description, groupTAT, committee_id)
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
  removeTicketsFromGroup,
  updateTicketGroup,
  archiveTicketGroup,
} from '@/lib/ticket/ticket-groups-service';
import { logger } from '@/lib/logger';
import { z } from 'zod';
import { db, committees, ticket_groups } from '@/db';
import { eq } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

type RouteContext = {
  params: Promise<{ groupId: string }>;
};

const AddTicketsSchema = z.object({
  ticketIds: z.array(z.number().int().positive()).min(1),
});

const UpdateGroupSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).nullable().optional(),
  groupTAT: z.string().optional(),
  committee_id: z.number().int().positive().nullable().optional(),
  addTicketIds: z.array(z.number().int().positive()).optional(),
  removeTicketIds: z.array(z.number().int().positive()).optional(),
  archive: z.boolean().optional(),
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

export async function PATCH(req: NextRequest, context: RouteContext) {
  try {
    const { dbUser } = await requireDbUser();

    const { groupId } = await context.params;
    const id = parseInt(groupId, 10);

    if (isNaN(id)) {
      throw Errors.validation('Invalid group ID');
    }

    const body = await req.json();
    const validation = UpdateGroupSchema.safeParse(body);

    if (!validation.success) {
      throw Errors.validation(
        'Invalid update data',
        validation.error.issues.map((e) => e.message)
      );
    }

    // Handle adding tickets to group
    if (validation.data.addTicketIds && validation.data.addTicketIds.length > 0) {
      await addTicketsToGroup(id, validation.data.addTicketIds, dbUser.id);
      logger.info(
        {
          groupId: id,
          ticketIds: validation.data.addTicketIds,
          userId: dbUser.id,
        },
        'Tickets added to group via PATCH'
      );
    }

    // Handle removing tickets from group
    if (validation.data.removeTicketIds && validation.data.removeTicketIds.length > 0) {
      await removeTicketsFromGroup(validation.data.removeTicketIds, dbUser.id);
      logger.info(
        {
          groupId: id,
          ticketIds: validation.data.removeTicketIds,
          userId: dbUser.id,
        },
        'Tickets removed from group via PATCH'
      );
    }

    // Handle archive/unarchive
    if (validation.data.archive !== undefined) {
      if (validation.data.archive) {
        // Archive the group
        await archiveTicketGroup(id, dbUser.id);
        logger.info(
          {
            groupId: id,
            userId: dbUser.id,
          },
          'Ticket group archived via PATCH API'
        );
      } else {
        // Unarchive the group (set is_active to true)
        await db
          .update(ticket_groups)
          .set({
            is_active: true,
            updated_at: new Date(),
          })
          .where(eq(ticket_groups.id, id));
        logger.info(
          {
            groupId: id,
            userId: dbUser.id,
          },
          'Ticket group unarchived via PATCH API'
        );
      }
    }

    // Handle group metadata updates
    const updates: {
      name?: string;
      description?: string | null;
      groupTAT?: string;
      committee_id?: number | null;
    } = {};

    if (validation.data.name !== undefined) {
      updates.name = validation.data.name;
    }

    if (validation.data.description !== undefined) {
      updates.description = validation.data.description;
    }

    if (validation.data.groupTAT !== undefined) {
      updates.groupTAT = validation.data.groupTAT;
    }

    if (validation.data.committee_id !== undefined) {
      updates.committee_id = validation.data.committee_id;
    }

    // Only update group metadata if there are actual updates
    let updatedGroup;
    if (Object.keys(updates).length > 0) {
      updatedGroup = await updateTicketGroup(id, dbUser.id, updates);
    } else {
      // If no metadata updates, just fetch the current group
      updatedGroup = await getTicketGroup(id);
    }

    // If committee was set, fetch committee details for response
    let committee = null;
    if (updates.committee_id !== null && updates.committee_id !== undefined) {
      const [committeeData] = await db
        .select()
        .from(committees)
        .where(eq(committees.id, updates.committee_id!))
        .limit(1);
      committee = committeeData || null;
    }

    // Determine the appropriate message
    let message = 'Ticket group updated';
    if (validation.data.addTicketIds && validation.data.addTicketIds.length > 0) {
      message = `${validation.data.addTicketIds.length} ticket(s) added to group`;
    } else if (validation.data.removeTicketIds && validation.data.removeTicketIds.length > 0) {
      message = `${validation.data.removeTicketIds.length} ticket(s) removed from group`;
    } else if (Object.keys(updates).length > 0) {
      message = 'Ticket group updated';
    }

    logger.info(
      {
        groupId: id,
        updates,
        addTicketIds: validation.data.addTicketIds,
        removeTicketIds: validation.data.removeTicketIds,
        userId: dbUser.id,
      },
      'Ticket group updated via PATCH API'
    );

    return ApiResponse.success({
      group: updatedGroup,
      committee,
      message,
    });
  } catch (error) {
    logger.error({ error }, 'Failed to update ticket group');
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
