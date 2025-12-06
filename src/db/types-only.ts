
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
