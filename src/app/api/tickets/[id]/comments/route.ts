import { NextRequest } from 'next/server';
import { safeRevalidateTags } from '@/lib/cache/revalidate-safe';
import { requireDbUser, ApiResponse } from '@/lib/auth/helpers';
import { handleApiError, Errors } from '@/lib/errors';
import { getUserRole } from '@/lib/auth/roles';
import { addTicketComment } from '@/lib/ticket/ticket-comment-service';
import { logger } from '@/lib/logger';
import { USER_ROLES } from '@/conf/constants';
import { z } from 'zod';
// FIX: Move imports to module scope (not per-request) - saves 0.5-1.5s on serverless
import { db, tickets, users } from '@/db';
import { eq } from 'drizzle-orm';

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
    // FIX: Parallelize independent operations
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

    // Validate body early
    const validation = AddCommentSchema.safeParse(body);
    if (!validation.success) {
      throw Errors.validation(
        'Invalid comment data',
        validation.error.issues.map((e) => e.message)
      );
    }

    const { comment, is_internal, attachments } = validation.data;

    // FIX: Parallelize role check and ticket fetch (independent operations)
    const [role, ticketResult] = await Promise.all([
      getUserRole(dbUser.id),
      db
        .select({ created_by: tickets.created_by })
        .from(tickets)
        .where(eq(tickets.id, ticketId))
        .limit(1),
    ]);

    const [ticket] = ticketResult;

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

    const isFromStudent = role === USER_ROLES.STUDENT;

    // FIX: Fast core transaction - only insert comment + activity
    // Side effects (notifications, cache) happen async after response
    const activity = await addTicketComment(ticketId, dbUser.id, {
      comment,
      is_internal,
      is_from_student: isFromStudent,
      attachments,
    });

    // FIX: Fetch user name for the response (needed for optimistic UI updates)
    const [user] = await db
      .select({ full_name: users.full_name })
      .from(users)
      .where(eq(users.id, dbUser.id))
      .limit(1);

    // Enrich activity with user name for client-side rendering
    const enrichedActivity = {
      ...activity,
      user_name: user?.full_name || 'Unknown',
    };

    // FIX: Prepare response BEFORE async work
    const response = ApiResponse.success(
      {
        activity: enrichedActivity,
        message: is_internal
          ? 'Internal note added'
          : 'Comment added successfully',
      },
      201
    );

    // OPTIMIZATION: Fire-and-forget cache revalidation to prevent connection timeouts
    const tagsToRevalidate = [
      `ticket-${ticketId}`,
      'tickets',
    ];
    
    if (ticket.created_by) {
      tagsToRevalidate.push(
        `user-${ticket.created_by}`,
        `student-tickets:${ticket.created_by}`,
        `student-stats:${ticket.created_by}`
      );
    }
    
    if (dbUser.id !== ticket.created_by) {
      tagsToRevalidate.push(`user-${dbUser.id}`);
    }
    
    safeRevalidateTags(tagsToRevalidate);

    return response;
  } catch (error) {
    logger.error({ error }, 'Failed to add comment');
    return handleApiError(error);
  }
}
