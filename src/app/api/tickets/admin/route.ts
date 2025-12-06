/**
 * Admin Ticket Listing API
 * 
 * GET - Get tickets for admin dashboard with filters and pagination
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth/helpers';
import { db } from '@/db';
import { tickets, users, categories, ticket_statuses, scopes } from '@/db';
import { desc, eq, and, or, sql, isNull } from 'drizzle-orm';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

/**
 * GET /api/tickets/admin
 * Get admin ticket listing with filters
 */
export async function GET(request: NextRequest) {
  try {
    const { dbUser, role } = await requireRole(['admin', 'super_admin']);

    const { searchParams } = new URL(request.url);
    const page = Number(searchParams.get('page') || 1);
    const limit = Number(searchParams.get('limit') || 20);
    const offset = (page - 1) * limit;
    const status = searchParams.get('status') || '';
    const category = searchParams.get('category') || '';
    const assignedTo = searchParams.get('assignedTo') || '';
    const search = searchParams.get('search') || '';
    const scopeId = searchParams.get('scope') || '';

    // Build filters
    const filters = [];

    if (status) {
      const [statusRow] = await db
        .select({ id: ticket_statuses.id })
        .from(ticket_statuses)
        .where(eq(ticket_statuses.value, status))
        .limit(1);
      if (statusRow) {
        filters.push(eq(tickets.status_id, statusRow.id));
      }
    }

    if (category) {
      filters.push(eq(tickets.category_id, Number(category)));
    }

    if (assignedTo) {
      filters.push(eq(tickets.assigned_to, assignedTo));
    }

    if (scopeId) {
      filters.push(eq(tickets.scope_id, Number(scopeId)));
    }

    if (search) {
      filters.push(
        or(
          sql`${tickets.description} ILIKE ${`%${search}%`}`,
          sql`${tickets.location} ILIKE ${`%${search}%`}`
        )
      );
    }

    // Role-based filtering
    if (role === 'admin') {
      // Admins see assigned tickets + unassigned
      filters.push(
        or(
          eq(tickets.assigned_to, dbUser.id),
          isNull(tickets.assigned_to)
        )
      );
    }

    // Get tickets with joins
    const ticketsList = await db
      .select({
        id: tickets.id,
        ticket_number: tickets.ticket_number,
        title: tickets.title,
        description: tickets.description,
        location: tickets.location,
        priority: tickets.priority,
        status_id: tickets.status_id,
        status_value: ticket_statuses.value,
        status_label: ticket_statuses.label,
        category_id: tickets.category_id,
        category_name: categories.name,
        subcategory_id: tickets.subcategory_id,
        scope_id: tickets.scope_id,
        scope_name: scopes.name,
        assigned_to: tickets.assigned_to,
        assigned_user_name: users.full_name,
        assigned_user_email: users.email,
        created_by: tickets.created_by,
        escalation_level: tickets.escalation_level,
        acknowledgement_due_at: tickets.acknowledgement_due_at,
        resolution_due_at: tickets.resolution_due_at,
        created_at: tickets.created_at,
        updated_at: tickets.updated_at,
      })
      .from(tickets)
      .leftJoin(ticket_statuses, eq(tickets.status_id, ticket_statuses.id))
      .leftJoin(categories, eq(tickets.category_id, categories.id))
      .leftJoin(scopes, eq(tickets.scope_id, scopes.id))
      .leftJoin(users, eq(tickets.assigned_to, users.id))
      .where(filters.length > 0 ? and(...filters) : undefined)
      .orderBy(desc(tickets.created_at))
      .limit(limit)
      .offset(offset);

    // Get total count
    const [{ total }] = await db
      .select({ total: sql<number>`COUNT(*)` })
      .from(tickets)
      .where(filters.length > 0 ? and(...filters) : undefined);

    return NextResponse.json({
      tickets: ticketsList,
      pagination: {
        page,
        limit,
        total: Number(total),
        pages: Math.ceil(Number(total) / limit),
      },
    });
  } catch (error: any) {
    logger.error({ error: error.message }, 'Failed to fetch admin tickets');
    return NextResponse.json(
      { error: error.message || 'Failed to fetch tickets' },
      { status: error.status || 500 }
    );
  }
}
