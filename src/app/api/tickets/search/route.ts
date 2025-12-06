/**
 * Ticket Search API
 * 
 * GET /api/tickets/search
 * Search tickets by title, description, ticket number
 */

import { NextRequest } from 'next/server';
import { requireDbUser, ApiResponse, getPaginationParams } from '@/lib/auth/helpers';
import { handleApiError, Errors } from '@/lib/errors';
import { getUserRole } from '@/lib/auth/roles';
import { db, tickets, users, ticket_statuses, categories } from '@/db';
import { eq, or, like, and, desc, sql } from 'drizzle-orm';
import { logger } from '@/lib/logger';
import { USER_ROLES } from '@/conf/constants';

export async function GET(req: NextRequest) {
  try {
    const { dbUser } = await requireDbUser();
    const role = await getUserRole(dbUser.id);

    const { searchParams } = req.nextUrl;
    const query = searchParams.get('q');

    if (!query || query.trim().length < 2) {
      throw Errors.validation('Search query must be at least 2 characters');
    }

    const { page, limit, offset } = getPaginationParams(searchParams);

    // Build search pattern
    const searchPattern = `%${query}%`;

    // Base query with role-based filtering
    let whereClause;
    if (role === USER_ROLES.STUDENT) {
      // Students only see their own tickets
      whereClause = and(
        eq(tickets.created_by, dbUser.id),
        or(
          like(tickets.title, searchPattern),
          like(tickets.description, searchPattern),
          like(tickets.ticket_number, searchPattern)
        )
      );
    } else {
      // Admins see all (could add scope filtering here)
      whereClause = or(
        like(tickets.title, searchPattern),
        like(tickets.description, searchPattern),
        like(tickets.ticket_number, searchPattern)
      );
    }

    // Get results
    const results = await db
      .select({
        id: tickets.id,
        ticket_number: tickets.ticket_number,
        title: tickets.title,
        description: tickets.description,
        status: ticket_statuses.value,
        status_label: ticket_statuses.label,
        category_name: categories.name,
        created_by_name: users.full_name,
        created_at: tickets.created_at,
        updated_at: tickets.updated_at,
      })
      .from(tickets)
      .leftJoin(users, eq(tickets.created_by, users.id))
      .leftJoin(ticket_statuses, eq(tickets.status_id, ticket_statuses.id))
      .leftJoin(categories, eq(tickets.category_id, categories.id))
      .where(whereClause)
      .orderBy(desc(tickets.created_at))
      .limit(limit)
      .offset(offset);

    // Get total count
    const [{ count }] = await db
      .select({
        count: sql<number>`count(*)::int`,
      })
      .from(tickets)
      .where(whereClause);

    logger.info(
      {
        userId: dbUser.id,
        query,
        results: results.length,
      },
      'Search executed'
    );

    return ApiResponse.success({
      tickets: results,
      pagination: {
        page,
        limit,
        total: Number(count),
        totalPages: Math.ceil(Number(count) / limit),
      },
      query,
    });
  } catch (error) {
    logger.error({ error }, 'Search failed');
    return handleApiError(error);
  }
}
