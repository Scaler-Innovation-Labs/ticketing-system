
import { z } from 'zod';
export const statusSchema = z.string();

// Ticket status value type for type-safe status handling
export type TicketStatusValue =
    | 'open'
    | 'acknowledged'
    | 'in_progress'
    | 'awaiting_student_response'
    | 'resolved'
    | 'closed'
    | 'reopened'
    | 'cancelled'
    | 'forwarded';

// Re-export as TicketStatus for backwards compatibility with string literal usage
// Note: If using with status objects that have .value/.label, use a different type
export type TicketStatus = TicketStatusValue;
