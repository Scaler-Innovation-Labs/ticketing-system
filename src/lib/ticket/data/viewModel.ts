
import { db, tickets, ticket_statuses, categories, subcategories, users, ticket_comments, ticket_activity, ticket_attachments } from '@/db';
import { eq, and, desc, asc } from 'drizzle-orm';
import { notFound } from 'next/navigation';

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
    normalizedStatus: 'open' | 'in_progress' | 'resolved' | 'closed';
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
        label: string;
        value: string;
    }[];
    timelineEntries: {
        id: number;
        type: 'status_change' | 'comment' | 'assignment' | 'creation';
        title: string;
        description: string | null;
        timestamp: Date;
        actor: {
            name: string;
            avatar_url: string | null;
        } | null;
    }[];
    normalizedComments: {
        id: number;
        content: string;
        created_at: Date;
        is_internal: boolean;
        author: {
            name: string;
            avatar_url: string | null;
            role: string;
            is_staff: boolean;
        };
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

    // 2. Fetch Comments
    const comments = await db
        .select({
            id: ticket_comments.id,
            comment: ticket_comments.comment,
            created_at: ticket_comments.created_at,
            is_internal: ticket_comments.is_internal,
            user_name: users.full_name,
            user_avatar: users.avatar_url,
            user_role_id: users.role_id,
        })
        .from(ticket_comments)
        .leftJoin(users, eq(ticket_comments.user_id, users.id))
        .where(eq(ticket_comments.ticket_id, ticketId))
        .orderBy(asc(ticket_comments.created_at));

    // 3. Fetch Activity
    const activities = await db
        .select({
            id: ticket_activity.id,
            action: ticket_activity.action,
            details: ticket_activity.details,
            created_at: ticket_activity.created_at,
            user_name: users.full_name,
            user_avatar: users.avatar_url,
        })
        .from(ticket_activity)
        .leftJoin(users, eq(ticket_activity.user_id, users.id))
        .where(eq(ticket_activity.ticket_id, ticketId))
        .orderBy(desc(ticket_activity.created_at));

    // 4. Fetch Attachments
    const attachments = await db
        .select()
        .from(ticket_attachments)
        .where(eq(ticket_attachments.ticket_id, ticketId));

    // Helper to normalize status
    const normalizeStatus = (val: string | undefined): 'open' | 'in_progress' | 'resolved' | 'closed' => {
        if (!val) return 'open';
        const v = val.toLowerCase();
        if (v === 'resolved') return 'resolved';
        if (v === 'closed') return 'closed';
        if (v === 'open' || v === 'new') return 'open';
        return 'in_progress';
    };

    const normalizedStatus = normalizeStatus(status?.value);

    // Parse metadata for dynamic fields
    const metadata = (ticket.metadata as Record<string, any>) || {};
    const dynamicFields = metadata && typeof metadata === 'object'
        ? Object.entries(metadata)
            .filter(([key]) => !['profile_snapshot', 'system_info'].includes(key))
            .map(([key, value]) => ({
                label: key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
                value: String(value)
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

    // Timeline construction
    const timelineEntries = [
        // Creation event
        {
            id: 0,
            type: 'creation' as const,
            title: 'Ticket Created',
            description: null,
            timestamp: ticket.created_at,
            actor: { name: 'You', avatar_url: null }
        },
        ...activities.map(a => ({
            id: a.id,
            type: 'status_change' as const, // Simplified mapping
            title: a.action.replace(/_/g, ' '),
            description: a.details ? JSON.stringify(a.details) : null,
            timestamp: a.created_at,
            actor: { name: a.user_name || 'System', avatar_url: a.user_avatar }
        }))
    ].sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

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
        ticketProgress: status?.progress_percent || 0,
        normalizedStatus,
        tatInfo: {
            deadline: ticket.resolution_due_at,
            isOverdue: ticket.resolution_due_at ? new Date() > ticket.resolution_due_at : false,
            formattedDeadline: ticket.resolution_due_at ? ticket.resolution_due_at.toLocaleDateString() : 'No Deadline',
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
        normalizedComments: comments.map(c => ({
            id: c.id,
            content: c.comment,
            created_at: c.created_at,
            is_internal: c.is_internal,
            author: {
                name: c.user_name || 'Unknown',
                avatar_url: c.user_avatar,
                role: 'User', // Simplify
                is_staff: false, // Simplify
            }
        })),
        resolvedProfileFields,
    };
}
