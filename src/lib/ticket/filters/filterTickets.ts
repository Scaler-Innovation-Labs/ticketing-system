import type { Ticket } from "@/db/types-only";

type ExtendedTicket = Ticket & {
    status?: string | null;
    category_name?: string | null;
    category_id?: number | null;
};

/**
 * Normalize status value for comparison
 * Handles variations like "awaiting_student" vs "awaiting_student_response"
 */
function normalizeStatusForComparison(status: string | null | undefined): string {
    if (!status) return "";
    const normalized = status.toLowerCase().trim();
    // Map "awaiting_student" to "awaiting_student_response" for consistency
    if (normalized === "awaiting_student") {
        return "awaiting_student_response";
    }
    return normalized;
}

export function filterTickets(
    tickets: ExtendedTicket[],
    search: string,
    status: string,
    category: string
): ExtendedTicket[] {
    let filtered = tickets;

    // Status filter - normalize both filter and ticket status for comparison
    if (status) {
        const normalizedFilter = normalizeStatusForComparison(status);
        filtered = filtered.filter(t => {
            const ticketStatus = normalizeStatusForComparison(t.status);
            return ticketStatus === normalizedFilter;
        });
    }

    // Category filter - match by category_id (if provided) or exact category name
    if (category) {
        const categoryLower = category.toLowerCase().trim();
        // Try to parse as category ID first
        const categoryId = parseInt(category, 10);
        if (!isNaN(categoryId)) {
            // Match by category ID
            filtered = filtered.filter(t => t.category_id === categoryId);
        } else {
            // Match by exact category name (case-insensitive)
            filtered = filtered.filter(t => {
                const ticketCategory = (t.category_name || "").toLowerCase().trim();
                return ticketCategory === categoryLower;
            });
        }
    }

    // Search filter - search in id, title, description, and ticket_number
    if (search) {
        const query = search.toLowerCase().trim();
        filtered = filtered.filter(t =>
            t.id.toString().includes(query) ||
            (t.title || "").toLowerCase().includes(query) ||
            (t.description || "").toLowerCase().includes(query) ||
            ((t as any).ticket_number || "").toLowerCase().includes(query)
        );
    }

    return filtered;
}
