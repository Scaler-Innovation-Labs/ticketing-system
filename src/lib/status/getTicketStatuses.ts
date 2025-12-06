
import { db, ticket_statuses } from "@/db";
import { eq } from "drizzle-orm";

export async function getAllTicketStatuses() {
    return db.select().from(ticket_statuses).where(eq(ticket_statuses.is_active, true));
}

export const getTicketStatuses = getAllTicketStatuses;

export function buildProgressMap(statuses: any) {
    return {} as Record<string, number>;
}

export async function getTicketStatusByValue(value: string) {
    const statuses = await getAllTicketStatuses();
    return statuses.find(s => s.value === value) || null;
}
