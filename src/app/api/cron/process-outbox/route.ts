/**
 * Cron Job - Process Notification Outbox
 * 
 * GET /api/cron/process-outbox - Process pending outbox events
 * 
 * Processes events from the outbox table and sends notifications via Slack/Email.
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { outbox, tickets, users, categories, subcategories, ticket_statuses, roles, admin_profiles, ticket_activity } from '@/db';
import { eq, and, lte, lt, desc } from 'drizzle-orm';
import { verifyCronAuth } from '@/lib/cron-auth';
import { logger } from '@/lib/logger';
import {
  notifyTicketCreated,
  notifyStatusUpdated,
  notifyTicketAssigned,
  NotificationContext,
  isEmailConfigured,
} from '@/lib/integrations';
import { notifyCommentEmail, notifyReassignmentEmail } from '@/lib/integrations/email';
import { ticket_integrations } from '@/db';

const BATCH_SIZE = 10;
const MAX_ATTEMPTS = 3;
const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

export async function GET(request: NextRequest) {
  // Verify cron auth
  const authError = verifyCronAuth(request);
  if (authError) {
    return authError;
  }

  try {
    let processed = 0;
    let errors = 0;
    const processedIds: number[] = [];
    const now = new Date();

    // Process events in batches
    while (processed < 50) {
      // Get pending events
      const events = await db
        .select()
        .from(outbox)
        .where(
          and(
            eq(outbox.status, 'pending'),
            lte(outbox.scheduled_at, now),
            lt(outbox.attempts, MAX_ATTEMPTS)
          )
        )
        .orderBy(outbox.priority, outbox.created_at)
        .limit(BATCH_SIZE);

      if (events.length === 0) {
        break;
      }

      for (const event of events) {
        try {
          // Mark as processing
          await db
            .update(outbox)
            .set({
              status: 'processing',
              processing_started_at: new Date(),
            })
            .where(eq(outbox.id, event.id));

          // Process the event
          await processEvent(event.event_type, event.payload as Record<string, any>);

          // Mark as completed
          await db
            .update(outbox)
            .set({
              status: 'completed',
              processed_at: new Date(),
            })
            .where(eq(outbox.id, event.id));

          processed++;
          processedIds.push(event.id);
        } catch (eventError: any) {
          errors++;
          const newAttempts = (event.attempts || 0) + 1;

          // Calculate exponential backoff
          const backoffMinutes = Math.pow(2, newAttempts);
          const nextRetry = new Date(Date.now() + backoffMinutes * 60 * 1000);

          // Update with error
          await db
            .update(outbox)
            .set({
              status: newAttempts >= MAX_ATTEMPTS ? 'dead_letter' : 'pending',
              attempts: newAttempts,
              last_error: eventError.message,
              scheduled_at: nextRetry,
            })
            .where(eq(outbox.id, event.id));

          logger.error(
            { eventId: event.id, eventType: event.event_type, error: eventError.message },
            'Failed to process outbox event'
          );
        }
      }
    }

    // Count remaining
    const remaining = await db
      .select()
      .from(outbox)
      .where(
        and(
          eq(outbox.status, 'pending'),
          lte(outbox.scheduled_at, now)
        )
      );

    logger.info(
      { processed, errors, unprocessed: remaining.length },
      'Outbox processing completed'
    );

    return NextResponse.json({
      success: true,
      processed,
      errors,
      unprocessed: remaining.length,
      processedIds,
      message: `Processed ${processed} events`,
    });
  } catch (error: any) {
    logger.error({ error: error.message }, 'Outbox processing error');
    return NextResponse.json(
      { error: 'Outbox processing failed', details: error.message },
      { status: 500 }
    );
  }
}

/**
 * Process individual outbox event
 */
