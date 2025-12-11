/**
 * Ticket Service
 * 
 * Business logic for ticket management
 */

import { db, tickets, ticket_activity, ticket_statuses, categories, subcategories, users, outbox, ticket_attachments, category_assignments, type DbTransaction } from '@/db';
import { eq, and, desc, gte, sql, or, isNull } from 'drizzle-orm';
import { LIMITS, TICKET_STATUS } from '@/conf/constants';
import { logger } from '@/lib/logger';
import { Errors } from '@/lib/errors';
import { withTransaction } from '@/lib/db-transaction';
import { validateTicketMetadata } from './category-fields-service';
import { resolveTicketScope } from './scope-service';
import type { CreateTicketInput } from '@/schemas/ticket';
import { findBestAssignee, hasMatchingAssignment } from '@/lib/assignment/assignment-service';

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
 * Returns category with all fields needed for ticket creation (including scope_mode, scope_id)
 */
export async function validateCategoryAndSubcategory(
  categoryId: number,
  subcategoryId?: number
): Promise<{ category: any; subcategory?: any }> {
  // Check category exists and is active - select all fields including scope fields
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
 * Calculate SLA deadlines (excluding weekends)
 */
export function calculateDeadlines(slaHours: number) {
  const { calculateDeadlinesWithBusinessHours } = require('./utils/tat-calculator');
  return calculateDeadlinesWithBusinessHours(slaHours);
}

/**
 * Find the best assignee for a category
 * Priority: 1. Primary assignment, 2. Any assignment, 3. Default admin, 4. Null
 */
async function findCategoryAssignee(
  categoryId: number,
  defaultAdminId: string | null,
  txn?: DbTransaction
): Promise<string | null> {
  try {
    const dbInstance = txn || db;

    // Priority 1: Find primary assignment (assignment_type = 'primary')
    const [primaryAssignment] = await dbInstance
      .select({ user_id: category_assignments.user_id })
      .from(category_assignments)
      .where(
        and(
          eq(category_assignments.category_id, categoryId),
          eq(category_assignments.assignment_type, 'primary')
        )
      )
      .limit(1);

    if (primaryAssignment) {
      return primaryAssignment.user_id;
    }

    // Priority 2: Find any assignment (first one found)
    const [anyAssignment] = await dbInstance
      .select({ user_id: category_assignments.user_id })
      .from(category_assignments)
      .where(eq(category_assignments.category_id, categoryId))
      .limit(1);

    if (anyAssignment) {
      return anyAssignment.user_id;
    }

    // Priority 3: Use default admin from category
    return defaultAdminId;
  } catch (error) {
    logger.error({ error, categoryId }, 'Error finding category assignee');
    // Fallback to default admin on error
    return defaultAdminId;
  }
}

/**
 * Create a new ticket
 */
export async function createTicket(
  userId: string,
  input: CreateTicketInput
) {
  // 1. Check rate limit (outside transaction for better performance)
  await checkTicketRateLimit(userId);

  return withTransaction(async (txn) => {
    // 2. Run independent queries in parallel for better performance
    const [categoryValidationResult, openStatusId] = await Promise.all([
      validateCategoryAndSubcategory(input.category_id, input.subcategory_id),
      getStatusId(TICKET_STATUS.OPEN),
    ]);

    const { category, subcategory } = categoryValidationResult;

    // 2.5. Validate metadata and resolve scope in parallel (both depend on category)
    // Pass category data to resolveTicketScope to avoid duplicate query
    const [metadataValidation, resolvedScopeId] = await Promise.all([
      input.subcategory_id && input.metadata
        ? validateTicketMetadata(input.subcategory_id, input.metadata)
        : Promise.resolve({ valid: true, errors: [] }),
      resolveTicketScope(input.category_id, userId, {
        scope_id: category.scope_id,
        scope_mode: category.scope_mode,
      }),
    ]);

    if (!metadataValidation.valid) {
      throw Errors.validation(
        'Invalid ticket metadata',
        { errors: metadataValidation.errors }
      );
    }

    // 3. Calculate deadlines based on SLA
    const deadlines = calculateDeadlines(category.sla_hours || 48);

    // 4.5. Find best assignee - OPTIMIZED: run all queries in parallel
    // Priority: 1) Inline subcategory admin, 2) Domain/scope rules, 3) Category assignments
    const ticketScopeId = resolvedScopeId || category.scope_id || null;

    // Build parallel query promises based on conditions
    const assignmentPromises: Promise<{ type: string; result: string | null | boolean }>[] = [];

    // Query 1: Check inline assignee scope match (if needed)
    if (subcategory?.assigned_admin_id && ticketScopeId && category.domain_id) {
      assignmentPromises.push(
        hasMatchingAssignment({
          user_id: subcategory.assigned_admin_id,
          domain_id: category.domain_id,
          scope_id: ticketScopeId,
        }).then(result => ({ type: 'inlineMatch', result }))
      );
    }

    // Query 2: Find rule-based assignee (if domain + scope exist)
    if (category.domain_id && ticketScopeId) {
      assignmentPromises.push(
        findBestAssignee({
          domain_id: category.domain_id,
          scope_id: ticketScopeId,
        }).then(result => ({ type: 'ruleBased', result }))
      );
    }

    // Query 3: Find category assignee (if no scope)
    if (!ticketScopeId) {
      assignmentPromises.push(
        findCategoryAssignee(input.category_id, category.default_admin_id, txn)
          .then(result => ({ type: 'category', result }))
      );
    }

    // Run all queries in parallel
    const assignmentResults = await Promise.all(assignmentPromises);

    // Process results in priority order
    let assignedTo: string | null = null;

    // Priority 1: Inline subcategory admin (if scope matched)
    if (subcategory?.assigned_admin_id) {
      if (!ticketScopeId || !category.domain_id) {
        // No scope check needed
        assignedTo = subcategory.assigned_admin_id;
      } else {
        const inlineMatch = assignmentResults.find(r => r.type === 'inlineMatch');
        if (inlineMatch?.result === true) {
          assignedTo = subcategory.assigned_admin_id;
        }
      }
    }

    // Priority 2: Rule-based assignee
    if (!assignedTo) {
      const ruleBased = assignmentResults.find(r => r.type === 'ruleBased');
      if (ruleBased?.result && typeof ruleBased.result === 'string') {
        assignedTo = ruleBased.result;
      }
    }

    // Priority 3: Category assignee
    if (!assignedTo) {
      const categoryResult = assignmentResults.find(r => r.type === 'category');
      if (categoryResult?.result && typeof categoryResult.result === 'string') {
        assignedTo = categoryResult.result;
      }
    }

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
        assigned_to: assignedTo,
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
