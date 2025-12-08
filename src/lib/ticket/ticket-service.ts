/**
 * Ticket Service
 * 
 * Business logic for ticket management
 */

import { db, tickets, ticket_activity, ticket_statuses, categories, subcategories, users, outbox, ticket_attachments } from '@/db';
import { eq, and, desc, gte, sql } from 'drizzle-orm';
import { LIMITS, TICKET_STATUS } from '@/conf/constants';
import { logger } from '@/lib/logger';
import { Errors } from '@/lib/errors';
import { withTransaction } from '@/lib/db-transaction';
import { validateTicketMetadata } from './category-fields-service';
import { resolveTicketScope } from './scope-service';
import type { CreateTicketInput } from '@/schemas/ticket';

// Cache for status IDs
const statusIdCache = new Map<string, number>();

/**
 * Get status ID by value (with caching)
 */
export async function getStatusId(statusValue: string): Promise<number> {
  // Check cache
  if (statusIdCache.has(statusValue)) {
    return statusIdCache.get(statusValue)!;
  }

  // Query database
  const [status] = await db
    .select({ id: ticket_statuses.id })
    .from(ticket_statuses)
    .where(eq(ticket_statuses.value, statusValue))
    .limit(1);

  if (!status) {
    throw Errors.notFound('Status', statusValue);
  }

  // Cache it
  statusIdCache.set(statusValue, status.id);
  return status.id;
}

/**
 * Check if user has exceeded weekly ticket limit
 */
export async function checkTicketRateLimit(userId: string): Promise<void> {
  const oneWeekAgo = new Date();
  oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

  const recentTickets = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(tickets)
    .where(
      and(
        eq(tickets.created_by, userId),
        gte(tickets.created_at, oneWeekAgo)
      )
    );

  const count = recentTickets[0]?.count || 0;

  if (count >= LIMITS.WEEKLY_TICKET_LIMIT) {
    logger.warn({ userId, count }, 'User exceeded weekly ticket limit');
    throw Errors.weeklyLimitExceeded(0, new Date(oneWeekAgo.getTime() + 7 * 24 * 60 * 60 * 1000));
  }
}

/**
 * Validate category and subcategory
 */
export async function validateCategoryAndSubcategory(
  categoryId: number,
  subcategoryId?: number
): Promise<{ category: any; subcategory?: any }> {
  // Check category exists and is active
  const [category] = await db
    .select()
    .from(categories)
    .where(
      and(
        eq(categories.id, categoryId),
        eq(categories.is_active, true)
      )
    )
    .limit(1);

  if (!category) {
    throw Errors.notFound('Category', String(categoryId));
  }

  // If subcategory provided, validate it
  let subcategory;
  if (subcategoryId) {
    const [sub] = await db
      .select()
      .from(subcategories)
      .where(
        and(
          eq(subcategories.id, subcategoryId),
          eq(subcategories.category_id, categoryId),
          eq(subcategories.is_active, true)
        )
      )
      .limit(1);

    if (!sub) {
      throw Errors.validation(
        `Subcategory ${subcategoryId} does not belong to category ${categoryId}`
      );
    }

    subcategory = sub;
  }

  return { category, subcategory };
}

/**
 * Calculate SLA deadlines
 */
export function calculateDeadlines(slaHours: number) {
  const now = new Date();

  // Acknowledgement: 10% of SLA time
  const acknowledgementDue = new Date(now);
  acknowledgementDue.setHours(acknowledgementDue.getHours() + Math.ceil(slaHours * 0.1));

  // Resolution: full SLA time
  const resolutionDue = new Date(now);
  resolutionDue.setHours(resolutionDue.getHours() + slaHours);

  return {
    acknowledgement_due_at: acknowledgementDue,
    resolution_due_at: resolutionDue,
  };
}

/**
 * Create a new ticket
 */
