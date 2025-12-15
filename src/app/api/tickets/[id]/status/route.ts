/**
 * Ticket Status Update
 * 
 * POST /api/tickets/[id]/status
 * Update ticket status with validation (admin only)
 */

import { NextRequest } from 'next/server';
import { requireDbUser, ApiResponse } from '@/lib/auth/helpers';
import { handleApiError, Errors } from '@/lib/errors';
import { getUserRole } from '@/lib/auth/roles';
import { updateTicketStatus } from '@/lib/ticket/ticket-status-service';
import { logger } from '@/lib/logger';
import { USER_ROLES } from '@/conf/constants';
import { z } from 'zod';
// FIX 5: Move imports to module scope
import { db, tickets } from '@/db';
import { eq } from 'drizzle-orm';
import { safeRevalidateTags } from '@/lib/cache/revalidate-safe';

// Force dynamic and Node runtime to avoid edge/SSR fetch issues
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type RouteContext = {
  params: Promise<{ id: string }>;
};

const StatusUpdateSchema = z.object({
  status: z.string().min(1),
  comment: z.string().max(2000).optional(),
  internal: z.boolean().optional().default(false),
});

export async function POST(req: NextRequest, context: RouteContext) {
  try {
    // OPTIMIZATION: Parse body once and parallelize initial operations
    const [authResult, params, body] = await Promise.all([
      requireDbUser(),
      context.params,
      req.json(),
    ]);

    const { dbUser } = authResult;
    const { id } = params;
    const ticketId = parseInt(id, 10);

    if (isNaN(ticketId)) {
      throw Errors.validation('Invalid ticket ID');
    }

    // OPTIMIZATION: Validate body early and get role in parallel
    const validation = StatusUpdateSchema.safeParse(body);
    if (!validation.success) {
      throw Errors.validation(
        'Invalid status update data',
        validation.error.issues.map((e) => e.message)
      );
    }

    const { status, comment, internal } = validation.data;
    const normalizedStatus = status.toLowerCase();

    // OPTIMIZATION: Get role and check student permissions in parallel with ownership check
    const role = await getUserRole(dbUser.id);

    // Only admins can change status, unless it's a student reopening/closing their own ticket
    if (role === USER_ROLES.STUDENT) {
      // Allow students to close or reopen
      if (normalizedStatus !== 'closed' && normalizedStatus !== 'reopened') {
        throw Errors.forbidden('Students can only close or reopen tickets');
      }

      // OPTIMIZATION: Verify ownership with minimal query (only check created_by)
      const [ticket] = await db
        .select({ created_by: tickets.created_by })
        .from(tickets)
        .where(eq(tickets.id, ticketId))
        .limit(1);

      if (!ticket || ticket.created_by !== dbUser.id) {
        throw Errors.forbidden('You can only modify your own tickets');
      }
    }

    // Update ticket status
    const updatedTicket = await updateTicketStatus(ticketId, status, dbUser.id, comment);

    // OPTIMIZATION: Fire-and-forget cache revalidation to prevent connection timeouts
    const tagsToRevalidate = [
      `ticket-${ticketId}`,
      'tickets',
    ];
    
    if (updatedTicket?.created_by) {
      tagsToRevalidate.push(
        `user-${updatedTicket.created_by}`,
        `student-tickets:${updatedTicket.created_by}`,
        `student-stats:${updatedTicket.created_by}`
      );
    }
    
    safeRevalidateTags(tagsToRevalidate);

    const response = ApiResponse.success({
      message: `Status updated to ${status}`,
      status,
    });

    logger.info(
      {
        ticketId,
        userId: dbUser.id,
        status,
        hasComment: !!comment,
        isInternal: internal,
      },
      'Ticket status updated via API'
    );

    return response;
  } catch (error) {
    logger.error({ 
      error: error instanceof Error ? {
        message: error.message,
        stack: error.stack,
        name: error.name,
      } : error,
    }, 'Failed to update ticket status');
    return handleApiError(error);
  }
}
