/**
 * Cached Queries
 * 
 * Provides cached database queries using React's cache() and Next.js unstable_cache
 */

import { cache } from 'react';
import { unstable_cache } from 'next/cache';
import { db, users, roles, ticket_statuses, tickets, categories } from '@/db';
import { eq, desc } from 'drizzle-orm';

/**
 * Get user from database by Clerk external ID (cached)
 */
export const getCachedUser = cache(async (clerkUserId: string) => {
    const [user] = await db
        .select({
            id: users.id,
            email: users.email,
            full_name: users.full_name,
            phone: users.phone,
            avatar_url: users.avatar_url,
            role_id: users.role_id,
            external_id: users.external_id,
        })
        .from(users)
        .where(eq(users.external_id, clerkUserId))
        .limit(1);

    return user || null;
});

/**
 * Get all ticket statuses (cached with revalidation)
 */
export const getCachedTicketStatuses = unstable_cache(
    async () => {
        const statuses = await db
            .select({
                id: ticket_statuses.id,
                value: ticket_statuses.value,
                label: ticket_statuses.label,
                description: ticket_statuses.description,
                color: ticket_statuses.color,
                progress_percent: ticket_statuses.progress_percent,
                is_active: ticket_statuses.is_active,
                display_order: ticket_statuses.display_order,
                is_final: ticket_statuses.is_final,
            })
            .from(ticket_statuses)
            .where(eq(ticket_statuses.is_active, true))
            .orderBy(ticket_statuses.display_order);

        return statuses;
    },
    ['ticket-statuses'],
    { revalidate: 3600 } // Cache for 1 hour
);

/**
 * Get user role by Clerk ID (cached)
 */
export const getCachedUserRole = cache(async (clerkUserId: string) => {
    const [user] = await db
        .select({
            roleName: roles.name,
        })
        .from(users)
        .leftJoin(roles, eq(users.role_id, roles.id))
        .where(eq(users.external_id, clerkUserId))
        .limit(1);

    return user?.roleName || 'student';
});

/**
 * Get admin user for dashboard (cached)
 * Returns object wrapper to match usage in dashboard-data.ts
 */
export const getCachedAdminUser = cache(async (clerkUserId: string) => {
    const [user] = await db
        .select({
            id: users.id,
            email: users.email,
            full_name: users.full_name,
            role_id: users.role_id,
        })
        .from(users)
        .where(eq(users.external_id, clerkUserId))
        .limit(1);

    return { dbUser: user || null };
});

/**
 * Get admin assignment (cached)
 * Stub implementation - returns null (no assignment restrictions)
 */
export const getCachedAdminAssignment = cache(async (userId: string): Promise<{ domain: string | null; scope: string | null }> => {
    return { domain: null, scope: null };
});

/**
 * Get all tickets for admin dashboard (cached)
 */
export const getCachedAdminTickets = unstable_cache(
    async (adminUserId: string, adminAssignment: any) => {
        const rows = await db
            .select({
                id: tickets.id,
                title: tickets.title,
                description: tickets.description,
                location: tickets.location,
                status_id: tickets.status_id,
                category_id: tickets.category_id,
                subcategory_id: tickets.subcategory_id,
                created_by: tickets.created_by,
                assigned_to: tickets.assigned_to,
                escalation_level: tickets.escalation_level,
                acknowledgement_due_at: tickets.acknowledgement_due_at,
                resolution_due_at: tickets.resolution_due_at,
                metadata: tickets.metadata,
                created_at: tickets.created_at,
                updated_at: tickets.updated_at,
                scope_id: tickets.scope_id,
                ticket_number: tickets.ticket_number,
                priority: tickets.priority,
                group_id: tickets.group_id,
                escalated_at: tickets.escalated_at,
                forward_count: tickets.forward_count,
                reopen_count: tickets.reopen_count,
                reopened_at: tickets.reopened_at,
                tat_extensions: tickets.tat_extensions,
                resolved_at: tickets.resolved_at,
                closed_at: tickets.closed_at,
                status_value: ticket_statuses.value,
                category_name: categories.name,
                creator_full_name: users.full_name,
                creator_email: users.email,
            })
            .from(tickets)
            .leftJoin(ticket_statuses, eq(tickets.status_id, ticket_statuses.id))
            .leftJoin(categories, eq(tickets.category_id, categories.id))
            .leftJoin(users, eq(tickets.created_by, users.id))
            .orderBy(desc(tickets.created_at));

        return rows;
    },
    ['admin-tickets'],
    { revalidate: 30, tags: ['tickets'] }
);

/**
 * Get tickets for committee dashboard (cached)
 */
export const getCachedCommitteeTickets = unstable_cache(
    async (userId: string) => {
        const rows = await db
            .select({
                id: tickets.id,
                title: tickets.title,
                description: tickets.description,
                location: tickets.location,
                status_id: tickets.status_id,
                category_id: tickets.category_id,
                subcategory_id: tickets.subcategory_id,
                created_by: tickets.created_by,
                assigned_to: tickets.assigned_to,
                escalation_level: tickets.escalation_level,
                acknowledgement_due_at: tickets.acknowledgement_due_at,
                resolution_due_at: tickets.resolution_due_at,
                metadata: tickets.metadata,
                created_at: tickets.created_at,
                updated_at: tickets.updated_at,
                scope_id: tickets.scope_id,
                ticket_number: tickets.ticket_number,
                priority: tickets.priority,
                group_id: tickets.group_id,
                escalated_at: tickets.escalated_at,
                forward_count: tickets.forward_count,
                reopen_count: tickets.reopen_count,
                reopened_at: tickets.reopened_at,
                tat_extensions: tickets.tat_extensions,
                resolved_at: tickets.resolved_at,
                closed_at: tickets.closed_at,
                status: ticket_statuses.value,
                category_name: categories.name,
                creator_full_name: users.full_name,
                creator_email: users.email,
            })
            .from(tickets)
            .leftJoin(ticket_statuses, eq(tickets.status_id, ticket_statuses.id))
            .leftJoin(categories, eq(tickets.category_id, categories.id))
            .leftJoin(users, eq(tickets.created_by, users.id))
            .orderBy(desc(tickets.created_at));

        return rows;
    },
    ['committee-tickets'],
    { revalidate: 30, tags: ['tickets'] }
);