export async function createTicket(
  userId: string,
  input: CreateTicketInput
) {
  return withTransaction(async (txn) => {
    // 1. Check rate limit
    await checkTicketRateLimit(userId);

    // 2. Validate category and subcategory
    const { category, subcategory } = await validateCategoryAndSubcategory(
      input.category_id,
      input.subcategory_id
    );

    // 2.5. Validate metadata against category fields if subcategory provided
    if (input.subcategory_id && input.metadata) {
      const metadataValidation = await validateTicketMetadata(
        input.subcategory_id,
        input.metadata
      );

      if (!metadataValidation.valid) {
        throw Errors.validation(
          'Invalid ticket metadata',
          { errors: metadataValidation.errors }
        );
      }
    }

    // 3. Calculate deadlines based on SLA
    const deadlines = calculateDeadlines(category.sla_hours || 48);

    // 3.5. Resolve scope for ticket
    const resolvedScopeId = await resolveTicketScope(input.category_id, userId);

    // 4. Get status ID for 'open'
    const openStatusId = await getStatusId(TICKET_STATUS.OPEN);

    // 5. Create ticket
    const [ticket] = await txn
      .insert(tickets)
      .values({
        ticket_number: `TKT-${Date.now()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`,
        title: input.title,
        description: input.description,
        category_id: input.category_id,
        subcategory_id: input.subcategory_id,
        scope_id: resolvedScopeId,
        status_id: openStatusId,
        priority: input.priority || 'medium',
        created_by: userId,
        assigned_to: category.default_admin_id || null,
        metadata: input.metadata || {},
        attachments: input.attachments || [],
        ...deadlines,
      })
      .returning();

    // 6. Insert attachments into ticket_attachments table
    if (input.attachments && input.attachments.length > 0) {
      await txn.insert(ticket_attachments).values(
        input.attachments.map((attachment) => ({
          ticket_id: ticket.id,
          uploaded_by: userId,
          file_name: attachment.filename,
          file_url: attachment.url,
          file_size: attachment.size,
          mime_type: attachment.mime_type,
        }))
      );
    }

    // 7. Log activity
    await txn.insert(ticket_activity).values({
      ticket_id: ticket.id,
      user_id: userId,
      action: 'created',
      details: {
        title: ticket.title,
        category_id: ticket.category_id,
        subcategory_id: ticket.subcategory_id,
        priority: ticket.priority,
      },
    });

    // 7. Queue notification
    await txn.insert(outbox).values({
      event_type: 'ticket.created',
      aggregate_type: 'ticket',
      aggregate_id: String(ticket.id),
      payload: { ticketId: ticket.id },
    });

    logger.info(
      {
        ticketId: ticket.id,
        ticketNumber: ticket.ticket_number,
        userId,
        categoryId: input.category_id,
      },
      'Ticket created'
    );

    return ticket;
  });
}

/**
 * Get ticket by ID with relations
 */
export async function getTicketById(ticketId: number) {
  const [ticket] = await db
    .select({
      ticket: tickets,
      status: {
        id: ticket_statuses.id,
        value: ticket_statuses.value,
        label: ticket_statuses.label,
        color: ticket_statuses.color,
      },
      category: categories,
      subcategory: subcategories,
      creator: {
        id: users.id,
        email: users.email,
        full_name: users.full_name,
        avatar_url: users.avatar_url,
      },
    })
    .from(tickets)
    .leftJoin(ticket_statuses, eq(tickets.status_id, ticket_statuses.id))
    .leftJoin(categories, eq(tickets.category_id, categories.id))
    .leftJoin(subcategories, eq(tickets.subcategory_id, subcategories.id))
    .leftJoin(users, eq(tickets.created_by, users.id))
    .where(eq(tickets.id, ticketId))
    .limit(1);

  if (!ticket) {
    throw Errors.notFound('Ticket', String(ticketId));
  }

  return ticket;
}

/**
 * Get ticket activity history
 */
export async function getTicketActivity(ticketId: number) {
  const activities = await db
    .select({
      activity: ticket_activity,
      user: {
        id: users.id,
        email: users.email,
        full_name: users.full_name,
        avatar_url: users.avatar_url,
      },
    })
    .from(ticket_activity)
    .leftJoin(users, eq(ticket_activity.user_id, users.id))
    .where(eq(ticket_activity.ticket_id, ticketId))
    .orderBy(desc(ticket_activity.created_at));

  return activities;
}
