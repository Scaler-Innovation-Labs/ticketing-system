/**
 * Database Schema - Part 4: Notifications & Integrations
 * 
 * Tables for notification delivery, channel routing, and external integrations
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
} from 'drizzle-orm/pg-core';
import { users } from './schema';
import { tickets, categories, subcategories, scopes, domains, committees } from './schema-tickets';

// ============================================
// Notifications
// ============================================

export const notifications = pgTable('notifications', {
  id: serial('id').primaryKey(),
  user_id: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
  ticket_id: integer('ticket_id').references(() => tickets.id, { onDelete: 'cascade' }),

  // Channel: 'slack', 'email', 'in_app'
  channel: varchar('channel', { length: 32 }).notNull(),
  notification_type: varchar('notification_type', { length: 50 }).notNull(),

  // External message IDs for tracking
  slack_message_id: varchar('slack_message_id', { length: 255 }),
  email_message_id: varchar('email_message_id', { length: 255 }),

  // Timestamps
  created_at: timestamp('created_at').notNull().defaultNow(),
  sent_at: timestamp('sent_at'),
}, (table) => ({
  userIdx: index('notifications_user_idx').on(table.user_id),
  ticketIdx: index('notifications_ticket_idx').on(table.ticket_id),
  channelIdx: index('notifications_channel_idx').on(table.channel),
}));

// ============================================
// Notification Channels (Flexible Routing)
// ============================================

export const notification_channels = pgTable('notification_channels', {
  id: serial('id').primaryKey(),

  // Owner type: 'domain', 'scope', 'category', 'committee', 'user', 'ticket'
  owner_type: varchar('owner_type', { length: 32 }).notNull(),
  owner_id: varchar('owner_id', { length: 255 }).notNull(),

  // Channel type: 'slack', 'email', 'webhook'
  channel_type: varchar('channel_type', { length: 32 }).notNull().default('slack'),

  // Slack configuration
  slack_channel_id: varchar('slack_channel_id', { length: 255 }),
  slack_thread: varchar('slack_thread', { length: 255 }),
  slack_user_id: varchar('slack_user_id', { length: 128 }),

  // Priority: higher priority overrides lower
  // Ticket = 100, Category = 50, Scope = 40, Domain = 30, Committee = 20, User = 10
  priority: integer('priority').default(0),

  is_active: boolean('is_active').notNull().default(true),
  created_at: timestamp('created_at').notNull().defaultNow(),
  updated_at: timestamp('updated_at').notNull().defaultNow(),
}, (table) => ({
  ownerIdx: index('notification_channels_owner_idx').on(table.owner_type, table.owner_id),
  activeIdx: index('notification_channels_active_idx').on(table.is_active),
  typeIdx: index('notification_channels_type_idx').on(table.channel_type),
  priorityIdx: index('notification_channels_priority_idx').on(table.priority),
}));

// ============================================
// Notification Config (Per-scope settings)
// ============================================

export const notification_config = pgTable('notification_config', {
  id: serial('id').primaryKey(),

  // Scope-based configuration
  scope_id: integer('scope_id').references(() => scopes.id, { onDelete: 'cascade' }),
  category_id: integer('category_id').references(() => categories.id, { onDelete: 'cascade' }),
  subcategory_id: integer('subcategory_id').references(() => subcategories.id, { onDelete: 'cascade' }),

  // Notification channels enabled
  enable_slack: boolean('enable_slack').notNull().default(true),
  enable_email: boolean('enable_email').notNull().default(true),

  // Slack channel configuration
  slack_channel: varchar('slack_channel', { length: 255 }),
  slack_cc_user_ids: jsonb('slack_cc_user_ids'), // JSON array of Slack user IDs

  // Email recipients
  email_recipients: jsonb('email_recipients'), // JSON array of email addresses

  // Priority: higher priority overrides lower
  priority: integer('priority').notNull().default(0),

  is_active: boolean('is_active').notNull().default(true),
  created_at: timestamp('created_at').notNull().defaultNow(),
  updated_at: timestamp('updated_at').notNull().defaultNow(),
}, (table) => ({
  scopeIdx: index('notification_config_scope_idx').on(table.scope_id),
  categoryIdx: index('notification_config_category_idx').on(table.category_id),
  subcategoryIdx: index('notification_config_subcategory_idx').on(table.subcategory_id),
  activeIdx: index('notification_config_active_idx').on(table.is_active),
  priorityIdx: index('notification_config_priority_idx').on(table.priority),
}));

// ============================================
// Ticket Integrations (External refs)
// ============================================

export const ticket_integrations = pgTable('ticket_integrations', {
  ticket_id: integer('ticket_id')
    .references(() => tickets.id, { onDelete: 'cascade' })
    .primaryKey(),

  // Slack integration
  slack_thread_id: varchar('slack_thread_id', { length: 255 }),
  slack_channel_id: varchar('slack_channel_id', { length: 255 }),

  // Email integration
  email_thread_id: varchar('email_thread_id', { length: 255 }),

  // Quick links
  admin_link: varchar('admin_link', { length: 512 }),
  student_link: varchar('student_link', { length: 512 }),

  // External system reference
  external_ref: varchar('external_ref', { length: 64 }).unique(),

  created_at: timestamp('created_at').notNull().defaultNow(),
  updated_at: timestamp('updated_at').notNull().defaultNow(),
}, (table) => ({
  slackIdx: index('ticket_integrations_slack_idx').on(table.slack_thread_id),
  emailIdx: index('ticket_integrations_email_idx').on(table.email_thread_id),
}));



// ============================================
// Type Exports
// ============================================

export type InsertNotification = typeof notifications.$inferInsert;
export type SelectNotification = typeof notifications.$inferSelect;

export type InsertNotificationChannel = typeof notification_channels.$inferInsert;
export type SelectNotificationChannel = typeof notification_channels.$inferSelect;

export type InsertNotificationConfig = typeof notification_config.$inferInsert;
export type SelectNotificationConfig = typeof notification_config.$inferSelect;

export type InsertTicketIntegration = typeof ticket_integrations.$inferInsert;
export type SelectTicketIntegration = typeof ticket_integrations.$inferSelect;


