/**
 * Database Schema - Part 2: Ticketing Tables
 * 
 * Core ticketing system tables with proper relationships and indexes
 */

import {
  pgTable,
  serial,
  uuid,
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
import { users, hostels, class_sections, domains, scopes, scopeModeEnum } from './schema';

// ============================================
// Enums
// ============================================



// ============================================
// Committees
// ============================================

export const committees = pgTable('committees', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 140 }).notNull().unique(),
  description: text('description'),
  contact_email: varchar('contact_email', { length: 256 }),
  head_id: uuid('head_id').references(() => users.id, { onDelete: 'set null' }),
  is_active: boolean('is_active').default(true),
  created_at: timestamp('created_at').defaultNow(),
  updated_at: timestamp('updated_at').defaultNow(),
}, (table) => ({
  nameIdx: index('committees_name_idx').on(table.name),
  headIdx: index('committees_head_idx').on(table.head_id),
}));

// ============================================
// Domains & Categories
// ============================================

export { domains, scopes, scopeModeEnum };

export const categories = pgTable('categories', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 100 }).notNull(),
  slug: varchar('slug', { length: 100 }).notNull(),
  description: text('description'),
  icon: varchar('icon', { length: 50 }),
  color: varchar('color', { length: 20 }),
  domain_id: integer('domain_id').references(() => domains.id),
  scope_id: integer('scope_id').references(() => scopes.id),
  scope_mode: scopeModeEnum('scope_mode').notNull().default('dynamic'),
  parent_category_id: integer('parent_category_id'),
  default_admin_id: uuid('default_admin_id').references(() => users.id),
  sla_hours: integer('sla_hours').default(48),
  display_order: integer('display_order').default(0),
  is_active: boolean('is_active').notNull().default(true),
  created_at: timestamp('created_at').notNull().defaultNow(),
  updated_at: timestamp('updated_at').notNull().defaultNow(),
}, (table) => ({
  slugIdx: uniqueIndex('categories_slug_idx').on(table.slug),
  domainIdx: index('categories_domain_idx').on(table.domain_id),
  scopeIdx: index('categories_scope_idx').on(table.scope_id),
  defaultAdminIdx: index('categories_default_admin_idx').on(table.default_admin_id),
  parentIdx: index('categories_parent_idx').on(table.parent_category_id),
  // Index for filtering active categories (frequently queried)
  isActiveIdx: index('categories_is_active_idx').on(table.is_active),
  // Composite index for common queries
  activeDisplayOrderIdx: index('categories_active_display_order_idx')
    .on(table.is_active, table.display_order),
}));

export const subcategories = pgTable('subcategories', {
  id: serial('id').primaryKey(),
  category_id: integer('category_id').notNull().references(() => categories.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 100 }).notNull(),
  slug: varchar('slug', { length: 100 }).notNull(),
  description: text('description'),
  assigned_admin_id: uuid('assigned_admin_id').references(() => users.id),
  sla_hours: integer('sla_hours'),
  display_order: integer('display_order').default(0),
  is_active: boolean('is_active').notNull().default(true),
  created_at: timestamp('created_at').notNull().defaultNow(),
  updated_at: timestamp('updated_at').notNull().defaultNow(),
}, (table) => ({
  categoryIdx: index('subcategories_category_idx').on(table.category_id),
  assignedAdminIdx: index('subcategories_assigned_admin_idx').on(table.assigned_admin_id),
  uniqueSlug: uniqueIndex('subcategories_category_slug_idx').on(table.category_id, table.slug),
  // Index for filtering active subcategories
  isActiveIdx: index('subcategories_is_active_idx').on(table.is_active),
  // Composite index for common queries (category + active + display_order)
  categoryActiveDisplayIdx: index('subcategories_category_active_display_idx')
    .on(table.category_id, table.is_active, table.display_order),
}));

// ============================================
// Category Fields (Dynamic Forms)
// ============================================

