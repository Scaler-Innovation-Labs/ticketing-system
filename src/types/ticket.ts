
import { tickets, ticket_comments, ticket_activity } from "@/db/schema-tickets";
import { InferSelectModel } from "drizzle-orm";

export type Ticket = InferSelectModel<typeof tickets>;
// export type TicketComment = InferSelectModel<typeof ticket_comments>; // Replaced with interface below
export type TicketActivity = InferSelectModel<typeof ticket_activity>;

export interface TicketComment {
    id?: number;
    text: string;
    author?: string;
    created_at?: Date | string | null;
    createdAt?: Date | string | null;
    source?: string;
    type?: string;
    isInternal?: boolean;
    is_internal?: boolean;
    user_id?: string;
    ticket_id?: number;
    comment?: string;
}

export interface TicketWithDetails extends Ticket {
    status: { label: string; value: string; color: string };
    category: { name: string; icon: string };
    subcategory: { name: string };
    assigned_to_user?: { full_name: string; avatar_url: string };
}

export interface TicketStatusDisplay {
    label: string;
    value: string;
    color: string | null;
    badge_color?: string | null;
}

export interface TicketTimelineEntry {
    id: number;
    type: 'status_change' | 'comment' | 'assignment' | 'creation';
    content: string;
    created_at: Date;
    user?: { full_name: string; avatar_url: string };
}

export interface ResolvedProfileField {
    label: string;
    value: string;
}

export interface TATInfo {
    deadline: Date | null;
    isOverdue: boolean;
    formattedDeadline: string;
    expectedResolution?: Date | null;
}

export interface TicketMetadata {
    [key: string]: any;
    tatDate?: string;
    acknowledged_at?: string | Date;
    resolved_at?: string | Date;
    reopened_at?: string | Date;
    last_escalation_at?: string | Date;
    subcategory?: string | number;
}
