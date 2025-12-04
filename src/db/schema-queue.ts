/**
 * Database Schema - Part 3: Queue & Concurrency Control
 * 
 * Enhanced outbox pattern and concurrency control tables
 * - Row-level locking support
 * - Idempotency keys
 * - Rate limiting
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

// ============================================
// Outbox Pattern (Enhanced)
// ============================================

export const outboxStatusEnum = pgEnum('outbox_status', [
  'pending',
  'processing',
  'completed',
  'failed',
  'dead_letter',
]);

export const outbox = pgTable('outbox', {
  id: serial('id').primaryKey(),
  
  // Event identification
  event_type: varchar('event_type', { length: 100 }).notNull(),
  aggregate_type: varchar('aggregate_type', { length: 50 }), // e.g., 'ticket', 'user'
  aggregate_id: varchar('aggregate_id', { length: 100 }),    // e.g., ticket ID
  
  // Payload
  payload: jsonb('payload').notNull(),
  
  // Processing state
  status: outboxStatusEnum('status').notNull().default('pending'),
  
  // Retry logic
  attempts: integer('attempts').notNull().default(0),
  max_attempts: integer('max_attempts').notNull().default(3),
  last_error: text('last_error'),
  
  // Priority (lower number = higher priority)
  priority: integer('priority').notNull().default(5),
  
  // Idempotency
  idempotency_key: varchar('idempotency_key', { length: 255 }).unique(),
  
  // Scheduling
  scheduled_at: timestamp('scheduled_at').notNull().defaultNow(),
  processing_started_at: timestamp('processing_started_at'),
  processed_at: timestamp('processed_at'),
  
  // Metadata
  created_at: timestamp('created_at').notNull().defaultNow(),
  created_by: varchar('created_by', { length: 100 }),
}, (table) => ({
  // Critical composite index for efficient job claiming
  claimIdx: index('outbox_claim_idx').on(table.status, table.scheduled_at, table.priority),
  statusIdx: index('outbox_status_idx').on(table.status),
  scheduledIdx: index('outbox_scheduled_idx').on(table.scheduled_at),
  aggregateIdx: index('outbox_aggregate_idx').on(table.aggregate_type, table.aggregate_id),
  idempotencyIdx: uniqueIndex('outbox_idempotency_idx').on(table.idempotency_key),
}));

// ============================================
// Idempotency Keys
// ============================================

export const idempotency_keys = pgTable('idempotency_keys', {
  key: varchar('key', { length: 64 }).primaryKey(),
  resource_type: varchar('resource_type', { length: 50 }).notNull(),
  resource_id: varchar('resource_id', { length: 100 }).notNull(),
  created_at: timestamp('created_at').notNull().defaultNow(),
  expires_at: timestamp('expires_at').notNull(),
}, (table) => ({
  expiresIdx: index('idempotency_expires_idx').on(table.expires_at),
  resourceIdx: index('idempotency_resource_idx').on(table.resource_type, table.resource_id),
}));

// ============================================
// API Rate Limiting (Optional - for accurate per-minute limits)
// ============================================

export const api_rate_limits = pgTable('api_rate_limits', {
  id: serial('id').primaryKey(),
  user_id: varchar('user_id', { length: 100 }).notNull(),
  endpoint: varchar('endpoint', { length: 100 }).notNull(),
  timestamp: timestamp('timestamp').notNull().defaultNow(),
}, (table) => ({
  // Compound index for efficient lookups and cleanup
  userEndpointTimeIdx: index('api_rate_limits_user_endpoint_time_idx')
    .on(table.user_id, table.endpoint, table.timestamp),
}));

// ============================================
// Type Exports
// ============================================

export type InsertOutbox = typeof outbox.$inferInsert;
export type SelectOutbox = typeof outbox.$inferSelect;

export type InsertIdempotencyKey = typeof idempotency_keys.$inferInsert;
export type SelectIdempotencyKey = typeof idempotency_keys.$inferSelect;

export type InsertApiRateLimit = typeof api_rate_limits.$inferInsert;
export type SelectApiRateLimit = typeof api_rate_limits.$inferSelect;
