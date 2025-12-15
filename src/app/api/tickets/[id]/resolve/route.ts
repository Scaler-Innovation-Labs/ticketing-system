/**
 * Resolve Ticket (Atomic Domain Action)
 * 
 * POST /api/tickets/[id]/resolve
 * 
 * Atomically resolves a ticket with an optional comment.
 * This is a single domain event, not two separate operations.
 * 
 * Request body:
 * {
 *   "comment": "Issue fixed", // optional
 *   "commentVisibility": "public" // optional, defaults to "public"
 * }
 */

import { NextRequest } from 'next/server';
import { requireDbUser, ApiResponse } from '@/lib/auth/helpers';
import { handleApiError, Errors } from '@/lib/errors';
import { getUserRole } from '@/lib/auth/roles';
import { logger } from '@/lib/logger';
import { USER_ROLES } from '@/conf/constants';
import { z } from 'zod';
import { db, tickets, ticket_activity, ticket_statuses } from '@/db';
import { eq, and } from 'drizzle-orm';
import { withTransaction } from '@/lib/db-transaction';
import { TICKET_STATUS } from '@/conf/constants';
import { getStatusId } from '@/lib/ticket/status-ids';
import { getStatusValue } from '@/lib/ticket/ticket-status-service';
import { revalidateTag } from 'next/cache';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type RouteContext = {
  params: Promise<{ id: string }>;
};

const ResolveTicketSchema = z.object({
  comment: z.string().max(2000).optional(),
  commentVisibility: z.enum(['public', 'internal']).optional().default('public'),
});

export async function POST(req: NextRequest, context: RouteContext) {
  try {
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

    // Validate body
    const validation = ResolveTicketSchema.safeParse(body);
    if (!validation.success) {
      throw Errors.validation(
        'Invalid resolve request data',
        validation.error.issues.map((e) => e.message)
      );
    }

    const { comment, commentVisibility } = validation.data;
    const isInternal = commentVisibility === 'internal';

    // Check permissions - only admins can resolve tickets
    const role = await getUserRole(dbUser.id);
    if (role === USER_ROLES.STUDENT) {
      throw Errors.forbidden('Only admins can resolve tickets');
    }

    // FIX 4: Move validation OUTSIDE transaction (read-only operations)
    // FIX 2: Collapse queries with JOIN (one query instead of two)
    const [ticketWithStatus] = await db
      .select({
        ticket: tickets,
        status_value: ticket_statuses.value,
      })
      .from(tickets)
      .leftJoin(ticket_statuses, eq(tickets.status_id, ticket_statuses.id))
      .where(eq(tickets.id, ticketId))
      .limit(1);

    if (!ticketWithStatus?.ticket) {
      throw Errors.notFound('Ticket', String(ticketId));
    }

    const ticket = ticketWithStatus.ticket;
    const currentStatus = (ticketWithStatus.status_value || '').toLowerCase();
    const resolvedStatus = TICKET_STATUS.RESOLVED.toLowerCase();

    // Validate transition to resolved (outside transaction)
    const validFromStatuses = [
      TICKET_STATUS.OPEN.toLowerCase(),
      TICKET_STATUS.ACKNOWLEDGED.toLowerCase(),
      TICKET_STATUS.IN_PROGRESS.toLowerCase(),
      TICKET_STATUS.AWAITING_STUDENT_RESPONSE.toLowerCase(),
      TICKET_STATUS.REOPENED.toLowerCase(),
    ];

    if (!validFromStatuses.includes(currentStatus)) {
      throw Errors.invalidStatusTransition(
        ticketWithStatus.status_value || 'unknown',
        TICKET_STATUS.RESOLVED
      );
    }

    // FIX 1: Get status ID from static map (no DB query)
    const resolvedStatusId = await getStatusId(resolvedStatus);

    // FIX 4: Atomic operation - only DB writes inside transaction
    const result = await withTransaction(async (txn) => {

      // Update ticket status to resolved
      const now = new Date();
      await txn
        .update(tickets)
        .set({
          status_id: resolvedStatusId,
          resolved_at: now,
          updated_at: now,
        })
        .where(eq(tickets.id, ticketId));

      // Add comment if provided
      if (comment && comment.trim()) {
        await txn.insert(ticket_activity).values({
          ticket_id: ticketId,
          user_id: dbUser.id,
          action: isInternal ? 'internal_note' : 'comment',
          details: {
            comment: comment.trim(),
          },
          visibility: isInternal ? 'admin_only' : 'student_visible',
        });
      }

      // Add timeline event for status change
      await txn.insert(ticket_activity).values({
        ticket_id: ticketId,
        user_id: dbUser.id,
        action: 'status_changed',
        details: {
          from: ticketWithStatus.status_value || currentStatus,
          to: TICKET_STATUS.RESOLVED,
          reason: comment ? 'Resolved with comment' : 'Resolved',
        },
        visibility: 'student_visible',
      });

      return {
        ticketId,
        status: TICKET_STATUS.RESOLVED,
        hasComment: !!comment,
        created_by: ticket.created_by, // Include for cache invalidation
      };
    });

    // CRITICAL FIX: Call revalidateTag BEFORE response (synchronously)
    // setTimeout was preventing cache invalidation from working
    try {
      revalidateTag(`ticket-${ticketId}`, 'default');
      if (result.created_by) {
        revalidateTag(`user-${result.created_by}`, 'default');
        revalidateTag(`student-tickets:${result.created_by}`, 'default');
        revalidateTag(`student-stats:${result.created_by}`, 'default');
      }
      revalidateTag('tickets', 'default');
    } catch (err) {
      logger.warn({ err, ticketId }, 'Cache revalidation failed (non-blocking)');
    }

    const response = ApiResponse.success({
      message: 'Ticket resolved successfully',
      ...result,
    });

    return response;

    logger.info(
      {
        ticketId,
        userId: dbUser.id,
        hasComment: !!comment,
        isInternal,
      },
      'Ticket resolved atomically'
    );

    return ApiResponse.success({
      message: 'Ticket resolved successfully',
      ...result,
    });
  } catch (error) {
    logger.error(
      {
        error: error instanceof Error
          ? {
              message: error.message,
              stack: error.stack,
              name: error.name,
            }
          : error,
      },
      'Failed to resolve ticket'
    );
    return handleApiError(error);
  }
}

