/**
 * Cached Queries
 * 
 * Provides cached database queries using React's cache() and Next.js unstable_cache
 * 
 * Caching Strategy:
 * - React cache() for request-level deduplication (same request, multiple calls)
 * - unstable_cache for persistent caching across requests
 * - Cache tags for selective invalidation
 * - TTLs based on data volatility
 */

import { cache } from 'react';
import { unstable_cache } from 'next/cache';
import { db, users, roles, ticket_statuses, tickets, categories, admin_profiles, hostels, batches, class_sections, domains, scopes, subcategories, category_fields, field_options, committees, ticket_committee_tags } from '@/db';
import { eq, desc, and, inArray, or, sql } from 'drizzle-orm';
import { CACHE_TTL } from '@/conf/constants';

// ============================================
// User & Role Caching
// ============================================

/**
 * Get user from database by Clerk external ID (cached)
 * Uses React cache() for request-level deduplication
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
    try {
        const [user] = await db
            .select({
                id: users.id,
                email: users.email,
                full_name: users.full_name,
                role_id: users.role_id,
                roleName: roles.name,
                primary_domain_id: admin_profiles.primary_domain_id,
            })
            .from(users)
            .leftJoin(roles, eq(users.role_id, roles.id))
            .leftJoin(admin_profiles, eq(admin_profiles.user_id, users.id))
            .where(eq(users.external_id, clerkUserId))
            .limit(1);

        return { dbUser: user || null };
    } catch (error) {
        // Fallback if admin_profiles table/columns are unavailable
        const [user] = await db
            .select({
                id: users.id,
                email: users.email,
                full_name: users.full_name,
                role_id: users.role_id,
                roleName: roles.name,
            })
            .from(users)
            .leftJoin(roles, eq(users.role_id, roles.id))
            .where(eq(users.external_id, clerkUserId))
            .limit(1);

        return { dbUser: user ? { ...user, primary_domain_id: null } : null };
    }
});

/**
 * Get admin assignment (cached)
 * Stub implementation - returns null (no assignment restrictions)
 */
export const getCachedAdminAssignment = cache(async (userId: string): Promise<{ domain: string | null; scope: string | null }> => {
    return { domain: null, scope: null };
});

// ============================================
// Ticket Status Caching
// ============================================

/**
 * Get all ticket statuses (cached with revalidation)
 * Cache for 1 hour, invalidate with 'ticket-statuses' tag
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
    {
        revalidate: CACHE_TTL.TICKET_STATUS / 1000, // Convert ms to seconds
        tags: ['ticket-statuses']
    }
);

// ============================================
// Category & Subcategory Caching
// ============================================

/**
 * Get all active categories with subcategories and fields (cached)
 * Cache for 1 hour, invalidate with 'categories' tag
 */
export const getCachedCategoriesHierarchy = unstable_cache(
    async () => {
        // Fetch categories
        const cats = await db
            .select({
                id: categories.id,
                name: categories.name,
                slug: categories.slug,
                description: categories.description,
                icon: categories.icon,
                color: categories.color,
                sla_hours: categories.sla_hours,
                domain_id: categories.domain_id,
                scope_id: categories.scope_id,
                display_order: categories.display_order,
            })
            .from(categories)
            .where(eq(categories.is_active, true))
            .orderBy(categories.display_order);

        if (cats.length === 0) return [];

        // Fetch subcategories
        const subcats = await db
            .select()
            .from(subcategories)
            .where(
                and(
                    inArray(subcategories.category_id, cats.map(c => c.id)),
                    eq(subcategories.is_active, true)
                )
            )
            .orderBy(subcategories.display_order);

        // Fetch fields
        const subcatIds = subcats.map(s => s.id);
        const fields = subcatIds.length > 0 ? await db
            .select({
                id: category_fields.id,
                subcategory_id: category_fields.subcategory_id,
                name: category_fields.name,
                slug: category_fields.slug,
                field_type: category_fields.field_type,
                required: category_fields.required,
                placeholder: category_fields.placeholder,
                options: category_fields.options,
                validation: category_fields.validation,
                display_order: category_fields.display_order,
                is_active: category_fields.is_active,
                // assigned_admin_id is optional - only select if it exists in schema
            })
            .from(category_fields)
            .where(
                and(
                    inArray(category_fields.subcategory_id, subcatIds),
                    eq(category_fields.is_active, true)
                )
            )
            .orderBy(category_fields.display_order) : [];

        // Fetch field options
        const fieldIds = fields.map(f => f.id);
        const options = fieldIds.length > 0 ? await db
            .select()
            .from(field_options)
            .where(inArray(field_options.field_id, fieldIds))
            .orderBy(field_options.display_order) : [];

        // Build nested structure
        return cats.map(cat => ({
            id: cat.id,
            value: cat.slug || '',
            label: cat.name || '',
            name: cat.name || '',
            slug: cat.slug || '',
            description: cat.description || null,
            icon: cat.icon || null,
            color: cat.color || null,
            domain_id: cat.domain_id || null,
            scope_id: cat.scope_id || null,
            sla_hours: cat.sla_hours || null,
            display_order: cat.display_order ?? null,
            subcategories: subcats
                .filter(s => s.category_id === cat.id)
                .map(sub => ({
                    id: sub.id,
                    value: sub.slug || '',
                    label: sub.name || '',
                    name: sub.name || '',
                    slug: sub.slug || '',
                    description: sub.description || null,
                    display_order: sub.display_order ?? 0,
                    category_id: sub.category_id,
                    fields: fields
                        .filter(f => f.subcategory_id === sub.id)
                        .map(field => ({
                            id: field.id,
                            name: field.name || '',
                            slug: field.slug || '',
                            type: field.field_type || 'text',
                            required: field.required ?? false,
                            placeholder: field.placeholder || null,
                            help_text: null,
                            validation_rules: field.validation || null,
                            display_order: field.display_order || 0,
                            options: options
                                .filter(o => o.field_id === field.id)
                                .map((opt, idx) => ({
                                    id: opt.id || idx,
                                    label: opt.label || opt.value || '',
                                    value: opt.value || '',
                                })),
                        })),
                })),
        }));
    },
    ['categories-hierarchy'],
    {
        revalidate: CACHE_TTL.CATEGORY_LIST / 1000, // Convert ms to seconds
        tags: ['categories', 'subcategories', 'category-fields']
    }
);

