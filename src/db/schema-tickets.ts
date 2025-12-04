/**
 * Database Schema - Part 2: Ticketing Tables
 * 
 * Core ticketing system tables with proper relationships and indexes
 */

import {
  pgTable,
  serial,
  varchar,
  text,
  integer,
  timestamp,
  boolean,
  jsonb,
  index,
  uniqueIndex,
  pgEnum,
} from 'drizzle-orm/pg-core';
import { users, hostels, class_sections } from './schema';

// ============================================
// Domains & Categories
// ============================================

export const scopeModeEnum = pgEnum('scope_mode', [
  'fixed',
  'dynamic',
  'none',
]);

export const domains = pgTable('domains', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 100 }).notNull().unique(),
  slug: varchar('slug', { length: 100 }).notNull().unique(),
  description: text('description'),
  scope_mode: scopeModeEnum('scope_mode').notNull().default('none'),
  is_active: boolean('is_active').notNull().default(true),
  created_at: timestamp('created_at').notNull().defaultNow(),
});

export const scopes = pgTable('scopes', {
  id: serial('id').primaryKey(),
  domain_id: integer('domain_id').notNull().references(() => domains.id),
  name: varchar('name', { length: 100 }).notNull(),
  slug: varchar('slug', { length: 100 }).notNull(),
  reference_type: varchar('reference_type', { length: 50 }),
  reference_id: integer('reference_id'),
  is_active: boolean('is_active').notNull().default(true),
  created_at: timestamp('created_at').notNull().defaultNow(),
}, (table) => ({
  domainIdx: index('scopes_domain_idx').on(table.domain_id),
  referenceIdx: index('scopes_reference_idx').on(table.reference_type, table.reference_id),
  uniqueSlug: uniqueIndex('scopes_domain_slug_idx').on(table.domain_id, table.slug),
}));

export const categories = pgTable('categories', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 100 }).notNull(),
  slug: varchar('slug', { length: 100 }).notNull(),
  description: text('description'),
  icon: varchar('icon', { length: 50 }),
  color: varchar('color', { length: 20 }),
  domain_id: integer('domain_id').references(() => domains.id),
  scope_id: integer('scope_id').references(() => scopes.id),
  parent_category_id: integer('parent_category_id'), // Self-reference for hierarchy
  default_admin_id: varchar('default_admin_id', { length: 100 }).references(() => users.id),
  sla_hours: integer('sla_hours').default(48),
  display_order: integer('display_order').default(0),
  is_active: boolean('is_active').notNull().default(true),
  created_at: timestamp('created_at').notNull().defaultNow(),
  updated_at: timestamp('updated_at').notNull().defaultNow(),
}, (table) => ({
  slugIdx: uniqueIndex('categories_slug_idx').on(table.slug),
  domainIdx: index('categories_domain_idx').on(table.domain_id),
  scopeIdx: index('categories_scope_idx').on(table.scope_id),
  parentIdx: index('categories_parent_idx').on(table.parent_category_id),
}));

export const subcategories = pgTable('subcategories', {
  id: serial('id').primaryKey(),
  category_id: integer('category_id').notNull().references(() => categories.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 100 }).notNull(),
  slug: varchar('slug', { length: 100 }).notNull(),
  description: text('description'),
  display_order: integer('display_order').default(0),
  is_active: boolean('is_active').notNull().default(true),
  created_at: timestamp('created_at').notNull().defaultNow(),
}, (table) => ({
  categoryIdx: index('subcategories_category_idx').on(table.category_id),
  uniqueSlug: uniqueIndex('subcategories_category_slug_idx').on(table.category_id, table.slug),
}));

// ============================================
// Ticket Status
// ============================================

export const ticket_statuses = pgTable('ticket_statuses', {
  id: serial('id').primaryKey(),
  value: varchar('value', { length: 50 }).notNull().unique(),
  label: varchar('label', { length: 100 }).notNull(),
  description: text('description'),
  color: varchar('color', { length: 20 }),
  progress_percent: integer('progress_percent').default(0),
  is_active: boolean('is_active').notNull().default(true),
  display_order: integer('display_order').default(0),
  created_at: timestamp('created_at').notNull().defaultNow(),
});

