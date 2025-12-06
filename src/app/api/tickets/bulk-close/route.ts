/**
 * Bulk Close Tickets
 * 
 * POST /api/tickets/bulk-close
 * Close multiple tickets at once (admin only)
 */

import { NextRequest } from 'next/server';
import { requireDbUser, ApiResponse } from '@/lib/auth/helpers';
import { handleApiError, Errors } from '@/lib/errors';
import { getUserRole } from '@/lib/auth/roles';
import { updateTicketStatus } from '@/lib/ticket/ticket-status-service';
import { logger } from '@/lib/logger';
import { USER_ROLES } from '@/conf/constants';
import { z } from 'zod';

const BulkCloseSchema = z.object({
  ticketIds: z.array(z.number().int().positive()).min(1).max(50, 'Maximum 50 tickets at once'),
  comment: z.string().max(1000).optional(),
});

export async function POST(req: NextRequest) {
  try {
    const { dbUser } = await requireDbUser();
    const role = await getUserRole(dbUser.id);

    // Only admins can bulk close
    if (role === USER_ROLES.STUDENT) {
      throw Errors.forbidden('Only admins can bulk close tickets');
    }

    const body = await req.json();
    const validation = BulkCloseSchema.safeParse(body);

    if (!validation.success) {
      throw Errors.validation(
        'Invalid bulk close data',
        validation.error.issues.map((e) => e.message)
      );
    }

    const { ticketIds, comment } = validation.data;

    const results = {
      successful: [] as number[],
      failed: [] as { ticketId: number; error: string }[],
    };

    // Close each ticket
    for (const ticketId of ticketIds) {
      try {
        await updateTicketStatus(
          ticketId,
          'closed',
          dbUser.id,
          comment || 'Bulk closed'
        );
        results.successful.push(ticketId);
      } catch (error) {
        results.failed.push({
          ticketId,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    logger.info(
      {
        userId: dbUser.id,
        totalTickets: ticketIds.length,
        successful: results.successful.length,
        failed: results.failed.length,
      },
      'Bulk close operation completed'
    );

    return ApiResponse.success({
      message: `Closed ${results.successful.length} of ${ticketIds.length} tickets`,
      successful: results.successful,
      failed: results.failed,
      summary: {
        total: ticketIds.length,
        successful: results.successful.length,
        failed: results.failed.length,
      },
    });
  } catch (error) {
    logger.error({ error }, 'Bulk close operation failed');
    return handleApiError(error);
  }
}
