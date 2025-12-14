import { NextRequest } from 'next/server';
import { revalidateTag } from 'next/cache';
import { requireDbUser, ApiResponse } from '@/lib/auth/helpers';
import { handleApiError, Errors } from '@/lib/errors';
import { getUserRole } from '@/lib/auth/roles';
import { addTicketComment } from '@/lib/ticket/ticket-comment-service';
import { logger } from '@/lib/logger';
import { USER_ROLES } from '@/conf/constants';
import { z } from 'zod';

// Force dynamic so the route is always available (avoids build-time fetch issues)
export const dynamic = 'force-dynamic';

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

    // Get ticket to check ownership and get created_by for cache invalidation
    const { db: dbInstance, tickets: ticketsTable } = await import('@/db');
    const { eq } = await import('drizzle-orm');
    
    const [ticket] = await dbInstance
      .select({ created_by: ticketsTable.created_by })
      .from(ticketsTable)
      .where(eq(ticketsTable.id, ticketId))
      .limit(1);

    if (!ticket) {
      throw Errors.notFound('Ticket', String(ticketId));
    }

    // Check ticket ownership for students
    if (role === USER_ROLES.STUDENT) {
      if (ticket.created_by !== dbUser.id) {
        throw Errors.forbidden('You can only comment on your own tickets');
      }
    }

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

    // Revalidate cache tags to immediately update ticket page and dashboard
    // This ensures the new comment and status change appear instantly
    Promise.resolve().then(async () => {
      try {
        // Revalidate ticket-specific cache
        revalidateTag(`ticket-${ticketId}`, 'default');
        
        // Revalidate user-specific caches (for ticket creator)
        if (ticket.created_by) {
          revalidateTag(`user-${ticket.created_by}`, 'default');
          revalidateTag(`student-tickets:${ticket.created_by}`, 'default');
          revalidateTag(`student-stats:${ticket.created_by}`, 'default');
        }
        
        // Also revalidate for comment author if different from ticket creator
        if (dbUser.id !== ticket.created_by) {
          revalidateTag(`user-${dbUser.id}`, 'default');
        }
        
        // Revalidate global tickets cache
        revalidateTag('tickets', 'default');
        
        logger.debug(
          {
            ticketId,
            userId: dbUser.id,
            createdBy: ticket.created_by,
          },
          'Cache tags revalidated after comment creation'
        );
      } catch (cacheError) {
        // Don't fail comment creation if cache revalidation fails
        logger.warn(
          {
            error: cacheError,
            ticketId,
            userId: dbUser.id,
          },
          'Failed to revalidate cache tags (non-critical, fire-and-forget)'
        );
      }
    }).catch(() => {
      // Swallow any errors from the promise chain itself
    });

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
