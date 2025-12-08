
import { db, tickets, ticket_statuses, categories, subcategories, users, ticket_activity, ticket_attachments } from '@/db';
import { eq, and, desc, asc } from 'drizzle-orm';
import { notFound } from 'next/navigation';
import { buildTimeline } from '@/lib/ticket/formatting/buildTimeline';

/**
 * Get default progress percentage based on status value
 * Used as fallback when progress_percent is not set in ticket_statuses table
 */
function getDefaultProgressForStatus(status: string): number {
    const normalizedStatus = status.toLowerCase();
    switch (normalizedStatus) {
        case 'open': return 0;
        case 'acknowledged': return 20;
        case 'in_progress': return 50;
        case 'awaiting_student_response': return 60;
        case 'resolved': return 90;
        case 'closed': return 100;
        case 'reopened': return 10;
        case 'cancelled': return 100;
        default: return 0;
    }
}


export interface StudentTicketViewModel {
    ticket: {
        id: number;
        ticket_number: string;
        title: string;
        description: string;
        location: string | null;
        created_at: Date;
        updated_at: Date;
        resolved_at: Date | null;
        closed_at: Date | null;
        priority: string;
        escalation_level: number;
        rating: number | null;
    };
    statusDisplay: {
        value: string;
        label: string;
        color: string | null;
        description: string | null;
    } | null;
    category: {
        name: string;
        icon: string | null;
    } | null;
    subcategory: {
        name: string;
    } | null;
    assignedStaff: {
        name: string;
        role: string;
        avatar_url: string | null;
    } | null;
    ticketProgress: number;
    normalizedStatus: 'open' | 'in_progress' | 'awaiting_student_response' | 'resolved' | 'closed';
    tatInfo: {
        deadline: Date | null;
        isOverdue: boolean;
        formattedDeadline: string;
        tatSetAt: Date | null;
        tatSetBy: string | null;
        tat: string | null;
        tatExtensions: {
            extendedAt: Date;
            previousTAT: string;
            newTAT: string;
        }[];
    };
    images: {
        id: number;
        url: string;
        name: string;
    }[];
    normalizedDynamicFields: {
        key: string;
        label: string;
        value: string;
        type: string;
    }[];
    timelineEntries: {
        title: string;
        icon: string;
        date: Date;
        color: string;
        textColor: string;
        description?: string;
    }[];
    normalizedComments: {
        id: number;
        text: string;
        content: string;
        source: string;
        created_at: Date;
        createdAt: Date;
        is_internal: boolean;
        author: string;
    }[];
    resolvedProfileFields: {
        label: string;
        value: string;
    }[];
}

