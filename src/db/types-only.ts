
export * from './schema';
export * from './schema-tickets';

import { type SelectTicket } from './schema-tickets';

export type Ticket = SelectTicket;

export interface TicketMetadata {
    resolved_at?: string | Date;
    reopened_at?: string | Date;
    acknowledged_at?: string | Date;
    rating?: number;
    feedback?: string;
    tatDate?: string;
    tat?: string;
    [key: string]: any;
}

import { class_sections, batches, hostels, domains, scopes } from './schema';

export type ClassSection = typeof class_sections.$inferSelect;
export type Batch = typeof batches.$inferSelect;
export type Hostel = typeof hostels.$inferSelect;
export type Domain = typeof domains.$inferSelect;
export type Scope = typeof scopes.$inferSelect;
