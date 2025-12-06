import { TicketTimelineEntry } from "@/types/ticket";

export function enrichTimelineWithTAT(timeline: TicketTimelineEntry[], ticket: any, context: any): TicketTimelineEntry[] {
    // Basic implementation: just return timeline for now, or add TAT entries if needed
    return timeline;
}
