/**
 * Category Hierarchy Helper
 * 
 * Gets categories with their subcategories in a hierarchical structure
 * Uses cached queries for better performance
 * Returns data formatted for TicketForm compatibility
 */

import { getCachedCategoriesHierarchy } from '@/lib/cache/cached-queries';

export interface SubcategoryField {
    id: number;
    name: string;
    slug: string;
    type: string;
    required: boolean;
    placeholder: string | null;
    help_text: string | null;
    validation_rules: Record<string, unknown> | null;
    display_order: number;
    options: Array<{ id: number; label: string; value: string }>;
}

export interface SubcategoryWithFields {
    id: number;
    value: string;  // slug - for TicketForm compatibility
    label: string;  // name - for TicketForm compatibility
    name: string;
    slug: string;
    description: string | null;
    display_order: number;
    category_id: number;
    fields: SubcategoryField[];
}

export interface CategoryHierarchy {
    id: number;
    value: string;  // slug - for TicketForm compatibility
    label: string;  // name - for TicketForm compatibility
    name: string;
    slug: string;
    description: string | null;
    icon: string | null;
    color: string | null;
    domain_id: number | null;
    scope_id: number | null;
    sla_hours: number | null;
    display_order: number | null;
    subcategories: SubcategoryWithFields[];
}

/**
 * Get all categories with their subcategories and fields
 * Uses cached queries for better performance
 */
export async function getCategoriesHierarchy(): Promise<CategoryHierarchy[]> {
    try {
        // Use cached version for better performance
        // Data is already in the correct format from cache
        const result = await getCachedCategoriesHierarchy();
        return result as CategoryHierarchy[];
    } catch (error) {
        console.error('[getCategoriesHierarchy] Error:', error);
        return [];
    }
}

/**
 * Get categories for a specific scope/domain (placeholder)
 */
export async function getCategoriesForScope(
    domainId?: number,
    scopeId?: number
): Promise<CategoryHierarchy[]> {
    return getCategoriesHierarchy();
}
