/**
 * Build Timeline Entries
 * 
 * Generates timeline entries from ticket data for display
 */

export interface TimelineEntry {
    title: string;
    icon: string;
    date: Date;
    color: string;
    textColor: string;
    description?: string;
}

interface TicketTimelineInput {
    created_at: Date | string | null;
    acknowledged_at?: Date | string | null;
    updated_at: Date | string | null;
    resolved_at?: Date | string | null;
    reopened_at?: Date | string | null;
    escalation_level?: number | null;
    status?: string | null;
}

function parseDate(date: Date | string | null | undefined): Date | null {
    if (!date) return null;
    if (date instanceof Date) return date;
    const parsed = new Date(date);
    return isNaN(parsed.getTime()) ? null : parsed;
}

export function buildTimeline(ticket: TicketTimelineInput, currentStatus?: string): TimelineEntry[] {
    const entries: TimelineEntry[] = [];

    // Created entry (always present)
    const createdAt = parseDate(ticket.created_at);
    if (createdAt) {
        entries.push({
            title: "Ticket Created",
            icon: "Plus",
            date: createdAt,
            color: "bg-blue-100 dark:bg-blue-900/30",
            textColor: "text-blue-600 dark:text-blue-400",
            description: "Ticket was submitted",
        });
    }

    // Acknowledged entry
    const acknowledgedAt = parseDate(ticket.acknowledged_at);
    if (acknowledgedAt) {
        entries.push({
            title: "Ticket Acknowledged",
            icon: "CheckCircle",
            date: acknowledgedAt,
            color: "bg-cyan-100 dark:bg-cyan-900/30",
            textColor: "text-cyan-600 dark:text-cyan-400",
            description: "Ticket was acknowledged by admin",
        });
    }

    // Escalation entries
    const escalationLevel = ticket.escalation_level || 0;
    if (escalationLevel > 0) {
        // We don't have individual escalation timestamps, so use updated_at as approximation
        const escalationDate = parseDate(ticket.updated_at) || new Date();
        entries.push({
            title: `Escalated to Level ${escalationLevel}`,
            icon: "AlertTriangle",
            date: escalationDate,
            color: "bg-red-100 dark:bg-red-900/30",
            textColor: "text-red-600 dark:text-red-400",
            description: "Ticket was escalated due to SLA breach",
        });
    }

    // Resolved entry
    const resolvedAt = parseDate(ticket.resolved_at);
    if (resolvedAt) {
        entries.push({
            title: "Ticket Resolved",
            icon: "CheckCircle2",
            date: resolvedAt,
            color: "bg-green-100 dark:bg-green-900/30",
            textColor: "text-green-600 dark:text-green-400",
            description: "Issue was resolved",
        });
    }

    // Reopened entry
    const reopenedAt = parseDate(ticket.reopened_at);
    if (reopenedAt) {
        entries.push({
            title: "Ticket Reopened",
            icon: "RotateCcw",
            date: reopenedAt,
            color: "bg-orange-100 dark:bg-orange-900/30",
            textColor: "text-orange-600 dark:text-orange-400",
            description: "Ticket was reopened by student",
        });
    }

    // Current status indicator if not already captured
    const status = currentStatus || ticket.status;
    if (status && !resolvedAt && !reopenedAt) {
        const statusNormalized = status.toLowerCase();
        if (statusNormalized === "in_progress" || statusNormalized === "in progress") {
            const updatedAt = parseDate(ticket.updated_at);
            if (updatedAt && (!acknowledgedAt || updatedAt > acknowledgedAt)) {
                entries.push({
                    title: "Work In Progress",
                    icon: "Loader",
                    date: updatedAt,
                    color: "bg-amber-100 dark:bg-amber-900/30",
                    textColor: "text-amber-600 dark:text-amber-400",
                    description: "Admin is working on this ticket",
                });
            }
        } else if (statusNormalized === "awaiting_student_response" || statusNormalized.includes("awaiting")) {
            const updatedAt = parseDate(ticket.updated_at);
            if (updatedAt) {
                entries.push({
                    title: "Awaiting Student Response",
                    icon: "Clock",
                    date: updatedAt,
                    color: "bg-purple-100 dark:bg-purple-900/30",
                    textColor: "text-purple-600 dark:text-purple-400",
                    description: "Waiting for student to respond",
                });
            }
        }
    }

    // Sort by date ascending (oldest first)
    entries.sort((a, b) => a.date.getTime() - b.date.getTime());

    return entries;
}
