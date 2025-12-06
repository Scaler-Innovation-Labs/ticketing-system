
export interface AdminTicketRow {
    id: number;
    title: string;
    description: string;
    location: string | null;
    status_id: number | null;
    category_id: number;
    subcategory_id: number | null;
    created_by: string;
    assigned_to: string | null;
    escalation_level: number | null;
    acknowledgement_due_at: Date | null;
    resolution_due_at: Date | null;
    metadata: unknown;
    created_at: Date;
    updated_at: Date;
    scope_id: number | null;
    ticket_number: string;
    priority: string;
    group_id: number | null;
    escalated_at: Date | null;
    forward_count: number | null;
    reopen_count: number | null;
    reopened_at: Date | null;
    tat_extensions: unknown; // jsonb
    resolved_at: Date | null;
    closed_at: Date | null;
    status_value: string | null;
    category_name: string | null;
    creator_full_name: string | null;
    creator_email: string | null;
    status?: string | { value: string } | null; // Allow string or object
}

export function getStatusValue(t: AdminTicketRow): string | null | undefined {
    if (typeof t.status === 'string') return t.status;
    return t.status?.value || t.status_value;
}

export function applySearchFilter(tickets: AdminTicketRow[], query: string) {
    if (!query) return tickets;
    const lowerQuery = query.toLowerCase();
    return tickets.filter(t =>
        t.title?.toLowerCase().includes(lowerQuery) ||
        t.description?.toLowerCase().includes(lowerQuery) ||
        t.ticket_number?.toLowerCase().includes(lowerQuery)
    );
}

export function applyCategoryFilter(tickets: AdminTicketRow[], category: string, categoryMap?: any) {
    if (!category) return tickets;
    return tickets.filter(t => t.category_id?.toString() === category);
}

export function applySubcategoryFilter(tickets: AdminTicketRow[], subcategory: string) {
    if (!subcategory) return tickets;
    return tickets.filter(t => t.subcategory_id?.toString() === subcategory);
}

export function applyLocationFilter(tickets: AdminTicketRow[], location: string) {
    if (!location) return tickets;
    return tickets.filter(t => t.location === location);
}

export function applyStatusFilter(tickets: AdminTicketRow[], status: string) {
    if (!status) return tickets;
    return tickets.filter(t => getStatusValue(t) === status);
}

export function applyEscalatedFilter(tickets: AdminTicketRow[], escalated: string) {
    if (escalated === 'true') {
        return tickets.filter(t => (t.escalation_level || 0) > 0);
    }
    return tickets;
}

export function applyUserFilter(tickets: AdminTicketRow[], user: string) {
    if (!user) return tickets;
    return tickets.filter(t => t.created_by === user);
}

export function applyDateRangeFilter(tickets: AdminTicketRow[], from: string, to: string) {
    if (!from && !to) return tickets;
    return tickets.filter(t => {
        const date = new Date(t.created_at);
        if (from && date < new Date(from)) return false;
        if (to && date > new Date(to)) return false;
        return true;
    });
}

export function applyTATFilter(tickets: AdminTicketRow[], tat: string) {
    // Basic implementation, can be expanded
    return tickets;
}

export function calculateTicketStats(tickets: AdminTicketRow[]) {
    return {
        total: tickets.length,
        open: tickets.filter(t => getStatusValue(t) === 'open').length,
        inProgress: tickets.filter(t => getStatusValue(t) === 'in_progress').length,
        resolved: tickets.filter(t => getStatusValue(t) === 'resolved').length,
        escalated: tickets.filter(t => (t.escalation_level || 0) > 0).length,
        unassigned: tickets.filter(t => !t.assigned_to).length,
        awaitingStudent: tickets.filter(t => getStatusValue(t) === 'awaiting_response').length,
    };
}
