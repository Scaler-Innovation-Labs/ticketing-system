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
    const { dbUser } = await requireDbUser();
    const role = await getUserRole(dbUser.id);
    const { id } = await context.params;
    const ticketId = parseInt(id, 10);

    if (isNaN(ticketId)) {
      throw Errors.validation('Invalid ticket ID');
    }

    // Only admins can change status, unless it's a student reopening/closing their own ticket
    if (role === USER_ROLES.STUDENT) {
      const body = await req.clone().json();
      const status = body.status?.toLowerCase();

      // Allow students to close or reopen
      if (status !== 'closed' && status !== 'reopened') {
        throw Errors.forbidden('Students can only close or reopen tickets');
      }

      // Verify ownership
      const { db, tickets } = await import('@/db');
      const { eq } = await import('drizzle-orm');

      const [ticket] = await db
        .select()
        .from(tickets)
        .where(eq(tickets.id, ticketId))
        .limit(1);

      if (!ticket || ticket.created_by !== dbUser.id) {
        throw Errors.forbidden('You can only modify your own tickets');
      }
    }

    const body = await req.json();
    const validation = StatusUpdateSchema.safeParse(body);

    if (!validation.success) {
      throw Errors.validation(
        'Invalid status update data',
        validation.error.issues.map((e) => e.message)
      );
    }

    const { status, comment, internal } = validation.data;

    await updateTicketStatus(ticketId, status, dbUser.id, comment);

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

    const { revalidatePath } = await import('next/cache');
    revalidatePath(`/student/dashboard/ticket/${ticketId}`);
    revalidatePath(`/superadmin/dashboard/ticket/${ticketId}`);

    return ApiResponse.success({
      message: `Status updated to ${status}`,
      status,
    });
  } catch (error) {
    logger.error({ error }, 'Failed to update ticket status');
    return handleApiError(error);
  }
}
