/**
 * Forward Ticket
 * 
 * POST /api/tickets/[id]/forward
 * Forward ticket to another admin with reason tracking
 */

import { NextRequest } from 'next/server';
import { requireDbUser, ApiResponse } from '@/lib/auth/helpers';
import { handleApiError, Errors } from '@/lib/errors';
import { getUserRole } from '@/lib/auth/roles';
import { forwardTicket } from '@/lib/ticket/ticket-status-service';
import { logger } from '@/lib/logger';
import { USER_ROLES } from '@/conf/constants';
import { z } from 'zod';

type RouteContext = {
  params: Promise<{ id: string }>;
};

const ForwardSchema = z.object({
  targetUserId: z.string().uuid().optional(),
  reason: z.string().max(500).optional(),
});

export async function POST(req: NextRequest, context: RouteContext) {
  try {
    const { dbUser } = await requireDbUser();
    const role = await getUserRole(dbUser.id);

    // Only admins can forward tickets
    if (role === USER_ROLES.STUDENT) {
      throw Errors.forbidden('Only admins can forward tickets');
    }

    const { id } = await context.params;
    const ticketId = parseInt(id, 10);

    if (isNaN(ticketId)) {
      throw Errors.validation('Invalid ticket ID');
    }

    const body = await req.json();
    const validation = ForwardSchema.safeParse(body);

    if (!validation.success) {
      throw Errors.validation(
        'Invalid forward data',
        validation.error.issues.map((e) => e.message)
      );
    }

    let { targetUserId, reason } = validation.data;

    // Handle Auto-Assignment (if targetUserId is missing)
    if (!targetUserId) {
      // Find a Super Admin to forward to
      // This is a simplified logic: pick the first Super Admin found
      // In a real system, you might want round-robin or load balancing
      const { db, users, roles } = await import('@/db');
      const { eq, and } = await import('drizzle-orm');

      const superAdmins = await db
        .select({ id: users.id })
        .from(users)
        .innerJoin(roles, eq(users.role_id, roles.id))
        .where(eq(roles.name, USER_ROLES.SUPER_ADMIN))
        .limit(1);

      if (superAdmins.length === 0) {
        throw Errors.validation('No Super Admin available to forward to');
      }

      targetUserId = superAdmins[0].id;
    }

    // Forward ticket
    await forwardTicket(ticketId, targetUserId, dbUser.id, reason);

    // Get updated ticket to check forward count
    const { db, tickets } = await import('@/db');
    const { eq } = await import('drizzle-orm');

    const [ticket] = await db
      .select()
      .from(tickets)
      .where(eq(tickets.id, ticketId))
      .limit(1);

    const WARNING_THRESHOLD = 3;
    const warning =
      ticket && ticket.forward_count >= WARNING_THRESHOLD
        ? `This ticket has been forwarded ${ticket.forward_count} time(s). Forwarding more than 3 times may trigger escalation.`
        : undefined;

    logger.info(
      {
        ticketId,
        fromUserId: dbUser.id,
        toUserId: targetUserId,
        forwardCount: ticket?.forward_count,
        reason,
      },
      'Ticket forwarded via API'
    );

    return ApiResponse.success({
      message: 'Ticket forwarded successfully',
      forward_count: ticket?.forward_count,
      warning,
    });
  } catch (error) {
    logger.error({ error }, 'Failed to forward ticket');
    return handleApiError(error);
  }
}
