/**
 * Ticket Data Queries
 * 
 * Database queries for fetching ticket data
 */

import { db, tickets, ticket_statuses, categories, subcategories, users } from '@/db';
import { eq, and, desc, asc, ilike, sql, or } from 'drizzle-orm';
import { cache } from 'react';
import { unstable_cache } from 'next/cache';

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
 * OPTIMIZATION: Wrapped in React cache() for request-level deduplication
 */
const getStudentTicketsCached = cache(async (filters: TicketFilters) => {
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

    // OPTIMIZATION: Run count and ticket queries in parallel when possible
    // Check if we need joins for count query
    const needsStatusJoin = status && isNaN(parseInt(status, 10));
    const needsCategoryJoin = category && isNaN(parseInt(category, 10));
    const needsSubcategoryJoin = subcategory && isNaN(parseInt(subcategory, 10));
    const needsAnyJoin = needsStatusJoin || needsCategoryJoin || needsSubcategoryJoin;

    // Build count query
    const buildCountQuery = () => {
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
        
            return countQuery.where(and(...conditions));
    } else {
            return db
            .select({ count: sql<number>`count(*)` })
            .from(tickets)
            .where(and(...conditions));
        }
    };

    // Build ticket list query
    // OPTIMIZATION: Select only list fields - keep description for display in ticket cards
    const buildTicketQuery = () => db
        .select({
            id: tickets.id,
            ticket_number: tickets.ticket_number,
            title: tickets.title,
            description: tickets.description, // Needed for ticket card display
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

    // Import retry utility for connection timeout handling
    const { withRetry } = await import('@/lib/db-transaction');
    
    // OPTIMIZATION: Run count and ticket queries in parallel with retry logic
    const [countResult, ticketList] = await Promise.all([
        withRetry(
            () => buildCountQuery(),
            {
                maxAttempts: 3,
                delayMs: 200,
            }
        ),
        withRetry(
            () => buildTicketQuery(),
            {
                maxAttempts: 3,
                delayMs: 200,
            }
        ),
    ]);

    const totalCount = Number(countResult[0]?.count || 0);
    const totalPages = Math.ceil(totalCount / limit);

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
});

// Export with unstable_cache for cross-request caching and tag-based revalidation
export async function getStudentTickets(filters: TicketFilters) {
    const cacheKey = `student-tickets-${filters.userId}-${filters.page}-${filters.status}-${filters.category}-${filters.search}`;
    return unstable_cache(
        async () => {
            try {
                return await getStudentTicketsCached(filters);
            } catch (error: any) {
                // If query fails after retries, return empty result to prevent page crash
                const { logger } = await import('@/lib/logger');
                logger.warn(
                    { 
                        error: error?.message || String(error),
                        userId: filters.userId,
                        code: error?.code,
                        errno: error?.errno 
                    },
                    'Failed to fetch student tickets, returning empty result'
                );
                
                // Return empty result so the page can still render
                return {
                    tickets: [],
                    pagination: {
                        currentPage: filters.page || 1,
                        totalPages: 0,
                        totalCount: 0,
                        hasNextPage: false,
                        hasPrevPage: false,
                        startIndex: 0,
                        endIndex: 0,
                    },
                };
            }
        },
        [cacheKey],
        {
            revalidate: 30, // 30 seconds - balance between freshness and performance for frequently accessed page
            tags: [`student-tickets:${filters.userId}`, `tickets`],
        }
    )();
}

/**
 * Get ticket statistics for a user
 * OPTIMIZATION: Parallelize status count and escalated count queries
 * OPTIMIZATION: Wrapped in React cache() for request-level deduplication
 * OPTIMIZATION: Added retry logic for connection timeout errors
 */
const getTicketStatsCached = cache(async (userId: string) => {
    // Import retry utility
    const { withRetry } = await import('@/lib/db-transaction');
    
    // OPTIMIZATION: Run both queries in parallel with retry logic
    const [result, escalatedResult] = await Promise.all([
        // Get status counts (with retry on connection errors)
        withRetry(
            () => db
                .select({
                    status_value: ticket_statuses.value,
                    count: sql<number>`count(*)`,
                })
                .from(tickets)
                .leftJoin(ticket_statuses, eq(tickets.status_id, ticket_statuses.id))
                .where(eq(tickets.created_by, userId))
                .groupBy(ticket_statuses.value),
            {
                maxAttempts: 3,
                delayMs: 200, // Start with 200ms delay
            }
        ),

        // Get escalated count (parallelized, with retry)
        withRetry(
            () => db
                .select({ count: sql<number>`count(*)` })
                .from(tickets)
                .where(and(
                    eq(tickets.created_by, userId),
                    sql`${tickets.escalation_level} > 0`
                )),
            {
                maxAttempts: 3,
                delayMs: 200,
            }
        ),
    ]);

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
});

// Export with unstable_cache for cross-request caching and tag-based revalidation
export async function getTicketStats(userId: string) {
    return unstable_cache(
        async () => {
            try {
                return await getTicketStatsCached(userId);
            } catch (error: any) {
                // If query fails after retries, return default stats to prevent page crash
                // This can happen during connection timeouts or database issues
                const { logger } = await import('@/lib/logger');
                logger.warn(
                    { 
                        error: error?.message || String(error),
                        userId,
                        code: error?.code,
                        errno: error?.errno 
                    },
                    'Failed to fetch ticket stats, returning defaults'
                );
                
                // Return default stats so the page can still render
                return {
                    total: 0,
                    open: 0,
                    inProgress: 0,
                    resolved: 0,
                    closed: 0,
                    awaitingStudent: 0,
                    escalated: 0,
                };
            }
        },
        [`student-stats-${userId}`],
        {
            revalidate: 30, // 30 seconds - balance between freshness and performance for frequently accessed page
            tags: [`student-stats:${userId}`, `tickets`],
        }
    )();
}