/**
 * Get simple categories list (without fields) - cached
 */
export const getCachedCategories = unstable_cache(
    async () => {
        return await db
            .select({
                id: categories.id,
                name: categories.name,
                slug: categories.slug,
                description: categories.description,
                icon: categories.icon,
                color: categories.color,
                domain_id: categories.domain_id,
                scope_id: categories.scope_id,
                display_order: categories.display_order,
            })
            .from(categories)
            .where(eq(categories.is_active, true))
            .orderBy(categories.display_order);
    },
    ['categories-simple'],
    {
        revalidate: CACHE_TTL.CATEGORY_LIST / 1000,
        tags: ['categories']
    }
);

// ============================================
// Master Data Caching
// ============================================

/**
 * Get all active hostels (cached)
 * Cache for 1 hour, rarely changes
 */
export const getCachedHostels = unstable_cache(
    async () => {
        return await db
            .select()
            .from(hostels)
            .where(eq(hostels.is_active, true))
            .orderBy(hostels.name);
    },
    ['hostels'],
    {
        revalidate: 3600, // 1 hour
        tags: ['master-data', 'hostels']
    }
);

/**
 * Get all active batches (cached)
 * Cache for 1 hour, rarely changes
 */
export const getCachedBatches = unstable_cache(
    async () => {
        return await db
            .select()
            .from(batches)
            .where(eq(batches.is_active, true))
            .orderBy(batches.year);
    },
    ['batches'],
    {
        revalidate: 3600, // 1 hour
        tags: ['master-data', 'batches']
    }
);

/**
 * Get all active class sections (cached)
 * Cache for 1 hour, rarely changes
 */
export const getCachedClassSections = unstable_cache(
    async () => {
        return await db
            .select()
            .from(class_sections)
            .where(eq(class_sections.is_active, true))
            .orderBy(class_sections.name);
    },
    ['class-sections'],
    {
        revalidate: 3600, // 1 hour
        tags: ['master-data', 'class-sections']
    }
);

/**
 * Get all active domains (cached)
 * Cache for 1 hour, rarely changes
 */
export const getCachedDomains = unstable_cache(
    async () => {
        return await db
            .select()
            .from(domains)
            .where(eq(domains.is_active, true))
            .orderBy(domains.name);
    },
    ['domains'],
    {
        revalidate: 3600, // 1 hour
        tags: ['master-data', 'domains']
    }
);

/**
 * Get all active scopes (cached)
 * Cache for 1 hour, rarely changes
 */
export const getCachedScopes = unstable_cache(
    async () => {
        return await db
            .select()
            .from(scopes)
            .where(eq(scopes.is_active, true))
            .orderBy(scopes.name);
    },
    ['scopes'],
    {
        revalidate: 3600, // 1 hour
        tags: ['master-data', 'scopes']
    }
);

// ============================================
// Admin Assignment Caching (PERFORMANCE CRITICAL)
// ============================================

import { admin_assignments } from '@/db';

