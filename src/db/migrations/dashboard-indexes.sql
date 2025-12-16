-- Dashboard Query Performance Indexes
-- 
-- CRITICAL: These indexes are required for dashboard performance
-- Apply these FIRST before any other optimizations
-- 
-- These indexes optimize common dashboard query patterns:
-- 1. Admin dashboard: assigned_to + status + created_at
-- 2. Escalated tickets: escalation_level + assigned_to
-- 3. Category filtering: category_id + status_id + created_at
-- 4. Date range queries: created_at + status_id
-- 5. TAT queries: resolution_due_at + status_id

-- ============================================
-- CRITICAL SINGLE-COLUMN INDEXES (HIGHEST ROI)
-- ============================================

-- assigned_to (most common filter for admin dashboard)
CREATE INDEX IF NOT EXISTS idx_tickets_assigned_to ON tickets(assigned_to);

-- status_id (used in every stats query)
CREATE INDEX IF NOT EXISTS idx_tickets_status_id ON tickets(status_id);

-- created_at (used for sorting and date filtering)
CREATE INDEX IF NOT EXISTS idx_tickets_created_at ON tickets(created_at DESC);

-- category_id (common filter)
CREATE INDEX IF NOT EXISTS idx_tickets_category_id ON tickets(category_id);

-- resolution_due_at (TAT queries)
CREATE INDEX IF NOT EXISTS idx_tickets_resolution_due_at ON tickets(resolution_due_at);

-- ============================================
-- COMPOSITE INDEXES (OPTIMIZE SPECIFIC QUERIES)
-- ============================================

-- Admin dashboard queries (assigned tickets with status filtering)
CREATE INDEX IF NOT EXISTS tickets_assigned_status_created_idx 
ON tickets(assigned_to, status_id, created_at DESC)
WHERE assigned_to IS NOT NULL;

-- Escalated tickets queries
CREATE INDEX IF NOT EXISTS tickets_escalation_assigned_idx 
ON tickets(escalation_level, assigned_to, created_at DESC)
WHERE escalation_level > 0;

-- Category + status filtering (common filter combination)
CREATE INDEX IF NOT EXISTS tickets_category_status_created_idx 
ON tickets(category_id, status_id, created_at DESC)
WHERE category_id IS NOT NULL;

-- Date range + status queries
CREATE INDEX IF NOT EXISTS tickets_created_status_idx 
ON tickets(created_at DESC, status_id);

-- TAT (resolution due date) queries
CREATE INDEX IF NOT EXISTS tickets_resolution_due_status_idx 
ON tickets(resolution_due_at, status_id)
WHERE resolution_due_at IS NOT NULL;

-- Scope filtering (for admin scope-based filtering)
CREATE INDEX IF NOT EXISTS tickets_scope_assigned_idx 
ON tickets(scope_id, assigned_to, created_at DESC)
WHERE scope_id IS NOT NULL;

-- Unassigned tickets (for admin dashboard Priority 3)
CREATE INDEX IF NOT EXISTS tickets_unassigned_category_idx 
ON tickets(assigned_to, category_id, created_at DESC)
WHERE assigned_to IS NULL;

-- Composite index for admin assignment queries (category + assigned + escalation)
CREATE INDEX IF NOT EXISTS tickets_category_assigned_escalation_idx 
ON tickets(category_id, assigned_to, escalation_level, created_at DESC);

-- ============================================
-- CATEGORIES TABLE INDEXES
-- ============================================

-- domain_id (used in admin assignment queries)
CREATE INDEX IF NOT EXISTS idx_categories_domain_id ON categories(domain_id);

