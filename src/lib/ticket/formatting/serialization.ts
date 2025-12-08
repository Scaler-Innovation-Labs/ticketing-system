/**
 * Ticket Serialization Helpers
 * 
 * Sanitizes and serializes ticket data for client-side use
 */

/**
 * Sanitize a ticket for client-side serialization
 */
export function sanitizeTicket(ticket: any) {
    if (!ticket) return null;

    return {
        id: ticket.id,
        ticket_number: ticket.ticket_number || '',
        title: ticket.title || '',
        description: ticket.description || '',
        location: ticket.location || null,
        priority: ticket.priority || 'medium',
        status_id: ticket.status_id,
        status: ticket.status_value || ticket.status || 'open', // Add status as alias
        status_value: ticket.status_value || 'open',
        status_label: ticket.status_label || 'Open',
        status_color: ticket.status_color || '#3B82F6',
        category_id: ticket.category_id,
        category_name: ticket.category_name || 'Unknown',
        category_icon: ticket.category_icon || '📋',
        scope_id: ticket.scope_id || null,
        subcategory_id: ticket.subcategory_id || null,
        subcategory_name: ticket.subcategory_name || null,
        creator_name: ticket.creator_name || null, // Add creator fields
        creator_email: ticket.creator_email || null,
        created_by: ticket.created_by || null,
        assigned_to: ticket.assigned_to || null,
        escalation_level: ticket.escalation_level || 0,
        resolution_due_at: ticket.resolution_due_at instanceof Date
            ? ticket.resolution_due_at.toISOString()
            : ticket.resolution_due_at || null,
        acknowledgement_due_at: ticket.acknowledgement_due_at instanceof Date
            ? ticket.acknowledgement_due_at.toISOString()
            : ticket.acknowledgement_due_at || null,
        metadata: ticket.metadata || {},
        created_at: ticket.created_at instanceof Date
            ? ticket.created_at.toISOString()
            : ticket.created_at || new Date().toISOString(),
        updated_at: ticket.updated_at instanceof Date
            ? ticket.updated_at.toISOString()
            : ticket.updated_at || new Date().toISOString(),
        resolved_at: ticket.resolved_at instanceof Date
            ? ticket.resolved_at.toISOString()
            : ticket.resolved_at || null,
        closed_at: ticket.closed_at instanceof Date
            ? ticket.closed_at.toISOString()
            : ticket.closed_at || null,
    };
}

/**
 * Sanitize category hierarchy for client-side use
 */
export function sanitizeCategoryHierarchy(categories: any[]) {
    if (!Array.isArray(categories)) return [];

    return categories.map((cat) => ({
        id: cat.id,
        name: cat.name || '',
        slug: cat.slug || '',
        description: cat.description || null,
        icon: cat.icon || '📋',
        color: cat.color || '#6B7280',
        domain_id: cat.domain_id || null,
        scope_id: cat.scope_id || null,
        display_order: cat.display_order || 0,
        subcategories: Array.isArray(cat.subcategories)
            ? cat.subcategories.map((sub: any) => ({
                id: sub.id,
                name: sub.name || '',
                slug: sub.slug || '',
                description: sub.description || null,
                display_order: sub.display_order || 0,
            }))
            : [],
    }));
}

/**
 * Sanitize date for JSON serialization
 */
export function sanitizeDate(date: Date | string | null | undefined): string | null {
    if (!date) return null;
    if (date instanceof Date) return date.toISOString();
    return date;
}

/**
 * Type-safe ticket for client components
 */
export interface SerializedTicket {
    id: number;
    ticket_number: string;
    title: string;
    description: string;
    location: string | null;
    priority: string;
    status_id: number;
    status_value: string;
    status_label: string;
    status_color: string;
    category_id: number;
    category_name: string;
    category_icon: string;
    scope_id: number | null;
    subcategory_id: number | null;
    subcategory_name: string | null;
    escalation_level: number;
    created_at: string;
    updated_at: string;
    resolved_at: string | null;
    closed_at: string | null;
}

export interface SerializedCategory {
    id: number;
    name: string;
    slug: string;
    description: string | null;
    icon: string;
    color: string;
    domain_id: number | null;
    scope_id: number | null;
    display_order: number;
    subcategories: {
        id: number;
        name: string;
        slug: string;
        description: string | null;
        display_order: number;
    }[];
}
