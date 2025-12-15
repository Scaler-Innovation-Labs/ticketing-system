/**
 * Ask Question to Student (Atomic Domain Action)
 * 
 * POST /api/tickets/[id]/ask-question
 * 
 * Atomically asks a question to the student by:
 * 1. Updating status to "awaiting_student_response"
 * 2. Adding the question as a comment
 * 3. Creating timeline event
 * 
 * All in a single transaction - no partial failures.
 * 
 * Request body:
 * {
 *   "question": "Can you provide more details?"
 * }
 */

import { NextRequest } from 'next/server';
import { requireDbUser, ApiResponse } from '@/lib/auth/helpers';
import { handleApiError, Errors } from '@/lib/errors';
import { getUserRole } from '@/lib/auth/roles';
import { logger } from '@/lib/logger';
import { USER_ROLES } from '@/conf/constants';
import { z } from 'zod';
import { db, tickets, ticket_activity, ticket_statuses, users, outbox } from '@/db';
import { eq } from 'drizzle-orm';
import { withTransaction } from '@/lib/db-transaction';
import { TICKET_STATUS } from '@/conf/constants';
import { getStatusId } from '@/lib/ticket/status-ids';
import { getStatusValue } from '@/lib/ticket/ticket-status-service';
import { safeRevalidateTags } from '@/lib/cache/revalidate-safe';
// FIX 3: Move dynamic import to module scope (not inside transaction)
import { calculateRemainingBusinessHours } from '@/lib/ticket/utils/tat-calculator';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type RouteContext = {
  params: Promise<{ id: string }>;
};

const AskQuestionSchema = z.object({
  question: z.string().min(1).max(2000),
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
    const validation = AskQuestionSchema.safeParse(body);
    if (!validation.success) {
      throw Errors.validation(
        'Invalid question data',
        validation.error.issues.map((e) => e.message)
      );
    }

    const { question } = validation.data;

    // Check permissions - only admins can ask questions
    const role = await getUserRole(dbUser.id);
    if (role === USER_ROLES.STUDENT) {
      throw Errors.forbidden('Only admins can ask questions');
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
    const awaitingStatus = TICKET_STATUS.AWAITING_STUDENT_RESPONSE.toLowerCase();

    // FIX 1: Get status ID from static map (no DB query)
    const awaitingStatusId = await getStatusId(awaitingStatus);

    const now = new Date();

    // FIX 4: Calculate TAT pause OUTSIDE transaction (read-only calculation)
    const metadata = (ticket.metadata as Record<string, any>) || {};
    let metadataUpdated = false;

    if (currentStatus !== awaitingStatus && ticket.resolution_due_at) {
      // FIX 3: Use module-scoped import (no dynamic import)
      const remainingHours = calculateRemainingBusinessHours(now, new Date(ticket.resolution_due_at));
      metadata.tatPausedAt = now.toISOString();
      metadata.tatRemainingHours = remainingHours;
      metadata.tatPausedStatus = ticketWithStatus.status_value || currentStatus;
      metadataUpdated = true;
    }

    // FIX 4: Atomic operation - only DB writes inside transaction
    const result = await withTransaction(async (txn) => {

      const updateData: Record<string, any> = {
        status_id: awaitingStatusId,
        updated_at: now,
      };

      if (metadataUpdated) {
        updateData.metadata = metadata;
      }

      await txn
        .update(tickets)
        .set(updateData)
        .where(eq(tickets.id, ticketId));

      // Add question as comment (always visible to student)
      const [commentActivity] = await txn.insert(ticket_activity).values({
        ticket_id: ticketId,
        user_id: dbUser.id,
        action: 'comment',
        details: {
          comment: question.trim(),
        },
        visibility: 'student_visible',
      }).returning();

      // Add timeline event for status change
      await txn.insert(ticket_activity).values({
        ticket_id: ticketId,
        user_id: dbUser.id,
        action: 'status_changed',
        details: {
          from: ticketWithStatus.status_value || currentStatus,
          to: TICKET_STATUS.AWAITING_STUDENT_RESPONSE,
          reason: 'Admin asked a question',
        },
        visibility: 'student_visible',
      });

      return {
        ticketId,
        status: TICKET_STATUS.AWAITING_STUDENT_RESPONSE,
        question: question.trim(),
        activity: commentActivity,
        created_by: ticket.created_by, // Include for cache invalidation
      };
    });

    // FIX 4: Fetch user name outside transaction (read-only)
    const [user] = await db
      .select({ full_name: users.full_name })
      .from(users)
      .where(eq(users.id, dbUser.id))
      .limit(1);

    // OPTIMIZATION: Fire-and-forget cache revalidation to prevent connection timeouts
    const tagsToRevalidate = [
      `ticket-${ticketId}`,
      'tickets',
    ];
    
    if (result.created_by) {
      tagsToRevalidate.push(
        `user-${result.created_by}`,
        `student-tickets:${result.created_by}`,
        `student-stats:${result.created_by}`
      );
    }
    
    safeRevalidateTags(tagsToRevalidate);

    // Queue email notifications (fire-and-forget, after response)
    queueMicrotask(async () => {
      try {
        // Queue status update notification (status changed to AWAITING_STUDENT_RESPONSE)
        await db.insert(outbox).values({
          event_type: 'ticket.status_updated',
          aggregate_type: 'ticket',
          aggregate_id: String(ticketId),
          payload: {
            ticketId: Number(ticketId),
            oldStatus: ticketWithStatus.status_value || currentStatus,
            newStatus: TICKET_STATUS.AWAITING_STUDENT_RESPONSE,
            updatedBy: String(dbUser.id),
          },
        });

        // Queue comment notification (question added as comment)
        await db.insert(outbox).values({
          event_type: 'ticket.comment_added',
          aggregate_type: 'ticket',
          aggregate_id: String(ticketId),
          payload: {
            ticketId: Number(ticketId),
            comment: question.trim(),
            commentedBy: String(dbUser.id),
            isInternal: false,
          },
        });
      } catch (outboxError: any) {
        logger.error(
          {
            error: outboxError?.message || String(outboxError),
            ticketId,
            userId: dbUser.id,
          },
          'Failed to queue question notifications (non-critical)'
        );
      }
    });

    const response = ApiResponse.success({
      message: 'Question sent to student successfully',
      ...result,
      activity: {
        ...result.activity,
        user_name: user?.full_name || 'Unknown',
      },
    });

    logger.info(
      {
        ticketId,
        userId: dbUser.id,
        questionLength: question.length,
      },
      'Question asked to student atomically'
    );

    return response;
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
      'Failed to ask question'
    );
    return handleApiError(error);
  }
}

