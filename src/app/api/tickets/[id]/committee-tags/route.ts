/**
 * Committee Tags API
 * 
 * POST /api/tickets/[id]/committee-tags
 * Tag ticket to committees
 * 
 * DELETE /api/tickets/[id]/committee-tags
 * Remove committee tag
 * 
 * GET /api/tickets/[id]/committee-tags
 * Get committees tagged to ticket
 */

import { NextRequest } from 'next/server';
import { requireDbUser, ApiResponse } from '@/lib/auth/helpers';
import { handleApiError, Errors } from '@/lib/errors';
import {
  tagTicketToCommittee,
  removeCommitteeTag,
  getTicketCommittees,
} from '@/lib/ticket/committee-service';
import { logger } from '@/lib/logger';
import { z } from 'zod';

type RouteContext = {
  params: Promise<{ id: string }>;
};

const TagSchema = z.object({
  committeeIds: z.array(z.number().int().positive()).min(1),
});

const UntagSchema = z.object({
  committeeId: z.number().int().positive(),
});

/**
 * GET - Get committees tagged to ticket
 */
export async function GET(req: NextRequest, context: RouteContext) {
  try {
    await requireDbUser();

    const { id } = await context.params;
    const ticketId = parseInt(id, 10);

    if (isNaN(ticketId)) {
      throw Errors.validation('Invalid ticket ID');
    }

    const committees = await getTicketCommittees(ticketId);

    return ApiResponse.success({ committees });
  } catch (error) {
    logger.error({ error }, 'Failed to get ticket committees');
    return handleApiError(error);
  }
}

/**
 * POST - Tag ticket to committees
 */
export async function POST(req: NextRequest, context: RouteContext) {
  try {
    const { dbUser } = await requireDbUser();

    const { id } = await context.params;
    const ticketId = parseInt(id, 10);

    if (isNaN(ticketId)) {
      throw Errors.validation('Invalid ticket ID');
    }

    const body = await req.json();
    const validation = TagSchema.safeParse(body);

    if (!validation.success) {
      throw Errors.validation(
        'Invalid committee tag data',
        validation.error.issues.map((e) => e.message)
      );
    }

    const { committeeIds } = validation.data;

    const tags = await tagTicketToCommittee(ticketId, committeeIds, dbUser.id);

    logger.info(
      {
        ticketId,
        committeeIds,
        userId: dbUser.id,
      },
      'Ticket tagged to committees via API'
    );

    return ApiResponse.success({
      tags,
      message: `Ticket tagged to ${committeeIds.length} committee(s)`,
    });
  } catch (error) {
    logger.error({ error }, 'Failed to tag ticket to committees');
    return handleApiError(error);
  }
}

/**
 * DELETE - Remove committee tag
 */
export async function DELETE(req: NextRequest, context: RouteContext) {
  try {
    const { dbUser } = await requireDbUser();

    const { id } = await context.params;
    const ticketId = parseInt(id, 10);

    if (isNaN(ticketId)) {
      throw Errors.validation('Invalid ticket ID');
    }

    const body = await req.json();
    const validation = UntagSchema.safeParse(body);

    if (!validation.success) {
      throw Errors.validation(
        'Invalid untag data',
        validation.error.issues.map((e) => e.message)
      );
    }

    const { committeeId } = validation.data;

    await removeCommitteeTag(ticketId, committeeId, dbUser.id);

    logger.info(
      {
        ticketId,
        committeeId,
        userId: dbUser.id,
      },
      'Committee tag removed via API'
    );

    return ApiResponse.success({
      message: 'Committee tag removed',
    });
  } catch (error) {
    logger.error({ error }, 'Failed to remove committee tag');
    return handleApiError(error);
  }
}
