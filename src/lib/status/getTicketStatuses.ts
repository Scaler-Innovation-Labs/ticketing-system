
import { db, ticket_statuses } from "@/db";
import { eq } from "drizzle-orm";

export async function getAllTicketStatuses() {
    return db.select().from(ticket_statuses).where(eq(ticket_statuses.is_active, true));
}

export const getTicketStatuses = getAllTicketStatuses;

export function buildProgressMap(statuses: any) {
    if (!Array.isArray(statuses)) return {};

    return statuses.reduce((acc: Record<string, number>, status: any) => {
        const key = typeof status.value === 'string' ? status.value.toLowerCase() : null;
        if (key) {
            const progress = typeof status.progress_percent === 'number'
                ? status.progress_percent
                : 0;
            acc[key] = progress;
        }
        return acc;
    }, {});
}

export async function getTicketStatusByValue(value: string) {
    const statuses = await getAllTicketStatuses();
    return statuses.find(s => s.value === value) || null;
}
