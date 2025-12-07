import { NextRequest } from 'next/server';
import { requireDbUser, ApiResponse } from '@/lib/auth/helpers';
import { handleApiError, Errors } from '@/lib/errors';
import { getUserRole } from '@/lib/auth/roles';
import { addTicketComment } from '@/lib/ticket/ticket-comment-service';
import { logger } from '@/lib/logger';
import { USER_ROLES } from '@/conf/constants';
import { z } from 'zod';

type RouteContext = {
  params: Promise<{ id: string }>;
};

/**
 * Schema for adding comment
 */
const AddCommentSchema = z.object({
  comment: z.string().min(1).max(5000),
  is_internal: z.boolean().optional().default(false),
  attachments: z
    .array(
      z.object({
        filename: z.string(),
        url: z.string().url(),
        size: z.number().int().positive(),
        mime_type: z.string(),
      })
    )
    .optional()
    .default([]),
});

/**
 * POST /api/tickets/[id]/comments
 * Add a comment to a ticket
 */
export async function POST(req: NextRequest, context: RouteContext) {
  try {
    const { dbUser } = await requireDbUser();
    const role = await getUserRole(dbUser.id);

    const { id } = await context.params;
    const ticketId = parseInt(id, 10);

    if (isNaN(ticketId)) {
      throw Errors.validation('Invalid ticket ID');
    }

    const body = await req.json();
    const validation = AddCommentSchema.safeParse(body);

    if (!validation.success) {
      throw Errors.validation(
        'Invalid comment data',
        validation.error.issues.map((e) => e.message)
      );
    }

    const { comment, is_internal, attachments } = validation.data;

    // Only admins can add internal notes
    if (is_internal && role === USER_ROLES.STUDENT) {
      throw Errors.forbidden('Students cannot add internal notes');
    }

    // Debug log for role matching
    const isFromStudent = role === USER_ROLES.STUDENT;
    logger.info(
      {
        ticketId,
        userId: dbUser.id,
        role,
        USER_ROLES_STUDENT: USER_ROLES.STUDENT,
        isFromStudent,
      },
      'Comment submission - role check'
    );

    // Add comment
    const activity = await addTicketComment(ticketId, dbUser.id, {
      comment,
      is_internal,
      is_from_student: isFromStudent,
      attachments,
    });

    logger.info(
      {
        ticketId,
        userId: dbUser.id,
        isInternal: is_internal,
        attachmentCount: attachments.length,
      },
      'Comment added to ticket'
    );

    return ApiResponse.success(
      {
        activity,
        message: is_internal
          ? 'Internal note added'
          : 'Comment added successfully',
      },
      201
    );
  } catch (error) {
    logger.error({ error }, 'Failed to add comment');
    return handleApiError(error);
  }
}
