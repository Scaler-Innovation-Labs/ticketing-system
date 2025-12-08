import { TimelineEntry } from "@/lib/ticket/formatting/buildTimeline";

export function enrichTimelineWithTAT(timeline: TimelineEntry[], ticket: any, context: any): TimelineEntry[] {
    // Basic implementation: just return timeline for now, or add TAT entries if needed
    return timeline;
}
