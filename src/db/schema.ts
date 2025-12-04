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
// Enums
// ============================================

export const roleEnum = pgEnum('role', [
  'super_admin',
  'admin', 
  'committee',
  'student',
]);

export const scopeModeEnum = pgEnum('scope_mode', [
  'fixed',    // Fixed location (e.g., specific hostel)
  'dynamic',  // Dynamic based on user profile
  'none',     // No scoping
]);

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
  id: varchar('id', { length: 100 }).primaryKey(), // Clerk user ID
  external_id: varchar('external_id', { length: 100 }).notNull().unique(), // Clerk external ID  
  email: varchar('email', { length: 255 }).notNull().unique(),
  phone: varchar('phone', { length: 20 }),
  full_name: varchar('full_name', { length: 255 }),
  avatar_url: text('avatar_url'),
  role_id: integer('role_id').references(() => roles.id),
  is_active: boolean('is_active').notNull().default(true),
  version: integer('version').notNull().default(1), // Optimistic locking
  created_at: timestamp('created_at').notNull().defaultNow(),
  updated_at: timestamp('updated_at').notNull().defaultNow(),
}, (table) => ({
  externalIdIdx: index('users_external_id_idx').on(table.external_id),
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
  capacity: integer('capacity'),
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
  user_id: varchar('user_id', { length: 100 }).notNull().unique()
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
  updated_at: timestamp('created_at').notNull().defaultNow(),
}, (table) => ({
  userIdx: uniqueIndex('students_user_idx').on(table.user_id),
  rollNoIdx: index('students_roll_no_idx').on(table.roll_no),
  hostelIdx: index('students_hostel_idx').on(table.hostel_id),
}));

export const admin_profiles = pgTable('admin_profiles', {
  id: serial('id').primaryKey(),
  user_id: varchar('user_id', { length: 100 }).notNull().unique()
    .references(() => users.id, { onDelete: 'cascade' }),
  designation: varchar('designation', { length: 100 }),
  department: varchar('department', { length: 100 }),
  employee_id: varchar('employee_id', { length: 50 }).unique(),
  specialization: text('specialization'),
  created_at: timestamp('created_at').notNull().defaultNow(),
  updated_at: timestamp('updated_at').notNull().defaultNow(),
}, (table) => ({
  userIdx: uniqueIndex('admin_profiles_user_idx').on(table.user_id),
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
