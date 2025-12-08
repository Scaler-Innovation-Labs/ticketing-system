/**
 * Database Schema - Part 1: Foundation Tables
 * 
 * Production-ready schema with:
 * - Proper indexes
 * - Optimistic locking (version columns)
 * - Audit trails
 * - Type safety
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

// ============================================
// Core: Users & Roles
// ============================================

export const roles = pgTable('roles', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 50 }).notNull().unique(),
  description: text('description'),
  created_at: timestamp('created_at').notNull().defaultNow(),
});

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  auth_provider: varchar('auth_provider', { length: 64 }).notNull().default('clerk'), // e.g., 'clerk'
  external_id: varchar('external_id', { length: 100 }).notNull(), // Clerk ID
  email: varchar('email', { length: 255 }).notNull().unique(),
  phone: varchar('phone', { length: 20 }),
  full_name: varchar('full_name', { length: 255 }),
  avatar_url: text('avatar_url'),
  role_id: integer('role_id').references(() => roles.id),
  is_active: boolean('is_active').notNull().default(true),
  version: integer('version').notNull().default(1), // For optimistic locking
  created_at: timestamp('created_at').notNull().defaultNow(),
  updated_at: timestamp('updated_at').notNull().defaultNow(),
}, (table) => ({
  authExternalIdx: uniqueIndex('users_auth_external_idx').on(table.auth_provider, table.external_id),
  emailIdx: index('users_email_idx').on(table.email),
  roleIdx: index('users_role_idx').on(table.role_id),
}));

// ============================================
// Student Data
// ============================================

export const batches = pgTable('batches', {
  id: serial('id').primaryKey(),
  year: integer('year').notNull().unique(),
  name: varchar('name', { length: 100 }).notNull(),
  is_active: boolean('is_active').notNull().default(true),
  created_at: timestamp('created_at').notNull().defaultNow(),
});

export const hostels = pgTable('hostels', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 100 }).notNull().unique(),
  code: varchar('code', { length: 20 }).notNull().unique(),
  is_active: boolean('is_active').notNull().default(true),
  created_at: timestamp('created_at').notNull().defaultNow(),
});

export const class_sections = pgTable('class_sections', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 100 }).notNull(),
  department: varchar('department', { length: 100 }),
  batch_id: integer('batch_id').references(() => batches.id),
  is_active: boolean('is_active').notNull().default(true),
  created_at: timestamp('created_at').notNull().defaultNow(),
}, (table) => ({
  batchIdx: index('class_sections_batch_idx').on(table.batch_id),
}));

export const students = pgTable('students', {
  id: serial('id').primaryKey(),
  user_id: uuid('user_id').notNull().unique()
    .references(() => users.id, { onDelete: 'cascade' }),
  roll_no: varchar('roll_no', { length: 50 }).unique(),
  room_no: varchar('room_no', { length: 20 }),
  hostel_id: integer('hostel_id').references(() => hostels.id),
  class_section_id: integer('class_section_id').references(() => class_sections.id),
  batch_id: integer('batch_id').references(() => batches.id),
  department: varchar('department', { length: 100 }),
  blood_group: varchar('blood_group', { length: 5 }),
  parent_name: varchar('parent_name', { length: 255 }),
  parent_phone: varchar('parent_phone', { length: 20 }),
  version: integer('version').notNull().default(1),
  created_at: timestamp('created_at').notNull().defaultNow(),
  updated_at: timestamp('updated_at').notNull().defaultNow(),
}, (table) => ({
  userIdx: uniqueIndex('students_user_idx').on(table.user_id),
  rollNoIdx: index('students_roll_no_idx').on(table.roll_no),
  hostelIdx: index('students_hostel_idx').on(table.hostel_id),
}));

export const admin_profiles = pgTable('admin_profiles', {
  id: serial('id').primaryKey(),
  user_id: uuid('user_id').notNull().unique()
    .references(() => users.id, { onDelete: 'cascade' }),
  employee_id: varchar('employee_id', { length: 50 }).unique(),
  slack_user_id: varchar('slack_user_id', { length: 50 }),
  primary_domain_id: integer('primary_domain_id').references(() => domains.id),
  primary_scope_id: integer('primary_scope_id').references(() => scopes.id),

  created_at: timestamp('created_at').notNull().defaultNow(),
  updated_at: timestamp('updated_at').notNull().defaultNow(),
}, (table) => ({
  userIdx: uniqueIndex('admin_profiles_user_idx').on(table.user_id),
}));

// ============================================
// Domains & Scopes (Moved from schema-tickets.ts)
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
  student_field_key: varchar('student_field_key', { length: 64 }), // hostel_id, class_section_id, batch_id
  is_active: boolean('is_active').notNull().default(true),
  created_at: timestamp('created_at').notNull().defaultNow(),
}, (table) => ({
  domainIdx: index('scopes_domain_idx').on(table.domain_id),
  referenceIdx: index('scopes_reference_idx').on(table.reference_type, table.reference_id),
  uniqueSlug: uniqueIndex('scopes_domain_slug_idx').on(table.domain_id, table.slug),
}));

// ============================================
// Type Exports
// ============================================

export type InsertUser = typeof users.$inferInsert;
export type SelectUser = typeof users.$inferSelect;

export type InsertStudent = typeof students.$inferInsert;
export type SelectStudent = typeof students.$inferSelect;

export type InsertAdminProfile = typeof admin_profiles.$inferInsert;
export type SelectAdminProfile = typeof admin_profiles.$inferSelect;