/**
 * Get ALL admin assignments (cached)
 * Returns a map: `${domain_id}-${scope_id}` -> user_id[]
 * This eliminates multiple DB queries during ticket assignment
 * Cache for 5 minutes since assignments can change
 */
export const getCachedAdminAssignments = unstable_cache(
    async () => {
        const assignments = await db
            .select({
                user_id: admin_assignments.user_id,
                domain_id: admin_assignments.domain_id,
                scope_id: admin_assignments.scope_id,
            })
            .from(admin_assignments);

        // Build lookup map: domain-scope -> user_ids
        const assignmentMap = new Map<string, string[]>();
        for (const a of assignments) {
            if (a.domain_id && a.scope_id) {
                const key = `${a.domain_id}-${a.scope_id}`;
                const existing = assignmentMap.get(key) || [];
                existing.push(a.user_id);
                assignmentMap.set(key, existing);
            }
        }
        // Convert to plain object for serialization
        return Object.fromEntries(assignmentMap);
    },
    ['admin-assignments-map'],
    {
        revalidate: 300, // 5 minutes
        tags: ['admin-assignments', 'assignments']
    }
);

/**
 * Get scope lookup by name within a domain (cached)
 * Returns a map: `${domain_id}-${scope_name}` -> scope_id
 * This eliminates scope lookup query during assignment
 */
export const getCachedScopeLookup = unstable_cache(
    async () => {
        const allScopes = await db
            .select({
                id: scopes.id,
                name: scopes.name,
                domain_id: scopes.domain_id,
            })
            .from(scopes)
            .where(eq(scopes.is_active, true));

        // Build lookup map: domain-name -> scope_id
        const scopeMap = new Map<string, number>();
        for (const s of allScopes) {
            if (s.domain_id && s.name) {
                const key = `${s.domain_id}-${s.name}`;
                scopeMap.set(key, s.id);
            }
        }
        return Object.fromEntries(scopeMap);
    },
    ['scope-lookup-map'],
    {
        revalidate: 3600, // 1 hour
        tags: ['master-data', 'scopes']
    }
);

// ============================================
// Ticket Data Caching (with short TTL)
// ============================================

/**
 * Get all tickets for admin dashboard (cached)
 * Short TTL since tickets change frequently
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
                subcategory_name: subcategories.name,
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
            .leftJoin(subcategories, eq(tickets.subcategory_id, subcategories.id))
            .leftJoin(users, eq(tickets.created_by, users.id))
            .orderBy(desc(tickets.created_at));

        return rows;
    },
    ['admin-tickets'],
    {
        revalidate: 30, // 30 seconds - tickets change frequently
        tags: ['tickets']
    }
);

/**
 * Get tickets for committee dashboard (cached)
 * Shows tickets that are either:
 * 1. Created by the committee user
 * 2. Tagged to committees where the user is the head
 * Short TTL since tickets change frequently
 */
export const getCachedCommitteeTickets = unstable_cache(
    async (userId: string) => {
        // Get user email for committee matching
        const [user] = await db
            .select({ email: users.email })
            .from(users)
            .where(eq(users.id, userId))
            .limit(1);

        // Get committees where user is head or contact_email matches
        const userCommittees = await db
            .select({ id: committees.id })
            .from(committees)
            .where(
                or(
                    eq(committees.head_id, userId),
                    user?.email ? eq(committees.contact_email, user.email) : eq(committees.id, -1) // noop when no email
                )
            );

        const committeeIds = userCommittees.map(c => c.id);

        // Build query: tickets created by user OR tagged to user's committees
        const baseQuery = db
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
            .leftJoin(users, eq(tickets.created_by, users.id));

        // Filter: created by user OR tagged to user's committees
        if (committeeIds.length > 0) {
            // Use LEFT JOIN to check for committee tags, then filter
            const rows = await baseQuery
                .leftJoin(
                    ticket_committee_tags,
                    and(
                        eq(ticket_committee_tags.ticket_id, tickets.id),
                        inArray(ticket_committee_tags.committee_id, committeeIds)
                    )
                )
                .where(
                    or(
                        eq(tickets.created_by, userId), // Tickets created by committee
                        sql`${ticket_committee_tags.committee_id} IS NOT NULL` // Tickets tagged to user's committees
                    )
                )
                .orderBy(desc(tickets.created_at));

            // Deduplicate results (in case a ticket is tagged to multiple committees)
            const uniqueRows = Array.from(
                new Map(rows.map(row => [row.id, row])).values()
            );

            return uniqueRows;
        } else {
            // If user has no committees, only show tickets created by them
            const rows = await baseQuery
                .where(eq(tickets.created_by, userId))
                .orderBy(desc(tickets.created_at));

            return rows;
        }
    },
    ['committee-tickets'],
    {
        revalidate: 30, // 30 seconds
        tags: ['tickets']
    }
);
