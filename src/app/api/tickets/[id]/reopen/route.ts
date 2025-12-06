/**
 * Reopen Ticket
 * 
 * POST /api/tickets/[id]/reopen
 * Reopen a resolved or closed ticket (students can reopen their own)
 */

import { NextRequest } from 'next/server';
import { requireDbUser, ApiResponse } from '@/lib/auth/helpers';
import { handleApiError, Errors } from '@/lib/errors';
import { reopenTicket } from '@/lib/ticket/ticket-operations-service';
import { logger } from '@/lib/logger';
import { z } from 'zod';

type RouteContext = {
  params: Promise<{ id: string }>;
};

const ReopenSchema = z.object({
  reason: z.string().min(1, 'Reason is required').max(500),
});

export async function POST(req: NextRequest, context: RouteContext) {
  try {
    const { dbUser } = await requireDbUser();

    const { id } = await context.params;
    const ticketId = parseInt(id, 10);

    if (isNaN(ticketId)) {
      throw Errors.validation('Invalid ticket ID');
    }

    const body = await req.json();
    const validation = ReopenSchema.safeParse(body);

    if (!validation.success) {
      throw Errors.validation(
        'Invalid reopen data',
        validation.error.issues.map((e) => e.message)
      );
    }

    const { reason } = validation.data;

    const result = await reopenTicket(ticketId, dbUser.id, reason);

    logger.info(
      {
        ticketId,
        userId: dbUser.id,
        reopenCount: result.reopenCount,
      },
      'Ticket reopened via API'
    );

    return ApiResponse.success({
      ticket: {
        id: result.ticket.id,
        status_id: result.ticket.status_id,
        reopen_count: result.ticket.reopen_count,
        reopened_at: result.ticket.reopened_at,
        updated_at: result.ticket.updated_at,
      },
      reopen_count: result.reopenCount,
      warning: result.warning,
      message: 'Ticket reopened successfully',
    });
  } catch (error) {
    logger.error({ error }, 'Failed to reopen ticket');
    return handleApiError(error);
  }
}
