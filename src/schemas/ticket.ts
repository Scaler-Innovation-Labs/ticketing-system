/**
 * Ticket Validation Schemas
 * 
 * Zod schemas for ticket creation and updates
 */

import { z } from 'zod';
import { LIMITS, TICKET_STATUS } from '@/conf/constants';

/**
 * FAST validation schema - only essential fields for ticket creation
 * This is used BEFORE ticket creation to ensure we can create the ticket quickly
 * Metadata validation happens AFTER ticket creation (deep validation)
 */
export const createTicketCoreSchema = z.object({
  title: z.string()
    .min(5, 'Title must be at least 5 characters')
    .max(200, 'Title must be at most 200 characters')
    .trim(),

  description: z.string()
    .min(10, 'Description must be at least 10 characters')
    .max(LIMITS.MAX_DESCRIPTION_LENGTH, `Description must be at most ${LIMITS.MAX_DESCRIPTION_LENGTH} characters`)
    .trim(),

  category_id: z.number().int().positive('Category is required'),

  subcategory_id: z.number().int().positive().optional(),

  priority: z.enum(['low', 'medium', 'high', 'urgent']).default('medium'),

  attachments: z.array(z.object({
    filename: z.string(),
    url: z.string().url(),
    size: z.number().max(LIMITS.MAX_FILE_SIZE),
    mime_type: z.string(),
  })).max(LIMITS.MAX_ATTACHMENTS).optional(),

  location: z.string().max(500).optional(),

  // Metadata is accepted but NOT validated here (fast path)
  // Deep validation happens after ticket creation
  metadata: z.record(z.string(), z.unknown()).optional(),
  
  // Support for separate details and profile fields (merged into metadata)
  details: z.record(z.string(), z.unknown()).optional(),
  profile: z.record(z.string(), z.unknown()).optional(),
});

/**
 * Create ticket schema (full validation - for backward compatibility)
 * NOTE: Use createTicketCoreSchema for fast validation, then validate metadata separately
 */
export const createTicketSchema = createTicketCoreSchema;

/**
 * Update ticket schema
 */
export const updateTicketSchema = z.object({
  title: z.string()
    .min(5, 'Title must be at least 5 characters')
    .max(200, 'Title must be at most 200 characters')
    .trim()
    .optional(),

  description: z.string()
    .min(10, 'Description must be at least 10 characters')
    .max(LIMITS.MAX_DESCRIPTION_LENGTH)
    .trim()
    .optional(),

  status: z.enum([
    TICKET_STATUS.OPEN,
    TICKET_STATUS.ACKNOWLEDGED,
    TICKET_STATUS.IN_PROGRESS,
    TICKET_STATUS.RESOLVED,
    TICKET_STATUS.CLOSED,
    TICKET_STATUS.REOPENED,
    TICKET_STATUS.CANCELLED,
  ] as const).optional(),

  assigned_to: z.string().uuid().optional(),

  priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
});

/**
 * Ticket comment schema
 */
export const createCommentSchema = z.object({
  comment: z.string()
    .min(1, 'Comment cannot be empty')
    .max(5000, 'Comment must be at most 5000 characters')
    .trim(),

  is_internal: z.boolean().default(false),

  attachments: z.array(z.object({
    filename: z.string(),
    url: z.string().url(),
    size: z.number(),
    mime_type: z.string(),
  })).max(5).optional(),
});

/**
 * Ticket filters schema
 */
export const ticketFiltersSchema = z.object({
  status: z.string().optional(),
  category_id: z.coerce.number().int().positive().optional(),
  subcategory_id: z.coerce.number().int().positive().optional(),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
  assigned_to: z.string().uuid().optional(),
  created_by: z.string().uuid().optional(),
  search: z.string().max(100).optional(),
  from_date: z.coerce.date().optional(),
  to_date: z.coerce.date().optional(),
});

export type CreateTicketInput = z.infer<typeof createTicketSchema>;
export type UpdateTicketInput = z.infer<typeof updateTicketSchema>;
export type CreateCommentInput = z.infer<typeof createCommentSchema>;
export type TicketFilters = z.infer<typeof ticketFiltersSchema>;
