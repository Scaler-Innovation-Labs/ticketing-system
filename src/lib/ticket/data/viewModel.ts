
import { db, tickets, ticket_statuses, categories, subcategories, users, ticket_activity, ticket_attachments } from '@/db';
import { eq, and, or, desc, asc } from 'drizzle-orm';
import { notFound } from 'next/navigation';
import { buildTimeline } from '@/lib/ticket/formatting/buildTimeline';
import { addBusinessHours } from '@/lib/ticket/utils/tat-calculator';
import { unstable_cache } from 'next/cache';
import { cache } from 'react';

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
        expectedResolution: Date | null;
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
        field_name: string;
        label: string;
        value: string;
    }[];
}

/**
 * Get student ticket view model (cached for 30 seconds)
 * Uses React cache() for request-level deduplication
 * Uses unstable_cache for short-term caching across requests
 * 
 * Note: Short TTL because tickets change frequently (comments, status updates)
 */
const getStudentTicketViewModelCached = cache(async (ticketId: number, userId: string): Promise<StudentTicketViewModel | null> => {
    // OPTIMIZATION: Parallelize all database queries to reduce latency
    // OPTIMIZATION: Select only needed columns to reduce data transfer
    const [ticketResult, activitiesResult, attachmentsResult] = await Promise.all([
        // 1. Fetch Ticket Details
        db
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
            .limit(1),

        // 2. Fetch Activity (includes comments) - parallelized
        // OPTIMIZATION: Filter visibility in database query instead of in-memory
        // OPTIMIZATION: Limit to recent 50 activities to reduce payload (can add "Load more" later)
        db
            .select({
                id: ticket_activity.id,
                action: ticket_activity.action,
                details: ticket_activity.details,
                visibility: ticket_activity.visibility,
                created_at: ticket_activity.created_at,
                user_id: ticket_activity.user_id,
                user_name: users.full_name,
                user_avatar: users.avatar_url,
            })
            .from(ticket_activity)
            .leftJoin(users, eq(ticket_activity.user_id, users.id))
            .where(
                and(
                    eq(ticket_activity.ticket_id, ticketId),
                    or(
                        eq(ticket_activity.visibility, 'public'),
                        eq(ticket_activity.visibility, 'student_visible')
                    )
                )
            )
            .orderBy(desc(ticket_activity.created_at))
            .limit(50), // Limit to recent 50 activities - can add pagination later

        // 3. Fetch Attachments - parallelized
        // OPTIMIZATION: Select only needed columns
        db
            .select({
                id: ticket_attachments.id,
                file_name: ticket_attachments.file_name,
                file_url: ticket_attachments.file_url,
            })
            .from(ticket_attachments)
            .where(eq(ticket_attachments.ticket_id, ticketId)),
    ]);

    const data = ticketResult[0];
    if (!data) return null;

    const { ticket, status, category, subcategory, assignedTo } = data;

    // OPTIMIZATION: Activities are already filtered by visibility in the query
    // Reverse to show oldest first (since we fetched with desc order, then limit)
    const sortedActivities = [...activitiesResult].reverse();
    // Extract comments from activities (action = 'comment')
    const commentActivities = sortedActivities.filter(a => a.action === 'comment');

    const attachments = attachmentsResult;

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
    // Exclude student profile fields - these are shown separately in TicketStudentInfo
    // OPTIMIZATION: Pre-compute Set for faster lookups
    const studentProfileKeys = new Set([
        'name', 'full_name', 'email', 'phone',
        'hostel', 'hostel_name', 'roomnumber', 'room_number', 'room',
        'batchyear', 'batch_year', 'batch',
        'classsection', 'class_section', 'section',
        'profile_snapshot', 'system_info', // Also exclude these system keys
    ]);
    
    const metadata = (ticket.metadata as Record<string, any>) || {};
    // OPTIMIZATION: Use single pass filter + map for better performance
    const dynamicFields: Array<{ key: string; label: string; value: string; type: string }> = [];
    if (metadata && typeof metadata === 'object') {
        for (const [key, value] of Object.entries(metadata)) {
            // Skip if it's a student profile field or system key
            if (studentProfileKeys.has(key) || 
                studentProfileKeys.has(key.toLowerCase()) ||
                key === 'profile_snapshot' || 
                key === 'system_info') {
                continue;
            }
            // Only process if value is not null/undefined/empty
            if (value !== null && value !== undefined && value !== '') {
                dynamicFields.push({
                    key,
                    label: key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
                    value: String(value),
                    type: 'text'
                });
            }
        }
    }

    // Parse profile snapshot for student information
    // First try profile_snapshot, then fall back to extracting from metadata directly
    const profileSnapshot = (metadata.profile_snapshot as Record<string, any>) || {};
    let resolvedProfileFields: Array<{ field_name: string; label: string; value: string }> = [];
    
    if (profileSnapshot && typeof profileSnapshot === 'object' && Object.keys(profileSnapshot).length > 0) {
        // Use profile_snapshot if it exists
        resolvedProfileFields = Object.entries(profileSnapshot).map(([key, value]) => ({
            field_name: key,
            label: key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
            value: String(value)
        }));
    } else {
        // Fallback: Extract student profile fields directly from metadata
        const profileFieldKeys = new Set([
            'name', 'full_name', 'email', 'phone',
            'hostel', 'hostel_name', 'roomnumber', 'room_number', 'room',
            'batchyear', 'batch_year', 'batch',
            'classsection', 'class_section', 'section',
        ]);
        
        resolvedProfileFields = Object.entries(metadata)
            .filter(([key]) => {
                const keyLower = key.toLowerCase();
                return profileFieldKeys.has(key) || profileFieldKeys.has(keyLower);
            })
            .map(([key, value]) => ({
                field_name: key,
                label: key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
                value: String(value || '')
            }))
            .filter(field => field.value.trim() !== ''); // Only include fields with values
    }

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
    
    // Add escalation reasons from activities (limited to recent 50)
    sortedActivities.forEach((activity) => {
        if (activity.action === 'escalated' && activity.details) {
            const details = activity.details as { reason?: string; level?: number } | null;
            if (details?.reason) {
                const existingEntry = timelineEntries.find(
                    (e) => e.title.includes('Escalated') && e.date.getTime() === activity.created_at.getTime()
                );
                if (existingEntry) {
                    existingEntry.description = details.reason;
                }
            }
        }
    });

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
        tatInfo: (() => {
            const tatDateRaw = ticket.resolution_due_at || null;
            const isTatPaused = normalizedStatus === 'awaiting_student_response' && !!metadata?.tatPausedAt;
            const remainingTatHours = metadata?.tatRemainingHours ? Number(metadata.tatRemainingHours) : null;

            let expectedResolution = tatDateRaw;
            if (isTatPaused && remainingTatHours && Number.isFinite(remainingTatHours)) {
                expectedResolution = addBusinessHours(new Date(), remainingTatHours);
            }

            const isOverdue = expectedResolution ? (new Date() > expectedResolution && !isTatPaused) : false;

            return {
                deadline: expectedResolution,
                isOverdue,
                formattedDeadline: expectedResolution ? expectedResolution.toLocaleDateString() : (isTatPaused ? 'Paused (awaiting student response)' : 'No Deadline'),
                expectedResolution: expectedResolution || null,
                tatSetAt: null, // TODO: Implement if available
                tatSetBy: null,
                tat: null,
                tatExtensions: [], // TODO: Implement if available
            };
        })(),
        images: attachments.map(a => ({
            id: a.id,
            url: a.file_url,
            name: a.file_name,
        })),
        normalizedDynamicFields: dynamicFields,
        timelineEntries,
        // OPTIMIZATION: Pre-compute userId check once
        normalizedComments: (() => {
            const commentList = [];
            for (const c of commentActivities) {
                const details = c.details as { comment?: string; attachments?: any[] } | null;
                const commentText = details?.comment || '';
                // Skip empty comments
                if (!commentText) continue;
                
                // Student comments: user_id matches ticket creator (userId parameter)
                const isStudentComment = c.user_id === userId;
                commentList.push({
                    id: c.id,
                    text: commentText,
                    content: commentText,
                    source: isStudentComment ? 'website' : 'admin',
                    created_at: c.created_at,
                    createdAt: c.created_at,
                    is_internal: false, // These are student-visible comments
                    author: isStudentComment ? 'You' : (c.user_name || 'Admin'),
                });
            }
            return commentList;
        })(),
        resolvedProfileFields,
    };
});

// Export the cached version wrapped in unstable_cache for cross-request caching
// OPTIMIZATION: Increased TTL to 10 seconds for better performance (still short enough for real-time updates)
// React cache() handles request-level deduplication, unstable_cache handles cross-request caching
export async function getStudentTicketViewModel(ticketId: number, userId: string): Promise<StudentTicketViewModel | null> {
    return unstable_cache(
        async () => getStudentTicketViewModelCached(ticketId, userId),
        [`student-ticket-${ticketId}-${userId}`],
        {
            revalidate: 10, // 10 seconds - balance between performance and freshness
            tags: [`ticket-${ticketId}`, `user-${userId}`],
        }
    )();
}
