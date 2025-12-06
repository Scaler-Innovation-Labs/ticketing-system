/**
 * Manual Ticket Escalation
 * 
 * POST /api/tickets/[id]/escalate
 * Manually escalate a ticket (students can escalate their own tickets)
 */

import { NextRequest } from 'next/server';
import { requireDbUser, ApiResponse } from '@/lib/auth/helpers';
import { handleApiError, Errors } from '@/lib/errors';
import { escalateTicket } from '@/lib/ticket/ticket-operations-service';
import { logger } from '@/lib/logger';
import { z } from 'zod';

type RouteContext = {
  params: Promise<{ id: string }>;
};

const EscalateSchema = z.object({
  reason: z.string().optional(),
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
    const validation = EscalateSchema.safeParse(body);

    if (!validation.success) {
      throw Errors.validation(
        'Invalid escalation data',
        validation.error.issues.map((e) => e.message)
      );
    }

    const { reason } = validation.data;

    const ticket = await escalateTicket(ticketId, dbUser.id, reason);

    logger.info(
      {
        ticketId,
        userId: dbUser.id,
        escalationLevel: ticket.escalation_level,
      },
      'Ticket escalated via API'
    );

    return ApiResponse.success({
      ticket: {
        id: ticket.id,
        escalation_level: ticket.escalation_level,
        escalated_at: ticket.escalated_at,
        updated_at: ticket.updated_at,
      },
      message: 'Ticket escalated successfully',
    });
  } catch (error) {
    logger.error({ error }, 'Failed to escalate ticket');
    return handleApiError(error);
  }
}
