/**
 * Dashboard Core Types
 * 
 * Centralized type definitions for dashboard functionality.
 * Strong typing to eliminate 'as any' casts.
 */

/**
 * Dashboard filters - unified across all admin roles
 */
export interface DashboardFilters {
  // Search
  search?: string;
  
  // Status & Escalation
  status?: string;
  escalated?: string;
  
  // Date Range
  from?: string;
  to?: string;
  
  // User
  user?: string;
  
  // Category & Subcategory
  category?: string;
  subcategory?: string;
  
  // Location & Scope
  location?: string;
  scope?: string;
  
  // TAT
  tat?: string;
  
  // Sorting & Pagination
  sort?: string;
  page?: string;
}

/**
 * Dashboard ticket row with all necessary fields
 * Properly typed to avoid 'as any' casts
 */
export interface DashboardTicketRow {
  id: number;
  title: string | null;
  description: string | null;
  location: string | null;
  status: string | null;
  status_id: number | null;
  category_id: number | null;
  subcategory_id: number | null;
  scope_id: number | null; // Add scope_id field
  created_by: string | null;
  assigned_to: string | null;
  group_id: number | null;
  escalation_level: number | null;
  acknowledgement_due_at: Date | null;
  resolution_due_at: Date | null;
  metadata: unknown;
  created_at: Date | null;
  updated_at: Date | null;
  category_name: string | null;
  subcategory_name: string | null;
  creator_full_name: string | null;
  creator_email: string | null;
  assigned_staff_name: string | null;
  assigned_staff_email: string | null;
  ticket_number?: string;
  priority?: string;
}

/**
 * Dashboard stats - separate global and filtered
 */
export interface DashboardStats {
  overall: {
    total: number;
    open: number;
    inProgress: number;
    awaitingStudent: number;
    resolved: number;
    escalated: number;
    unassigned: number;
  };
  filtered: {
    total: number;
    open: number;
    inProgress: number;
    awaitingStudent: number;
    resolved: number;
    escalated: number;
  };
}

/**
 * Dashboard query result with proper typing
 */
export interface DashboardQueryResult {
  rows: DashboardTicketRow[];
  totalCount: number; // Total matching filters (for pagination)
  globalStats: DashboardStats['overall']; // Stats for ALL tickets (not filtered)
}

/**
 * Pagination information
 */
export interface PaginationInfo {
  page: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
  totalCount: number;
  startIndex: number;
  endIndex: number;
  limit: number;
}

/**
 * Role policy interface
 * Each role defines its own visibility and assignment logic
 */
export interface RolePolicy {
  /**
   * Build base WHERE condition for ticket visibility
   * This defines which tickets the role can see
   * Can be async if it needs to fetch additional data
   * 
   * @param dbUser - Database user record
   * @param context - Additional context (e.g., adminAssignment for admin role)
   */
  buildBaseCondition(
    dbUser: { id: string; roleName: string | null; primary_domain_id: number | null } | null,
    context?: any
  ): Promise<any> | any; // Returns Drizzle SQL condition (can be async)
  
  /**
   * Get allowed filter fields for this role
   * Some roles may restrict certain filters
   */
  getAllowedFilters(): string[];
  
  /**
   * Role name identifier
   */
  roleName: 'admin' | 'snr-admin' | 'superadmin';
}