export const category_fields = pgTable('category_fields', {
  id: serial('id').primaryKey(),
  subcategory_id: integer('subcategory_id').notNull().references(() => subcategories.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 100 }).notNull(),
  slug: varchar('slug', { length: 100 }).notNull(),
  field_type: varchar('field_type', { length: 50 }).notNull(), // text, textarea, select, multiselect, date, number
  required: boolean('required').notNull().default(false),
  placeholder: varchar('placeholder', { length: 255 }),
  options: jsonb('options'), // For select/multiselect fields
  validation: jsonb('validation'), // Validation rules (min, max, regex, etc.)
  assigned_admin_id: uuid('assigned_admin_id').references(() => users.id), // Admin assigned to handle tickets with this field value
  display_order: integer('display_order').default(0),
  is_active: boolean('is_active').notNull().default(true),
  created_at: timestamp('created_at').notNull().defaultNow(),
  updated_at: timestamp('updated_at').notNull().defaultNow(),
}, (table) => ({
  subcategoryIdx: index('category_fields_subcategory_idx').on(table.subcategory_id),
  assignedAdminIdx: index('category_fields_assigned_admin_idx').on(table.assigned_admin_id),
  uniqueSlug: uniqueIndex('category_fields_subcategory_slug_idx').on(table.subcategory_id, table.slug),
  // Composite index for field-level assignment queries
  subcategoryAdminIdx: index('category_fields_subcategory_admin_idx')
    .on(table.subcategory_id, table.assigned_admin_id),
}));

// ============================================
// Category Assignments
// ============================================

export const category_assignments = pgTable('category_assignments', {
  id: serial('id').primaryKey(),
  category_id: integer('category_id').notNull().references(() => categories.id, { onDelete: 'cascade' }),
  user_id: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  assignment_type: varchar('assignment_type', { length: 50 }), // primary, backup, etc.
  created_at: timestamp('created_at').notNull().defaultNow(),
}, (table) => ({
  categoryIdx: index('idx_cat_assign_category').on(table.category_id),
  userIdx: index('idx_cat_assign_user').on(table.user_id),
  uniqueAssignment: uniqueIndex('idx_cat_assign_unique').on(table.category_id, table.user_id),
}));

// ============================================
// Ticket Groups
// ============================================

export const ticket_groups = pgTable('ticket_groups', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 100 }).notNull(),
  description: text('description'),
  created_by: uuid('created_by').references(() => users.id),
  is_active: boolean('is_active').notNull().default(true),
  created_at: timestamp('created_at').notNull().defaultNow(),
  updated_at: timestamp('updated_at').notNull().defaultNow(),
});

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
  is_final: boolean('is_final').notNull().default(false),
  display_order: integer('display_order').default(0),
  created_at: timestamp('created_at').notNull().defaultNow(),
});

// ============================================
// Tickets
// ============================================

