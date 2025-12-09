/**
 * Cache Utilities
 * 
 * Provides utilities for cache invalidation and management
 */

import { revalidateTag } from 'next/cache';

/**
 * Cache tags for selective invalidation
 */
export const CACHE_TAGS = {
    TICKETS: 'tickets',
    TICKET_STATUSES: 'ticket-statuses',
    CATEGORIES: 'categories',
    SUBCATEGORIES: 'subcategories',
    CATEGORY_FIELDS: 'category-fields',
    MASTER_DATA: 'master-data',
    HOSTELS: 'hostels',
    BATCHES: 'batches',
    CLASS_SECTIONS: 'class-sections',
    DOMAINS: 'domains',
    SCOPES: 'scopes',
    USERS: 'users',
    ADMINS: 'admins',
    COMMITTEES: 'committees',
} as const;

/**
 * Invalidate cache by tag
 * Use this after mutations to ensure fresh data
 */
export function invalidateCache(tag: string) {
    try {
        // revalidateTag requires a profile argument in Next.js
        // Using 'default' profile for standard cache invalidation
        revalidateTag(tag, 'default');
    } catch (error) {
        // In development, revalidateTag might not be available
        console.warn(`Failed to invalidate cache tag: ${tag}`, error);
    }
}

/**
 * Invalidate multiple cache tags at once
 */
export function invalidateCaches(tags: string[]) {
    tags.forEach(tag => invalidateCache(tag));
}

/**
 * Invalidate all ticket-related caches
 */
export function invalidateTicketCaches() {
    invalidateCaches([
        CACHE_TAGS.TICKETS,
        CACHE_TAGS.TICKET_STATUSES,
    ]);
}

/**
 * Invalidate all category-related caches
 */
export function invalidateCategoryCaches() {
    invalidateCaches([
        CACHE_TAGS.CATEGORIES,
        CACHE_TAGS.SUBCATEGORIES,
        CACHE_TAGS.CATEGORY_FIELDS,
    ]);
}

/**
 * Invalidate all master data caches
 */
export function invalidateMasterDataCaches() {
    invalidateCaches([
        CACHE_TAGS.MASTER_DATA,
        CACHE_TAGS.HOSTELS,
        CACHE_TAGS.BATCHES,
        CACHE_TAGS.CLASS_SECTIONS,
        CACHE_TAGS.DOMAINS,
        CACHE_TAGS.SCOPES,
    ]);
}

/**
 * Invalidate user-related caches
 */
export function invalidateUserCaches() {
    invalidateCaches([
        CACHE_TAGS.USERS,
        CACHE_TAGS.ADMINS,
        CACHE_TAGS.COMMITTEES,
    ]);
}

