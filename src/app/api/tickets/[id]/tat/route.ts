/**
 * TAT Extension
 * 
 * POST /api/tickets/[id]/tat
 * Extend Turn Around Time for a ticket (admin only)
 */

import { NextRequest } from 'next/server';
import { requireDbUser, ApiResponse } from '@/lib/auth/helpers';
import { handleApiError, Errors } from '@/lib/errors';
import { extendTAT, setTAT, parseTAT } from '@/lib/ticket/ticket-operations-service';
import { logger } from '@/lib/logger';
import { z } from 'zod';

export const dynamic = 'force-dynamic';
// Ensure this route runs on Node (for DB/network access)
export const runtime = 'nodejs';

type RouteContext = {
  params: Promise<{ id: string }>;
};

const TATExtensionSchema = z.object({
  hours: z.number().int().positive().max(168, 'Maximum extension is 168 hours (1 week)'),
  reason: z.string().min(1, 'Reason is required').max(500),
});

const TATSetSchema = z.object({
  tat: z.string().min(1, 'TAT is required'),
  markInProgress: z.boolean().optional(),
  isExtension: z.boolean().optional(),
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

    // Check if it's a set TAT request (has 'tat' string)
    const setValidation = TATSetSchema.safeParse(body);

    if (!setValidation.success) {
      logger.warn({ body, error: setValidation.error }, 'TAT Set validation failed, falling back to extension');
    }

    if (setValidation.success) {
      const { tat, markInProgress, isExtension } = setValidation.data;

      if (isExtension) {
        const hours = parseTAT(tat);
        const result = await extendTAT(ticketId, dbUser.id, hours, "Manual extension via UI");

        // Revalidate ticket pages to show updated TAT
        const { revalidatePath } = await import('next/cache');
        revalidatePath(`/student/dashboard/ticket/${ticketId}`);
        revalidatePath(`/admin/dashboard/ticket/${ticketId}`);
        revalidatePath(`/snr-admin/dashboard/ticket/${ticketId}`);
        revalidatePath(`/superadmin/dashboard/ticket/${ticketId}`);
        revalidatePath(`/committee/dashboard/ticket/${ticketId}`);

        return ApiResponse.success({
          ticket: {
            id: result.ticket.id,
            resolution_due_at: result.ticket.resolution_due_at,
            tat_extensions: result.ticket.tat_extensions,
            updated_at: result.ticket.updated_at,
          },
          tat_extensions: result.tatExtensions,
          warning: result.warning,
          message: `TAT extended by ${hours} hours`,
        });
      } else {
        const result = await setTAT(ticketId, dbUser.id, tat, markInProgress);

        // Revalidate ticket pages to show updated TAT and status
        const { revalidatePath } = await import('next/cache');
        revalidatePath(`/student/dashboard/ticket/${ticketId}`);
        revalidatePath(`/admin/dashboard/ticket/${ticketId}`);
        revalidatePath(`/snr-admin/dashboard/ticket/${ticketId}`);
        revalidatePath(`/superadmin/dashboard/ticket/${ticketId}`);
        revalidatePath(`/committee/dashboard/ticket/${ticketId}`);

        return ApiResponse.success({
          ticket: {
            id: result.id,
            resolution_due_at: result.resolution_due_at,
            updated_at: result.updated_at,
            status_id: result.status_id,
          },
          message: `TAT set to ${tat}`,
        });
      }
    }

    // Otherwise treat as extension request
    const validation = TATExtensionSchema.safeParse(body);

    if (!validation.success) {
      throw Errors.validation(
        'Invalid TAT data',
        [...validation.error.issues.map((e) => e.message)]
      );
    }

    const { hours, reason } = validation.data;

    const result = await extendTAT(ticketId, dbUser.id, hours, reason);

    logger.info(
      {
        ticketId,
        userId: dbUser.id,
        hours,
        tatExtensions: result.tatExtensions,
      },
      'TAT extended via API'
    );

    // Revalidate ticket pages to show updated TAT
    const { revalidatePath } = await import('next/cache');
    revalidatePath(`/student/dashboard/ticket/${ticketId}`);
    revalidatePath(`/admin/dashboard/ticket/${ticketId}`);
    revalidatePath(`/snr-admin/dashboard/ticket/${ticketId}`);
    revalidatePath(`/superadmin/dashboard/ticket/${ticketId}`);
    revalidatePath(`/committee/dashboard/ticket/${ticketId}`);

    return ApiResponse.success({
      ticket: {
        id: result.ticket.id,
        resolution_due_at: result.ticket.resolution_due_at,
        tat_extensions: result.ticket.tat_extensions,
        updated_at: result.ticket.updated_at,
      },
      tat_extensions: result.tatExtensions,
      warning: result.warning,
      message: `TAT extended by ${hours} hours`,
    });
  } catch (error) {
    logger.error({ error }, 'Failed to update TAT');
    return handleApiError(error);
  }
}