export const tickets = pgTable('tickets', {
  id: serial('id').primaryKey(),
  ticket_number: varchar('ticket_number', { length: 50 }).notNull().unique(),
  title: varchar('title', { length: 255 }).notNull(),
  description: text('description').notNull(),
  location: varchar('location', { length: 500 }),
  priority: varchar('priority', { length: 20 }).notNull().default('medium'),

  // Classification
  category_id: integer('category_id').notNull().references(() => categories.id),
  subcategory_id: integer('subcategory_id').references(() => subcategories.id),
  scope_id: integer('scope_id').references(() => scopes.id),

  // Assignment
  created_by: uuid('created_by').notNull().references(() => users.id, { onDelete: 'set null' }),
  assigned_to: uuid('assigned_to').references(() => users.id, { onDelete: 'set null' }),

  // Grouping
  group_id: integer('group_id').references(() => ticket_groups.id, { onDelete: 'set null' }),

  // Status
  status_id: integer('status_id').notNull().references(() => ticket_statuses.id),

  // Escalation
  escalation_level: integer('escalation_level').notNull().default(0),
  escalated_at: timestamp('escalated_at'),
  forward_count: integer('forward_count').notNull().default(0),
  reopen_count: integer('reopen_count').notNull().default(0),
  tat_extensions: integer('tat_extensions').notNull().default(0),

  // Deadlines
  acknowledgement_due_at: timestamp('acknowledgement_due_at'),
  resolution_due_at: timestamp('resolution_due_at'),
  resolved_at: timestamp('resolved_at'),
  closed_at: timestamp('closed_at'),
  reopened_at: timestamp('reopened_at'),

  // Metadata  
  metadata: jsonb('metadata'), // Dynamic fields, profile snapshots
  attachments: jsonb('attachments'), // Array of attachment info (for backward compatibility)

  // Audit
  created_at: timestamp('created_at').notNull().defaultNow(),
  updated_at: timestamp('updated_at').notNull().defaultNow(),
}, (table) => ({
  ticketNumberIdx: uniqueIndex('tickets_ticket_number_idx').on(table.ticket_number),
  createdByIdx: index('tickets_created_by_idx').on(table.created_by),
  assignedToIdx: index('tickets_assigned_to_idx').on(table.assigned_to),
  statusIdx: index('tickets_status_idx').on(table.status_id),
  categoryIdx: index('tickets_category_idx').on(table.category_id),
  subcategoryIdx: index('tickets_subcategory_idx').on(table.subcategory_id),
  scopeIdx: index('tickets_scope_idx').on(table.scope_id),
  groupIdx: index('tickets_group_idx').on(table.group_id),
  createdAtIdx: index('tickets_created_at_idx').on(table.created_at),
  // Composite index for rate limiting queries
  createdByCreatedAtIdx: index('tickets_created_by_created_at_idx')
    .on(table.created_by, table.created_at),
  // Composite index for common filtering patterns
  categorySubcategoryIdx: index('tickets_category_subcategory_idx')
    .on(table.category_id, table.subcategory_id),
  statusCategoryIdx: index('tickets_status_category_idx')
    .on(table.status_id, table.category_id),
}));

// ============================================
// Ticket Activity
// ============================================

export const ticket_activity = pgTable('ticket_activity', {
  id: serial('id').primaryKey(),
  ticket_id: integer('ticket_id').notNull().references(() => tickets.id, { onDelete: 'cascade' }),
  user_id: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  action: varchar('action', { length: 50 }).notNull(),
  details: jsonb('details'),
  visibility: varchar('visibility', { length: 20 }).default('student_visible'),
  created_at: timestamp('created_at').notNull().defaultNow(),
}, (table) => ({
  ticketIdx: index('ticket_activity_ticket_idx').on(table.ticket_id),
  createdAtIdx: index('ticket_activity_created_at_idx').on(table.created_at),
}));

// ============================================
// Ticket Attachments
// ============================================

