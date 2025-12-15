/**
 * Build Timeline Entries
 * 
 * Generates timeline entries from ticket data and activities for display
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

interface Activity {
    action: string;
    created_at: Date | string;
    details?: any;
    user_name?: string | null;
}

function parseDate(date: Date | string | null | undefined): Date | null {
    if (!date) return null;
    if (date instanceof Date) return date;
    const parsed = new Date(date);
    return isNaN(parsed.getTime()) ? null : parsed;
}

export function buildTimeline(
    ticket: TicketTimelineInput, 
    currentStatus?: string,
    activities?: Activity[]
): TimelineEntry[] {
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

    // Add activity-based timeline entries (status changes, assignments, forwarding, TAT operations, etc.)
    if (activities && activities.length > 0) {
        activities.forEach((activity) => {
            const activityDate = parseDate(activity.created_at);
            if (!activityDate) return;

            const details = activity.details || {};
            const userName = activity.user_name || 'Admin';

            switch (activity.action) {
                case 'status_changed':
                    const fromStatus = details.from || 'unknown';
                    const toStatus = details.to || 'unknown';
                    const reason = details.reason || '';
                    entries.push({
                        title: `Status Changed: ${formatStatusName(fromStatus)} → ${formatStatusName(toStatus)}`,
                        icon: 'RotateCw',
                        date: activityDate,
                        color: 'bg-indigo-100 dark:bg-indigo-900/30',
                        textColor: 'text-indigo-600 dark:text-indigo-400',
                        description: reason ? `${reason} by ${userName}` : `Changed by ${userName}`,
                    });
                    break;

                case 'assigned':
                    const assignedTo = details.assigned_to || 'admin';
                    const previousAssignee = details.previous_assignee;
                    entries.push({
                        title: 'Ticket Assigned',
                        icon: 'CheckCircle',
                        date: activityDate,
                        color: 'bg-blue-100 dark:bg-blue-900/30',
                        textColor: 'text-blue-600 dark:text-blue-400',
                        description: previousAssignee 
                            ? `Assigned to ${assignedTo} by ${userName} (previously: ${previousAssignee})`
                            : `Assigned to ${assignedTo} by ${userName}`,
                    });
                    break;

                case 'forwarded':
                    const forwardedTo = details.forwarded_to || 'admin';
                    const forwardReason = details.reason || '';
                    entries.push({
                        title: 'Ticket Forwarded',
                        icon: 'MessageSquare',
                        date: activityDate,
                        color: 'bg-purple-100 dark:bg-purple-900/30',
                        textColor: 'text-purple-600 dark:text-purple-400',
                        description: forwardReason 
                            ? `Forwarded to ${forwardedTo} by ${userName}: ${forwardReason}`
                            : `Forwarded to ${forwardedTo} by ${userName}`,
                    });
                    break;

                case 'tat_set':
                    const tatString = details.tat_string || '';
                    const deadline = details.deadline ? new Date(details.deadline) : null;
                    entries.push({
                        title: 'TAT Set',
                        icon: 'Sparkles',
                        date: activityDate,
                        color: 'bg-yellow-100 dark:bg-yellow-900/30',
                        textColor: 'text-yellow-600 dark:text-yellow-400',
                        description: deadline 
                            ? `TAT set to ${tatString} by ${userName} (due: ${deadline.toLocaleDateString()})`
                            : `TAT set to ${tatString} by ${userName}`,
                    });
                    break;

                case 'tat_extended':
                    const hoursExtended = details.hours_extended || 0;
                    const newDeadline = details.new_deadline ? new Date(details.new_deadline) : null;
                    const extensionReason = details.reason || '';
                    entries.push({
                        title: 'TAT Extended',
                        icon: 'Sparkles',
                        date: activityDate,
                        color: 'bg-orange-100 dark:bg-orange-900/30',
                        textColor: 'text-orange-600 dark:text-orange-400',
                        description: extensionReason 
                            ? `Extended by ${hoursExtended} hours by ${userName}: ${extensionReason}${newDeadline ? ` (new deadline: ${newDeadline.toLocaleDateString()})` : ''}`
                            : `Extended by ${hoursExtended} hours by ${userName}${newDeadline ? ` (new deadline: ${newDeadline.toLocaleDateString()})` : ''}`,
                    });
                    break;

                case 'reopened':
                    const reopenReason = details.reason || '';
                    const reopenCount = details.reopen_count || 0;
                    entries.push({
                        title: `Ticket Reopened${reopenCount > 1 ? ` (${reopenCount}${reopenCount === 2 ? 'nd' : reopenCount === 3 ? 'rd' : 'th'} time)` : ''}`,
                        icon: 'RotateCcw',
                        date: activityDate,
                        color: 'bg-orange-100 dark:bg-orange-900/30',
                        textColor: 'text-orange-600 dark:text-orange-400',
                        description: reopenReason 
                            ? `${reopenReason} by ${userName}`
                            : `Reopened by ${userName}`,
                    });
                    break;

                case 'escalated':
                    // Escalation entries are already handled above, but we can add more details here
                    const escalationReason = details.reason || '';
                    const escalationLevel = details.escalation_level || details.level || 0;
                    if (escalationReason && escalationLevel > 0) {
                        // Find existing escalation entry and enhance it
                        const existingEntry = entries.find(
                            (e) => e.title.includes('Escalated') && e.title.includes(`Level ${escalationLevel}`)
                        );
                        if (existingEntry) {
                            existingEntry.description = escalationReason;
                        }
                    }
                    break;

                case 'feedback_submitted':
                    const rating = details.rating || 0;
                    entries.push({
                        title: 'Feedback Submitted',
                        icon: 'CheckCircle2',
                        date: activityDate,
                        color: rating >= 4 ? 'bg-green-100 dark:bg-green-900/30' : 'bg-red-100 dark:bg-red-900/30',
                        textColor: rating >= 4 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400',
                        description: `Rating: ${rating}/5 by ${userName}`,
                    });
                    break;

                // Skip these actions as they're already handled or not needed in timeline
                case 'created':
                case 'comment':
                case 'internal_note':
                    // These are handled separately (comments section)
                    break;

                default:
                    // Unknown action - log but don't add to timeline
                    break;
            }
        });
    }

    // Sort by date ascending (oldest first)
    entries.sort((a, b) => a.date.getTime() - b.date.getTime());

    return entries;
}

function formatStatusName(status: string): string {
    const statusMap: Record<string, string> = {
        'open': 'Open',
        'acknowledged': 'Acknowledged',
        'in_progress': 'In Progress',
        'awaiting_student_response': 'Awaiting Student Response',
        'resolved': 'Resolved',
        'closed': 'Closed',
        'reopened': 'Reopened',
        'cancelled': 'Cancelled',
    };
    return statusMap[status.toLowerCase()] || status;
}
