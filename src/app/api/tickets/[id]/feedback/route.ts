/**
 * Ticket Feedback
 * 
 * POST /api/tickets/[id]/feedback
 * Submit feedback for resolved/closed ticket (student only, own tickets)
 */

import { NextRequest } from 'next/server';
import { requireDbUser, ApiResponse } from '@/lib/auth/helpers';
import { handleApiError, Errors } from '@/lib/errors';
import { submitFeedback } from '@/lib/ticket/ticket-operations-service';
import { logger } from '@/lib/logger';
import { z } from 'zod';

type RouteContext = {
  params: Promise<{ id: string }>;
};

const FeedbackSchema = z.object({
  rating: z.number().int().min(1).max(5),
  feedback: z.string().max(2000).optional(),
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
    const validation = FeedbackSchema.safeParse(body);

    if (!validation.success) {
      throw Errors.validation(
        'Invalid feedback data',
        validation.error.issues.map((e) => e.message)
      );
    }

    const { rating, feedback } = validation.data;

    const result = await submitFeedback(ticketId, dbUser.id, rating, feedback);

    logger.info(
      {
        ticketId,
        userId: dbUser.id,
        rating,
      },
      'Feedback submitted via API'
    );

    const { revalidatePath } = await import('next/cache');
    revalidatePath(`/student/dashboard/ticket/${ticketId}`);
    revalidatePath(`/superadmin/dashboard/ticket/${ticketId}`);

    return ApiResponse.success(
      {
        feedback: result,
        message: 'Feedback submitted successfully',
      },
      201
    );
  } catch (error) {
    logger.error({ error }, 'Failed to submit feedback');
    return handleApiError(error);
  }
}
