/**
 * Ticket List Service
 * 
 * Handles listing and filtering tickets
 */

import { db, tickets, ticket_statuses, categories, subcategories, users } from '@/db';
import { eq, and, or, gte, lte, like, sql, desc } from 'drizzle-orm';
import type { TicketFilters } from '@/schemas/ticket';

interface PaginationOptions {
  page: number;
  limit: number;
  offset: number;
}

/**
 * List tickets with filters and pagination
 */
export async function listTickets(
  filters: TicketFilters,
  pagination: PaginationOptions
) {
  // Build where conditions
  const conditions = [];

  if (filters.status) {
    // Join with status table to filter by value
    const [status] = await db
      .select({ id: ticket_statuses.id })
      .from(ticket_statuses)
      .where(eq(ticket_statuses.value, filters.status))
      .limit(1);
    
    if (status) {
      conditions.push(eq(tickets.status_id, status.id));
    }
  }

  if (filters.category_id) {
    conditions.push(eq(tickets.category_id, filters.category_id));
  }

  if (filters.subcategory_id) {
    conditions.push(eq(tickets.subcategory_id, filters.subcategory_id));
  }

  if (filters.priority) {
    conditions.push(eq(tickets.priority, filters.priority));
  }

  if (filters.assigned_to) {
    conditions.push(eq(tickets.assigned_to, filters.assigned_to));
  }

  if (filters.created_by) {
    conditions.push(eq(tickets.created_by, filters.created_by));
  }

  if (filters.from_date) {
    conditions.push(gte(tickets.created_at, filters.from_date));
  }

  if (filters.to_date) {
    conditions.push(lte(tickets.created_at, filters.to_date));
  }

  if (filters.search) {
    conditions.push(
      or(
        like(tickets.title, `%${filters.search}%`),
        like(tickets.description, `%${filters.search}%`),
        like(tickets.ticket_number, `%${filters.search}%`)
      )!
    );
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  // Get total count
  const [countResult] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(tickets)
    .where(whereClause);

  const total = countResult?.count || 0;

  // Get tickets with relations
  const ticketsList = await db
    .select({
      ticket: {
        id: tickets.id,
        ticket_number: tickets.ticket_number,
        title: tickets.title,
        description: tickets.description,
        priority: tickets.priority,
        category_id: tickets.category_id,
        subcategory_id: tickets.subcategory_id,
        created_at: tickets.created_at,
        updated_at: tickets.updated_at,
        acknowledgement_due_at: tickets.acknowledgement_due_at,
        resolution_due_at: tickets.resolution_due_at,
      },
      status: {
        id: ticket_statuses.id,
        value: ticket_statuses.value,
        label: ticket_statuses.label,
      },
      category: {
        id: categories.id,
        name: categories.name,
        slug: categories.slug,
      },
      subcategory: {
        id: subcategories.id,
        name: subcategories.name,
        slug: subcategories.slug,
      },
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
    .where(whereClause)
    .orderBy(desc(tickets.created_at))
    .limit(pagination.limit)
    .offset(pagination.offset);

  return {
    tickets: ticketsList,
    total,
  };
}