export const ticket_attachments = pgTable('ticket_attachments', {
  id: serial('id').primaryKey(),
  ticket_id: integer('ticket_id').notNull().references(() => tickets.id, { onDelete: 'cascade' }),
  uploaded_by: uuid('uploaded_by').references(() => users.id, { onDelete: 'set null' }),
  file_name: varchar('file_name', { length: 255 }).notNull(),
  file_url: text('file_url').notNull(),
  file_size: integer('file_size'), // in bytes
  mime_type: varchar('mime_type', { length: 100 }),
  created_at: timestamp('created_at').notNull().defaultNow(),
}, (table) => ({
  ticketIdx: index('ticket_attachments_ticket_idx').on(table.ticket_id),
  uploadedByIdx: index('ticket_attachments_uploaded_by_idx').on(table.uploaded_by),
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
// Ticket Committee Tags
// ============================================

export const ticket_committee_tags = pgTable('ticket_committee_tags', {
  id: serial('id').primaryKey(),
  ticket_id: integer('ticket_id').notNull().references(() => tickets.id, { onDelete: 'cascade' }),
  committee_id: integer('committee_id').notNull().references(() => committees.id, { onDelete: 'cascade' }),
  tagged_by: uuid('tagged_by').references(() => users.id, { onDelete: 'set null' }),
  created_at: timestamp('created_at').notNull().defaultNow(),
}, (table) => ({
  ticketIdx: index('ticket_committee_tags_ticket_idx').on(table.ticket_id),
  committeeIdx: index('ticket_committee_tags_committee_idx').on(table.committee_id),
  uniqueTag: uniqueIndex('ticket_committee_tags_ticket_committee_idx').on(table.ticket_id, table.committee_id),
}));

// ============================================
// Admin Assignments (which domains/scopes an admin manages)
// ============================================

export const admin_assignments = pgTable('admin_assignments', {
  id: serial('id').primaryKey(),
  user_id: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  domain_id: integer('domain_id').notNull().references(() => domains.id, { onDelete: 'cascade' }),
  scope_id: integer('scope_id').references(() => scopes.id, { onDelete: 'cascade' }),
  created_at: timestamp('created_at').notNull().defaultNow(),
}, (table) => ({
  userIdx: index('admin_assignments_user_idx').on(table.user_id),
  domainIdx: index('admin_assignments_domain_idx').on(table.domain_id),
  scopeIdx: index('admin_assignments_scope_idx').on(table.scope_id),
  uniqueAssignment: uniqueIndex('admin_assignments_user_domain_scope_idx').on(table.user_id, table.domain_id, table.scope_id),
}));

// ============================================
// Escalation Rules
// ============================================

export const escalation_rules = pgTable('escalation_rules', {
  id: serial('id').primaryKey(),
  domain_id: integer('domain_id').references(() => domains.id, { onDelete: 'cascade' }),
  scope_id: integer('scope_id').references(() => scopes.id, { onDelete: 'cascade' }),
  level: integer('level').notNull(), // 1, 2, 3, etc.
  escalate_to_user_id: uuid('escalate_to_user_id').references(() => users.id, { onDelete: 'set null' }),
  tat_hours: integer('tat_hours').default(48), // Time to resolve before next escalation
  notify_channel: varchar('notify_channel', { length: 50 }), // slack, email, etc.
  is_active: boolean('is_active').notNull().default(true),
  created_at: timestamp('created_at').notNull().defaultNow(),
  updated_at: timestamp('updated_at').notNull().defaultNow(),
}, (table) => ({
  domainIdx: index('escalation_rules_domain_idx').on(table.domain_id),
  scopeIdx: index('escalation_rules_scope_idx').on(table.scope_id),
  levelIdx: index('escalation_rules_level_idx').on(table.level),
  uniqueRule: uniqueIndex('escalation_rules_domain_scope_level_idx').on(table.domain_id, table.scope_id, table.level),
}));

// ============================================
// Committee Members
// ============================================

export const committee_members = pgTable('committee_members', {
  id: serial('id').primaryKey(),
  committee_id: integer('committee_id').notNull().references(() => committees.id, { onDelete: 'cascade' }),
  user_id: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  role: varchar('role', { length: 50 }), // head, member, secretary, etc.
  joined_at: timestamp('joined_at').notNull().defaultNow(),
}, (table) => ({
  committeeIdx: index('committee_members_committee_idx').on(table.committee_id),
  userIdx: index('committee_members_user_idx').on(table.user_id),
  uniqueMembership: uniqueIndex('committee_members_committee_user_idx').on(table.committee_id, table.user_id),
}));

// ============================================
// Field Options (for select/multiselect fields)
// ============================================

export const field_options = pgTable('field_options', {
  id: serial('id').primaryKey(),
  field_id: integer('field_id').notNull().references(() => category_fields.id, { onDelete: 'cascade' }),
  label: varchar('label', { length: 100 }).notNull(),
  value: varchar('value', { length: 100 }).notNull(),
  display_order: integer('display_order').default(0),
  is_active: boolean('is_active').notNull().default(true),
  created_at: timestamp('created_at').notNull().defaultNow(),
}, (table) => ({
  fieldIdx: index('field_options_field_idx').on(table.field_id),
}));

// ============================================
// Ticket Filters (Saved Filter Configurations)
// ============================================

export const ticket_filters = pgTable('ticket_filters', {
  id: serial('id').primaryKey(),
  user_id: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 100 }).notNull(),
  filter_config: jsonb('filter_config').notNull(), // Saved filter JSON
  is_default: boolean('is_default').notNull().default(false),
  created_at: timestamp('created_at').notNull().defaultNow(),
  updated_at: timestamp('updated_at').notNull().defaultNow(),
}, (table) => ({
  userIdx: index('ticket_filters_user_idx').on(table.user_id),
}));

// ============================================
// Ticket Comments
// ============================================

export const ticket_comments = pgTable('ticket_comments', {
  id: serial('id').primaryKey(),
  ticket_id: integer('ticket_id').notNull().references(() => tickets.id, { onDelete: 'cascade' }),
  user_id: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  comment: text('comment').notNull(),
  is_internal: boolean('is_internal').notNull().default(false),
  created_at: timestamp('created_at').notNull().defaultNow(),
}, (table) => ({
  ticketIdx: index('ticket_comments_ticket_idx').on(table.ticket_id),
  userIdx: index('ticket_comments_user_idx').on(table.user_id),
}));

// ============================================
// Ticket Watchers
// ============================================

export const ticket_watchers = pgTable('ticket_watchers', {
  id: serial('id').primaryKey(),
  ticket_id: integer('ticket_id').notNull().references(() => tickets.id, { onDelete: 'cascade' }),
  user_id: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  added_at: timestamp('added_at').notNull().defaultNow(),
}, (table) => ({
  ticketIdx: index('ticket_watchers_ticket_idx').on(table.ticket_id),
  userIdx: index('ticket_watchers_user_idx').on(table.user_id),
  uniqueWatcher: uniqueIndex('ticket_watchers_ticket_user_idx').on(table.ticket_id, table.user_id),
}));

// ============================================
// Ticket Tags
// ============================================

export const ticket_tags = pgTable('ticket_tags', {
  id: serial('id').primaryKey(),
  ticket_id: integer('ticket_id').notNull().references(() => tickets.id, { onDelete: 'cascade' }),
  tag: varchar('tag', { length: 50 }).notNull(),
  created_at: timestamp('created_at').notNull().defaultNow(),
}, (table) => ({
  ticketIdx: index('ticket_tags_ticket_idx').on(table.ticket_id),
  tagIdx: index('ticket_tags_tag_idx').on(table.tag),
  uniqueTag: uniqueIndex('ticket_tags_ticket_tag_idx').on(table.ticket_id, table.tag),
}));

// ============================================
// Type Exports
// ============================================

export type InsertTicket = typeof tickets.$inferInsert;
export type SelectTicket = typeof tickets.$inferSelect;

export type InsertCategory = typeof categories.$inferInsert;
export type SelectCategory = typeof categories.$inferSelect;

export type InsertSubcategory = typeof subcategories.$inferInsert;
export type SelectSubcategory = typeof subcategories.$inferSelect;

export type InsertTicketActivity = typeof ticket_activity.$inferInsert;
export type SelectTicketActivity = typeof ticket_activity.$inferSelect;

export type InsertAdminAssignment = typeof admin_assignments.$inferInsert;
export type SelectAdminAssignment = typeof admin_assignments.$inferSelect;

export type InsertEscalationRule = typeof escalation_rules.$inferInsert;
export type SelectEscalationRule = typeof escalation_rules.$inferSelect;

export type InsertCommittee = typeof committees.$inferInsert;
export type SelectCommittee = typeof committees.$inferSelect;

export type InsertCommitteeMember = typeof committee_members.$inferInsert;
export type SelectCommitteeMember = typeof committee_members.$inferSelect;

export type InsertCategoryAssignment = typeof category_assignments.$inferInsert;
export type SelectCategoryAssignment = typeof category_assignments.$inferSelect;
