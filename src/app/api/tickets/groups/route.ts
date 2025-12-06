/**
 * Ticket Groups API
 * 
 * GET /api/tickets/groups - List all groups
 * POST /api/tickets/groups - Create new group
 */

import { NextRequest } from 'next/server';
import { requireDbUser, ApiResponse } from '@/lib/auth/helpers';
import { handleApiError, Errors } from '@/lib/errors';
import { createTicketGroup, listTicketGroups } from '@/lib/ticket/ticket-groups-service';
import { logger } from '@/lib/logger';
import { z } from 'zod';

const CreateGroupSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  ticketIds: z.array(z.number()).optional(),
});

export async function GET(req: NextRequest) {
  try {
    await requireDbUser();

    const groups = await listTicketGroups();

    return ApiResponse.success({ groups });
  } catch (error) {
    logger.error({ error }, 'Failed to list ticket groups');
    return handleApiError(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const { dbUser } = await requireDbUser();

    const body = await req.json();
    console.log('[API] Create Group Body:', JSON.stringify(body, null, 2));

    const validation = CreateGroupSchema.safeParse(body);

    if (!validation.success) {
      console.error('[API] Validation Error:', validation.error);
      throw Errors.validation(
        'Invalid group data',
        validation.error.issues.map((e) => e.message)
      );
    }

    const { name, description, ticketIds } = validation.data;

    const group = await createTicketGroup(name, description, dbUser.id, ticketIds);

    logger.info(
      {
        groupId: group.id,
        name,
        userId: dbUser.id,
      },
      'Ticket group created via API'
    );

    return ApiResponse.success(
      {
        group,
        message: 'Ticket group created',
      },
      201
    );
  } catch (error) {
    console.error('[API] Create Group Error:', error);
    logger.error({ error }, 'Failed to create ticket group');
    return handleApiError(error);
  }
}