async function processEvent(eventType: string, payload: Record<string, any>): Promise<void> {
  switch (eventType) {
    case 'ticket.created': {
      const ticketId = payload.ticketId as number;

      // Fetch ticket details with status and priority
      const [ticket] = await db
        .select({
          id: tickets.id,
          ticket_number: tickets.ticket_number,
          title: tickets.title,
          description: tickets.description,
          status_value: ticket_statuses.value,
          priority: tickets.priority,
          category_id: tickets.category_id,
          subcategory_id: tickets.subcategory_id,
          scope_id: tickets.scope_id,
          created_by: tickets.created_by,
          assigned_to: tickets.assigned_to,
          metadata: tickets.metadata,
        })
        .from(tickets)
        .leftJoin(ticket_statuses, eq(tickets.status_id, ticket_statuses.id))
        .where(eq(tickets.id, ticketId))
        .limit(1);

      if (!ticket) {
        logger.warn({ ticketId }, 'Ticket not found for notification');
        return;
      }

      // Get creator info
      const [creator] = ticket.created_by
        ? await db
          .select({ full_name: users.full_name, email: users.email })
          .from(users)
          .where(eq(users.id, ticket.created_by))
          .limit(1)
        : [null];

      // Get assignee info (including Slack user ID)
      const [assignee] = ticket.assigned_to
        ? await db
          .select({ 
            full_name: users.full_name, 
            email: users.email,
            slack_user_id: admin_profiles.slack_user_id
          })
          .from(users)
          .leftJoin(admin_profiles, eq(users.id, admin_profiles.user_id))
          .where(eq(users.id, ticket.assigned_to))
          .limit(1)
        : [null];

      // Get category
      const [category] = ticket.category_id
        ? await db
          .select({ name: categories.name })
          .from(categories)
          .where(eq(categories.id, ticket.category_id))
          .limit(1)
        : [null];

      // Get subcategory
      const [subcategory] = ticket.subcategory_id
        ? await db
          .select({ name: subcategories.name })
          .from(subcategories)
          .where(eq(subcategories.id, ticket.subcategory_id))
          .limit(1)
        : [null];

      // Determine the appropriate link based on who created the ticket
      // Students should see their own ticket page, admins see admin dashboard
      const [creatorRole] = ticket.created_by
        ? await db
          .select({ role_name: roles.name })
          .from(users)
          .innerJoin(roles, eq(users.role_id, roles.id))
          .where(eq(users.id, ticket.created_by))
          .limit(1)
        : [null];
      
      const ticketLink = creatorRole?.role_name === 'student'
        ? `${BASE_URL}/student/dashboard/ticket/${ticket.id}`
        : `${BASE_URL}/admin/dashboard/ticket/${ticket.id}`;

      const context: NotificationContext = {
        ticketId: ticket.id,
        ticketNumber: ticket.ticket_number || `TKT-${ticket.id}`,
        title: ticket.title || 'No title',
        description: ticket.description || '',
        category: category?.name || 'Uncategorized',
        categoryId: ticket.category_id || undefined,
        subcategoryId: ticket.subcategory_id || undefined,
        subcategory: subcategory?.name || undefined,
        scopeId: ticket.scope_id || undefined,
        status: ticket.status_value || 'open',
        priority: ticket.priority || 'medium',
        createdBy: creator?.full_name || 'Unknown',
        createdByEmail: creator?.email || '',
        assignedTo: assignee?.full_name || undefined,
        assignedToEmail: assignee?.email || undefined,
        assignedToSlackUserId: assignee?.slack_user_id || undefined,
        metadata: ticket.metadata as Record<string, any> | undefined,
        link: ticketLink,
      };

      await notifyTicketCreated(context);
      break;
    }

    case 'ticket.status_updated': {
      const { ticketId, oldStatus, newStatus, updatedBy } = payload;

      // Fetch ticket
      const [ticket] = await db
        .select({
          ticket_number: tickets.ticket_number,
          title: tickets.title,
          created_by: tickets.created_by,
        })
        .from(tickets)
        .where(eq(tickets.id, ticketId))
        .limit(1);

      if (!ticket) return;

      // Get student email
      const [student] = ticket.created_by
        ? await db
          .select({ email: users.email })
          .from(users)
          .where(eq(users.id, ticket.created_by))
          .limit(1)
        : [null];

      // Get updater info (name instead of just ID)
      const [updater] = updatedBy
        ? await db
          .select({ full_name: users.full_name })
          .from(users)
          .where(eq(users.id, updatedBy))
          .limit(1)
        : [null];

      // Get the most recent status change activity to check for comment
      const [recentActivity] = await db
        .select({
          details: ticket_activity.details,
        })
        .from(ticket_activity)
        .where(
          and(
            eq(ticket_activity.ticket_id, ticketId),
            eq(ticket_activity.action, 'status_changed')
          )
        )
        .orderBy(desc(ticket_activity.created_at))
        .limit(1);

      const comment = recentActivity?.details && typeof recentActivity.details === 'object' && 'comment' in recentActivity.details
        ? String((recentActivity.details as any).comment)
        : undefined;

      // Determine the appropriate link (student dashboard)
      const ticketLink = `${BASE_URL}/student/dashboard/ticket/${ticketId}`;

      await notifyStatusUpdated(
        ticketId,
        ticket.ticket_number || `TKT-${ticketId}`,
        ticket.title || '',
        oldStatus,
        newStatus,
        updater?.full_name || 'Admin',
        ticketLink,
        student?.email,
        comment
      );
      break;
    }

    case 'ticket.assigned': {
      const { ticketId, assignedTo, assignedBy, isForward } = payload;

      // Fetch ticket
      const [ticket] = await db
        .select({
          ticket_number: tickets.ticket_number,
          title: tickets.title,
          created_by: tickets.created_by,
        })
        .from(tickets)
        .where(eq(tickets.id, ticketId))
        .limit(1);

      if (!ticket) return;

      // Get assignee info
      const [assignee] = await db
        .select({ full_name: users.full_name, email: users.email })
        .from(users)
        .where(eq(users.id, assignedTo))
        .limit(1);

      if (!assignee) return;

      // Get assigned by info
      const [assignedByUser] = await db
        .select({ full_name: users.full_name })
        .from(users)
        .where(eq(users.id, assignedBy))
        .limit(1);

      // Get student email for threaded notification
      const [student] = ticket.created_by
        ? await db
          .select({ email: users.email })
          .from(users)
          .where(eq(users.id, ticket.created_by))
          .limit(1)
        : [null];

      // Get email thread ID for threading
      const [integration] = await db
        .select({ email_thread_id: ticket_integrations.email_thread_id })
        .from(ticket_integrations)
        .where(eq(ticket_integrations.ticket_id, ticketId))
        .limit(1);

      const inReplyTo = integration?.email_thread_id || undefined;
      const references = inReplyTo ? inReplyTo : undefined;
      const ticketLink = `${BASE_URL}/student/dashboard/ticket/${ticketId}`;

      // Send threaded email to student (reassignment/forward notification)
      if (student?.email && isEmailConfigured()) {
        try {
          await notifyReassignmentEmail(
            ticket.ticket_number || `TKT-${ticketId}`,
            ticket.title || '',
            isForward ? 'forwarded' : 'reassigned',
            assignee.full_name || 'Unknown',
            assignedByUser?.full_name || 'Unknown',
            ticketLink,
            student.email,
            payload.reason,
            inReplyTo,
            references
          );
        } catch (error: any) {
          logger.error({ error: error.message, ticketId }, 'Email reassignment notification failed');
        }
      }

      break;
    }

    case 'ticket.escalated': {
      // Similar pattern - fetch and notify
      logger.info({ payload }, 'Processing ticket.escalated');
      break;
    }

    case 'ticket.comment_added': {
      const { ticketId, comment, commentedBy, isInternal } = payload;

      // Only send email if comment is visible to student (not internal)
      if (isInternal) {
        logger.info({ ticketId }, 'Skipping email for internal comment');
        break;
      }

      // Fetch ticket
      const [ticket] = await db
        .select({
          ticket_number: tickets.ticket_number,
          title: tickets.title,
          created_by: tickets.created_by,
        })
        .from(tickets)
        .where(eq(tickets.id, ticketId))
        .limit(1);

      if (!ticket) return;

      // Get student email
      const [student] = ticket.created_by
        ? await db
          .select({ email: users.email })
          .from(users)
          .where(eq(users.id, ticket.created_by))
          .limit(1)
        : [null];

      if (!student?.email) return;

      // Get commenter info
      const [commenter] = await db
        .select({ full_name: users.full_name })
        .from(users)
        .where(eq(users.id, commentedBy))
        .limit(1);

      // Get email thread ID for threading
      const [integration] = await db
        .select({ email_thread_id: ticket_integrations.email_thread_id })
        .from(ticket_integrations)
        .where(eq(ticket_integrations.ticket_id, ticketId))
        .limit(1);

      const inReplyTo = integration?.email_thread_id || undefined;
      const references = inReplyTo ? inReplyTo : undefined;
      const ticketLink = `${BASE_URL}/student/dashboard/ticket/${ticketId}`;

      // Send threaded email to student
      if (isEmailConfigured()) {
        try {
          await notifyCommentEmail(
            ticket.ticket_number || `TKT-${ticketId}`,
            ticket.title || '',
            comment,
            commenter?.full_name || 'Admin',
            ticketLink,
            student.email,
            inReplyTo,
            references
          );
        } catch (error: any) {
          logger.error({ error: error.message, ticketId }, 'Email comment notification failed');
        }
      }
      break;
    }

    default:
      logger.warn({ eventType }, 'Unknown event type in outbox');
  }
}
