/**
 * Ticket Full Details API
 * 
 * GET - Get comprehensive ticket details including all related data
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/helpers';
import { db } from '@/db';
import {
  tickets,
  users,
  categories,
  subcategories,
  scopes,
  ticket_statuses,
  ticket_activity,
  ticket_comments,
  ticket_watchers,
  ticket_tags,
  ticket_attachments,
} from '@/db';
import { eq, desc } from 'drizzle-orm';
import { logger } from '@/lib/logger';
import { USER_ROLES } from '@/conf/constants';
import { Errors } from '@/lib/errors';

/**
 * GET /api/tickets/[id]/full
 * Get comprehensive ticket details with all related data
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { dbUser, role } = await getCurrentUser();

    const { id } = await params;
    const ticketId = parseInt(id, 10);

    if (isNaN(ticketId)) {
      return NextResponse.json(
        { error: 'Invalid ticket ID' },
        { status: 400 }
      );
    }

    // Get ticket with joins
    const [ticket] = await db
      .select({
        id: tickets.id,
        ticket_number: tickets.ticket_number,
        title: tickets.title,
        description: tickets.description,
        location: tickets.location,
        priority: tickets.priority,
        category_id: tickets.category_id,
        category_name: categories.name,
        subcategory_id: tickets.subcategory_id,
        subcategory_name: subcategories.name,
        scope_id: tickets.scope_id,
        scope_name: scopes.name,
        created_by: tickets.created_by,
        creator_name: users.full_name,
        creator_email: users.email,
        assigned_to: tickets.assigned_to,
        status_id: tickets.status_id,
        status_value: ticket_statuses.value,
        status_label: ticket_statuses.label,
        escalation_level: tickets.escalation_level,
        forward_count: tickets.forward_count,
        reopen_count: tickets.reopen_count,
        tat_extensions: tickets.tat_extensions,
        acknowledgement_due_at: tickets.acknowledgement_due_at,
        resolution_due_at: tickets.resolution_due_at,
        resolved_at: tickets.resolved_at,
        closed_at: tickets.closed_at,
        reopened_at: tickets.reopened_at,
        escalated_at: tickets.escalated_at,
        metadata: tickets.metadata,
        created_at: tickets.created_at,
        updated_at: tickets.updated_at,
      })
      .from(tickets)
      .leftJoin(users, eq(tickets.created_by, users.id))
      .leftJoin(categories, eq(tickets.category_id, categories.id))
      .leftJoin(subcategories, eq(tickets.subcategory_id, subcategories.id))
      .leftJoin(scopes, eq(tickets.scope_id, scopes.id))
      .leftJoin(ticket_statuses, eq(tickets.status_id, ticket_statuses.id))
      .where(eq(tickets.id, ticketId))
      .limit(1);

    if (!ticket) {
      return NextResponse.json(
        { error: 'Ticket not found' },
        { status: 404 }
      );
    }

    // Check ticket ownership for students
    if (role === USER_ROLES.STUDENT && ticket.created_by !== dbUser.id) {
      throw Errors.forbidden('You can only view your own tickets');
    }

    // Get assigned user if exists
    let assignedUser = null;
    if (ticket.assigned_to) {
      const [assignee] = await db
        .select({
          id: users.id,
          full_name: users.full_name,
          email: users.email,
        })
        .from(users)
        .where(eq(users.id, ticket.assigned_to))
        .limit(1);
      assignedUser = assignee || null;
    }

    // Get activity
    const activity = await db
      .select({
        id: ticket_activity.id,
        action: ticket_activity.action,
        details: ticket_activity.details,
        visibility: ticket_activity.visibility,
        created_at: ticket_activity.created_at,
        user_name: users.full_name,
      })
      .from(ticket_activity)
      .leftJoin(users, eq(ticket_activity.user_id, users.id))
      .where(eq(ticket_activity.ticket_id, ticketId))
      .orderBy(desc(ticket_activity.created_at))
      .limit(50);

    // Get comments
    const comments = await db
      .select({
        id: ticket_comments.id,
        comment: ticket_comments.comment,
        is_internal: ticket_comments.is_internal,
        created_at: ticket_comments.created_at,
        user_name: users.full_name,
      })
      .from(ticket_comments)
      .leftJoin(users, eq(ticket_comments.user_id, users.id))
      .where(eq(ticket_comments.ticket_id, ticketId))
      .orderBy(desc(ticket_comments.created_at));

    // Get watchers
    const watchers = await db
      .select({
        id: ticket_watchers.id,
        user_id: ticket_watchers.user_id,
        user_name: users.full_name,
        user_email: users.email,
      })
      .from(ticket_watchers)
      .leftJoin(users, eq(ticket_watchers.user_id, users.id))
      .where(eq(ticket_watchers.ticket_id, ticketId));

    // Get tags
    const tags = await db
      .select({
        id: ticket_tags.id,
        tag: ticket_tags.tag,
      })
      .from(ticket_tags)
      .where(eq(ticket_tags.ticket_id, ticketId));

    // Get attachments
    const attachments = await db
      .select()
      .from(ticket_attachments)
      .where(eq(ticket_attachments.ticket_id, ticketId));

    // Filter internal data for students
    const filteredActivity =
      role === 'student'
        ? activity.filter((a) => a.visibility === 'public')
        : activity;

    const filteredComments =
      role === 'student'
        ? comments.filter((c) => !c.is_internal)
        : comments;

    return NextResponse.json({
      ticket: {
        ...ticket,
        assigned_user: assignedUser,
      },
      activity: filteredActivity,
      comments: filteredComments,
      watchers,
      tags: tags.map((t) => t.tag),
      attachments,
    });
  } catch (error: any) {
    logger.error({ error: error.message || error }, 'Failed to get full ticket details');
    const status = error?.statusCode || error?.status || 500;
    const message = error?.message || 'Failed to get ticket details';
    return NextResponse.json(
      { error: message },
      { status }
    );
  }
}
