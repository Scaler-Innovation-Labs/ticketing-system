/**
 * Ticket Data Queries
 * 
 * Database queries for fetching ticket data
 */

import { db, tickets, ticket_statuses, categories, subcategories, users } from '@/db';
import { eq, and, desc, asc, ilike, sql, or } from 'drizzle-orm';

export interface TicketFilters {
    userId: string;
    search?: string;
    status?: string;
    escalated?: string;
    category?: string;
    subcategory?: string;
    dynamicFilters?: { key: string; value: string }[];
    sortBy?: string;
    page?: number;
    limit?: number;
}

export interface PaginationInfo {
    currentPage: number;
    totalPages: number;
    totalCount: number;
    hasNextPage: boolean;
    hasPrevPage: boolean;
    startIndex: number;
    endIndex: number;
}

/**
 * Get tickets for a student
 */
export async function getStudentTickets(filters: TicketFilters) {
    const {
        userId,
        search = '',
        status = '',
        escalated = '',
        category = '',
        subcategory = '',
        sortBy = 'newest',
        page = 1,
        limit = 12,
    } = filters;

    const offset = (page - 1) * limit;
    const conditions: any[] = [eq(tickets.created_by, userId)];

    // Add search filter
    if (search) {
        conditions.push(
            or(
                ilike(tickets.title, `%${search}%`),
                ilike(tickets.description, `%${search}%`),
                ilike(tickets.ticket_number, `%${search}%`)
            )
        );
    }

    // Add status filter - accepts either status_id (number) or status_value (string)
    if (status) {
        const statusId = parseInt(status, 10);
        if (!isNaN(statusId)) {
            // Numeric status ID
            conditions.push(eq(tickets.status_id, statusId));
        } else {
            // Status value string - join with ticket_statuses to filter by value
            conditions.push(eq(ticket_statuses.value, status.toLowerCase()));
        }
    }

    // Add escalated filter
    if (escalated === 'true') {
        conditions.push(sql`${tickets.escalation_level} > 0`);
    }

    // Add category filter - handle both ID (number) and slug (string)
    if (category) {
        const catId = parseInt(category, 10);
        if (!isNaN(catId)) {
            // Numeric category ID
            conditions.push(eq(tickets.category_id, catId));
        } else {
            // Category slug - need to join with categories table
            conditions.push(eq(categories.slug, category));
        }
    }

    // Add subcategory filter - handle both ID (number) and slug (string)
    if (subcategory) {
        const subId = parseInt(subcategory, 10);
        if (!isNaN(subId)) {
            // Numeric subcategory ID
            conditions.push(eq(tickets.subcategory_id, subId));
        } else {
            // Subcategory slug - need to join with subcategories table
            conditions.push(eq(subcategories.slug, subcategory));
        }
    }

    // Determine sort order
    const orderBy = sortBy === 'oldest'
        ? asc(tickets.created_at)
        : desc(tickets.created_at);

    // Check if we need joins for count query
    const needsStatusJoin = status && isNaN(parseInt(status, 10));
    const needsCategoryJoin = category && isNaN(parseInt(category, 10));
    const needsSubcategoryJoin = subcategory && isNaN(parseInt(subcategory, 10));
    const needsAnyJoin = needsStatusJoin || needsCategoryJoin || needsSubcategoryJoin;

    // Get total count - need JOINs if filtering by status value, category slug, or subcategory slug
    let totalCount = 0;
    if (needsAnyJoin) {
        let countQuery: any = db
            .select({ count: sql<number>`count(*)` })
            .from(tickets);
        
        if (needsStatusJoin) {
            countQuery = countQuery.leftJoin(ticket_statuses, eq(tickets.status_id, ticket_statuses.id));
        }
        if (needsCategoryJoin) {
            countQuery = countQuery.leftJoin(categories, eq(tickets.category_id, categories.id));
        }
        if (needsSubcategoryJoin) {
            countQuery = countQuery.leftJoin(subcategories, eq(tickets.subcategory_id, subcategories.id));
        }
        
        const countResult = await countQuery.where(and(...conditions));
        totalCount = Number(countResult[0]?.count || 0);
    } else {
        const countResult = await db
            .select({ count: sql<number>`count(*)` })
            .from(tickets)
            .where(and(...conditions));
        totalCount = Number(countResult[0]?.count || 0);
    }

    const totalPages = Math.ceil(totalCount / limit);

    // Get tickets
    const ticketList = await db
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
            status_color: ticket_statuses.color,
            category_id: tickets.category_id,
            category_name: categories.name,
            category_icon: categories.icon,
            subcategory_id: tickets.subcategory_id,
            subcategory_name: subcategories.name,
            escalation_level: tickets.escalation_level,
            created_by: tickets.created_by,
            creator_name: users.full_name,
            creator_email: users.email,
            resolution_due_at: tickets.resolution_due_at,
            created_at: tickets.created_at,
            updated_at: tickets.updated_at,
            resolved_at: tickets.resolved_at,
            closed_at: tickets.closed_at,
        })
        .from(tickets)
        .leftJoin(ticket_statuses, eq(tickets.status_id, ticket_statuses.id))
        .leftJoin(categories, eq(tickets.category_id, categories.id))
        .leftJoin(subcategories, eq(tickets.subcategory_id, subcategories.id))
        .leftJoin(users, eq(tickets.created_by, users.id))
        .where(and(...conditions))
        .orderBy(orderBy)
        .limit(limit)
        .offset(offset);

    return {
        tickets: ticketList,
        pagination: {
            currentPage: page,
            totalPages,
            totalCount,
            hasNextPage: page < totalPages,
            hasPrevPage: page > 1,
            startIndex: offset + 1,
            endIndex: Math.min(offset + limit, totalCount),
        },
    };
}

/**
 * Get ticket statistics for a user
 */
export async function getTicketStats(userId: string) {
    const result = await db
        .select({
            status_value: ticket_statuses.value,
            count: sql<number>`count(*)`,
        })
        .from(tickets)
        .leftJoin(ticket_statuses, eq(tickets.status_id, ticket_statuses.id))
        .where(eq(tickets.created_by, userId))
        .groupBy(ticket_statuses.value);

    // Get escalated count
    const escalatedResult = await db
        .select({ count: sql<number>`count(*)` })
        .from(tickets)
        .where(and(
            eq(tickets.created_by, userId),
            sql`${tickets.escalation_level} > 0`
        ));

    const escalatedCount = Number(escalatedResult[0]?.count || 0);

    const stats = {
        total: 0,
        open: 0,
        inProgress: 0,
        resolved: 0,
        closed: 0,
        awaitingStudent: 0,
        escalated: escalatedCount,
    };

    result.forEach((row) => {
        const count = Number(row.count);
        stats.total += count;

        switch (row.status_value) {
            case 'open':
                stats.open += count;
                break;
            case 'acknowledged':
            case 'in_progress':
                stats.inProgress += count;
                break;
            case 'awaiting_student_response':
            case 'awaiting_student':
                stats.awaitingStudent += count;
                break;
            case 'resolved':
                stats.resolved += count;
                break;
            case 'closed':
                stats.closed += count;
                break;
        }
    });

    return stats;
}
