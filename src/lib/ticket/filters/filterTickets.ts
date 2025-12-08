import type { Ticket } from "@/db/types-only";

type ExtendedTicket = Ticket & {
    status?: string | null;
    category_name?: string | null;
};

export function filterTickets(
    tickets: ExtendedTicket[],
    search: string,
    status: string,
    category: string
): ExtendedTicket[] {
    let filtered = tickets;

    if (status) {
        filtered = filtered.filter(t => (t.status || "").toLowerCase() === status.toLowerCase());
    }

    if (category) {
        filtered = filtered.filter(t => (t.category_name || "").toLowerCase().includes(category.toLowerCase()));
    }

    if (search) {
        const query = search.toLowerCase();
        filtered = filtered.filter(t =>
            t.id.toString().includes(query) ||
            (t.title || "").toLowerCase().includes(query) ||
            (t.description || "").toLowerCase().includes(query)
        );
    }

    return filtered;
}