export async function getStudentTicketViewModel(ticketId: number, userId: string): Promise<StudentTicketViewModel | null> {
    // 1. Fetch Ticket Details
    const ticketResult = await db
        .select({
            ticket: tickets,
            status: ticket_statuses,
            category: categories,
            subcategory: subcategories,
            assignedTo: users,
        })
        .from(tickets)
        .leftJoin(ticket_statuses, eq(tickets.status_id, ticket_statuses.id))
        .leftJoin(categories, eq(tickets.category_id, categories.id))
        .leftJoin(subcategories, eq(tickets.subcategory_id, subcategories.id))
        .leftJoin(users, eq(tickets.assigned_to, users.id))
        .where(and(eq(tickets.id, ticketId), eq(tickets.created_by, userId)))
        .limit(1);

    const data = ticketResult[0];
    if (!data) return null;

    const { ticket, status, category, subcategory, assignedTo } = data;

    // 2. Fetch Activity (includes comments)
    const activities = await db
        .select({
            id: ticket_activity.id,
            action: ticket_activity.action,
            details: ticket_activity.details,
            visibility: ticket_activity.visibility,
            created_at: ticket_activity.created_at,
            user_name: users.full_name,
            user_avatar: users.avatar_url,
        })
        .from(ticket_activity)
        .leftJoin(users, eq(ticket_activity.user_id, users.id))
        .where(eq(ticket_activity.ticket_id, ticketId))
        .orderBy(asc(ticket_activity.created_at));

    // Filter activities for student visibility
    const visibleActivities = activities.filter(a =>
        a.visibility === 'public' || a.visibility === 'student_visible'
    );

    // Extract comments from activities (action = 'comment')
    const commentActivities = visibleActivities.filter(a => a.action === 'comment');

    // 3. Fetch Attachments
    const attachments = await db
        .select()
        .from(ticket_attachments)
        .where(eq(ticket_attachments.ticket_id, ticketId));

    // Helper to normalize status
    const normalizeStatus = (val: string | undefined): 'open' | 'in_progress' | 'awaiting_student_response' | 'resolved' | 'closed' => {
        if (!val) return 'open';
        const v = val.toLowerCase();
        if (v === 'resolved') return 'resolved';
        if (v === 'closed') return 'closed';
        if (v === 'open' || v === 'new') return 'open';
        if (v === 'awaiting_student_response' || v === 'awaiting_student') return 'awaiting_student_response';
        return 'in_progress';
    };

    const normalizedStatus = normalizeStatus(status?.value);

    // Parse metadata for dynamic fields
    const metadata = (ticket.metadata as Record<string, any>) || {};
    const dynamicFields = metadata && typeof metadata === 'object'
        ? Object.entries(metadata)
            .filter(([key]) => !['profile_snapshot', 'system_info'].includes(key))
            .map(([key, value]) => ({
                key,
                label: key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
                value: String(value),
                type: 'text'
            }))
        : [];

    // Parse profile snapshot
    const profileSnapshot = (metadata.profile_snapshot as Record<string, any>) || {};
    const resolvedProfileFields = profileSnapshot && typeof profileSnapshot === 'object'
        ? Object.entries(profileSnapshot).map(([key, value]) => ({
            label: key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
            value: String(value)
        }))
        : [];

    // Extract timestamps from metadata
    const ticketMetadata = (metadata as Record<string, any>) || {};
    const resolvedAt = ticketMetadata.resolved_at ? new Date(ticketMetadata.resolved_at) : null;
    const reopenedAt = ticketMetadata.reopened_at ? new Date(ticketMetadata.reopened_at) : null;
    const acknowledgedAt = ticketMetadata.acknowledged_at ? new Date(ticketMetadata.acknowledged_at) : null;

    // Build timeline using the same function as superadmin
    const timelineEntries = buildTimeline({
        created_at: ticket.created_at,
        acknowledged_at: acknowledgedAt,
        updated_at: ticket.updated_at,
        resolved_at: resolvedAt,
        reopened_at: reopenedAt,
        escalation_level: ticket.escalation_level,
        status: status?.value || null,
    }, normalizedStatus);

    // Add TAT set entry if TAT was set
    const tatSetAt = ticketMetadata?.tatSetAt;
    if (tatSetAt) {
        const tatSetDate = new Date(tatSetAt);
        if (!isNaN(tatSetDate.getTime())) {
            timelineEntries.push({
                title: `TAT Set by ${ticketMetadata.tatSetBy || 'Admin'}`,
                icon: "Sparkles",
                date: tatSetDate,
                color: "bg-yellow-100 dark:bg-yellow-900/30",
                textColor: "text-yellow-600 dark:text-yellow-400",
            });
        }
    }

    // Add TAT Extensions
    if (Array.isArray(ticketMetadata?.tatExtensions) && ticketMetadata.tatExtensions.length > 0) {
        ticketMetadata.tatExtensions.forEach((extension: Record<string, unknown>) => {
            const extendedAt = extension.extendedAt ? new Date(extension.extendedAt as string) : null;
            if (extendedAt && !isNaN(extendedAt.getTime())) {
                timelineEntries.push({
                    title: `TAT Extended(to ${extension.newTAT || 'new date'})`,
                    icon: "Sparkles",
                    date: extendedAt,
                    color: "bg-orange-100 dark:bg-orange-900/30",
                    textColor: "text-orange-600 dark:text-orange-400",
                });
            }
        });
    }

    // Add Overdue entry if TAT date has passed and ticket is not resolved
    const tatDate = ticket.resolution_due_at || (ticketMetadata?.tatDate ? new Date(ticketMetadata.tatDate) : null);
    if (tatDate) {
        const tatDateObj = new Date(tatDate);
        const now = new Date();
        const isResolved = normalizedStatus === "resolved" || normalizedStatus === "closed";

        if (!isNaN(tatDateObj.getTime()) && tatDateObj.getTime() < now.getTime() && !isResolved) {
            timelineEntries.push({
                title: "Overdue",
                icon: "AlertTriangle",
                date: tatDateObj,
                color: "bg-red-100 dark:bg-red-900/30",
                textColor: "text-red-600 dark:text-red-400",
            });
        }
    }

    // Sort timeline by date (oldest first, like superadmin)
    timelineEntries.sort((a, b) => {
        if (!a.date || !b.date) return 0;
        return a.date.getTime() - b.date.getTime();
    });

    return {
        ticket: {
            id: ticket.id,
            ticket_number: ticket.ticket_number,
            title: ticket.title,
            description: ticket.description,
            location: ticket.location,
            created_at: ticket.created_at,
            updated_at: ticket.updated_at,
            resolved_at: ticket.resolved_at,
            closed_at: ticket.closed_at,
            priority: ticket.priority,
            escalation_level: ticket.escalation_level,
            rating: typeof metadata.rating === 'number' ? metadata.rating : null,
        },
        statusDisplay: status ? {
            value: status.value,
            label: status.label,
            color: status.color,
            description: status.description,
        } : null,
        category: category ? {
            name: category.name,
            icon: category.icon,
        } : null,
        subcategory: subcategory ? {
            name: subcategory.name,
        } : null,
        assignedStaff: assignedTo ? {
            name: assignedTo.full_name || 'Unknown Staff',
            role: 'Staff', // Simplify for now
            avatar_url: assignedTo.avatar_url,
        } : null,
        // Use progress_percent from status, or calculate based on status value as fallback
        ticketProgress: status?.progress_percent ?? getDefaultProgressForStatus(normalizedStatus),
        normalizedStatus,
        tatInfo: {
            deadline: ticket.resolution_due_at,
            isOverdue: ticket.resolution_due_at ? new Date() > ticket.resolution_due_at : false,
            formattedDeadline: ticket.resolution_due_at ? ticket.resolution_due_at.toLocaleDateString() : 'No Deadline',
            expectedResolution: ticket.resolution_due_at || null,
            tatSetAt: null, // TODO: Implement if available
            tatSetBy: null,
            tat: null,
            tatExtensions: [], // TODO: Implement if available
        },
        images: attachments.map(a => ({
            id: a.id,
            url: a.file_url,
            name: a.file_name,
        })),
        normalizedDynamicFields: dynamicFields,
        timelineEntries,
        normalizedComments: commentActivities.map(c => {
            const details = c.details as { comment?: string; attachments?: any[] } | null;
            return {
                id: c.id,
                text: details?.comment || '',
                content: details?.comment || '',
                source: c.user_name ? 'admin' : 'website', // admin comments have user_name
                created_at: c.created_at,
                createdAt: c.created_at,
                is_internal: false, // These are student-visible comments
                author: c.user_name || 'Admin',
            };
        }),
        resolvedProfileFields,
    };
}
