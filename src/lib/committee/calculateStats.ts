import type { Ticket } from "@/db/types-only";

type ExtendedTicket = Ticket & {
    status?: string | null;
};

export interface Stats {
    total: number;
    open: number;
    inProgress: number;
    resolved: number;
    closed: number;
    awaitingStudent: number;
    escalated: number;
}

export function calculateTicketStats(tickets: ExtendedTicket[]): Stats {
    const stats = {
        total: tickets.length,
        open: 0,
        inProgress: 0,
        resolved: 0,
        closed: 0,
        awaitingStudent: 0,
        escalated: 0,
    };

    tickets.forEach(t => {
        const status = (t.status || "").toLowerCase();
        if (status === "open") stats.open++;
        else if (status === "in_progress") stats.inProgress++;
        else if (status === "resolved") stats.resolved++;
        else if (status === "closed") stats.closed++;
        else if (status === "awaiting_student_response") stats.awaitingStudent++;

        if ((t.escalation_level || 0) > 0) stats.escalated++;
    });

    return stats;
}
