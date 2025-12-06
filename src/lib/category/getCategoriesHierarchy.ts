/**
 * Category Hierarchy Helper
 * 
 * Gets categories with their subcategories in a hierarchical structure
 * Uses the existing category service for data fetching
 * Returns data formatted for TicketForm compatibility
 */

import { getActiveCategories } from '@/lib/category/category-service';

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
 * Uses the existing category service and formats for TicketForm
 */
export async function getCategoriesHierarchy(): Promise<CategoryHierarchy[]> {
    try {
        // Use existing service that properly fetches with fields
        const categoriesData = await getActiveCategories(true);

        // Map to format expected by TicketForm
        return categoriesData.map((cat: any) => ({
            id: cat.id,
            value: cat.slug || '',  // For TicketForm compatibility
            label: cat.name || '',  // For TicketForm compatibility
            name: cat.name || '',
            slug: cat.slug || '',
            description: cat.description || null,
            icon: cat.icon || null,
            color: cat.color || null,
            domain_id: cat.domain_id || null,
            scope_id: cat.scope_id || null,
            sla_hours: cat.sla_hours || null,
            display_order: cat.display_order || 0,
            subcategories: (cat.subcategories || []).map((sub: any) => ({
                id: sub.id,
                value: sub.slug || '',
                label: sub.name || '',
                name: sub.name || '',
                slug: sub.slug || '',
                description: sub.description || null,
                display_order: sub.display_order || 0,
                category_id: sub.category_id,
                fields: (sub.fields || []).map((f: any) => ({
                    id: f.id,
                    name: f.name || '',
                    slug: f.slug || '',
                    type: f.field_type || 'text',
                    required: f.required ?? false,
                    placeholder: f.placeholder || null,
                    help_text: null, // Not in schema
                    validation_rules: f.validation || null,
                    display_order: f.display_order || 0,
                    options: (f.options || []).map((opt: any, idx: number) => ({
                        id: opt.id || idx,
                        label: opt.label || opt.option_label || opt.value || '',
                        value: opt.value || opt.option_value || '',
                    })),
                })),
            })),
        }));
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