// ============================================
// Tickets
// ============================================

export const tickets = pgTable('tickets', {
  id: serial('id').primaryKey(),
  title: varchar('title', { length: 255 }),
  description: text('description').notNull(),
  location: varchar('location', { length: 500 }),
  
  // Classification
  category_id: integer('category_id').notNull().references(() => categories.id),
  subcategory_id: integer('subcategory_id').references(() => subcategories.id),
  scope_id: integer('scope_id').references(() => scopes.id),
  
  // Assignment
  created_by: varchar('created_by', { length: 100 }).notNull().references(() => users.id),
  assigned_to: varchar('assigned_to', { length: 100 }).references(() => users.id),
  
  // Status
  status_id: integer('status_id').notNull().references(() => ticket_statuses.id),
  
  // Escalation
  escalation_level: integer('escalation_level').notNull().default(0),
  forward_count: integer('forward_count').notNull().default(0),
  reopen_count: integer('reopen_count').notNull().default(0),
  
  // Deadlines
  acknowledgement_due_at: timestamp('acknowledgement_due_at'),
  resolution_due_at: timestamp('resolution_due_at'),
  resolved_at: timestamp('resolved_at'),
  closed_at: timestamp('closed_at'),
  
  // Metadata  
  metadata: jsonb('metadata'), // Dynamic fields, profile snapshots
  attachments: jsonb('attachments'), // Array of attachment info
  
  // Audit
  created_at: timestamp('created_at').notNull().defaultNow(),
  updated_at: timestamp('updated_at').notNull().defaultNow(),
}, (table) => ({
  createdByIdx: index('tickets_created_by_idx').on(table.created_by),
  assignedToIdx: index('tickets_assigned_to_idx').on(table.assigned_to),
  statusIdx: index('tickets_status_idx').on(table.status_id),
  categoryIdx: index('tickets_category_idx').on(table.category_id),
  createdAtIdx: index('tickets_created_at_idx').on(table.created_at),
  // Composite index for rate limiting queries
  createdByCreatedAtIdx: index('tickets_created_by_created_at_idx')
    .on(table.created_by, table.created_at),
}));

// ============================================
// Ticket Activity
// ============================================

export const ticket_activity = pgTable('ticket_activity', {
  id: serial('id').primaryKey(),
  ticket_id: integer('ticket_id').notNull().references(() => tickets.id, { onDelete: 'cascade' }),
  user_id: varchar('user_id', { length: 100 }).references(() => users.id),
  action: varchar('action', { length: 50 }).notNull(),
  details: jsonb('details'),
  visibility: varchar('visibility', { length: 20 }).default('student_visible'),
  created_at: timestamp('created_at').notNull().defaultNow(),
}, (table) => ({
  ticketIdx: index('ticket_activity_ticket_idx').on(table.ticket_id),
  createdAtIdx: index('ticket_activity_created_at_idx').on(table.created_at),
}));

// ============================================
// Ticket Feedback
// ============================================

export const ticket_feedback = pgTable('ticket_feedback', {
  id: serial('id').primaryKey(),
  ticket_id: integer('ticket_id').notNull().unique().references(() => tickets.id, { onDelete: 'cascade' }),
  rating: integer('rating').notNull(), // 1-5
  feedback: text('feedback'),
  created_at: timestamp('created_at').notNull().defaultNow(),
}, (table) => ({
  ticketIdx: uniqueIndex('ticket_feedback_ticket_idx').on(table.ticket_id),
  ratingIdx: index('ticket_feedback_rating_idx').on(table.rating),
}));

// ============================================
// Type Exports
// ============================================

export type InsertTicket = typeof tickets.$inferInsert;
export type SelectTicket = typeof tickets.$inferSelect;

export type InsertCategory = typeof categories.$inferInsert;
export type SelectCategory = typeof categories.$inferSelect;

export type InsertTicketActivity = typeof ticket_activity.$inferInsert;
export type SelectTicketActivity = typeof ticket_activity.$inferSelect;
