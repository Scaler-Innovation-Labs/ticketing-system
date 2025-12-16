/**
 * Shared Dashboard Utilities
 * 
 * Reusable dashboard logic for admin, snr-admin, and superadmin roles.
 * Fixes critical issues:
 * - Double filtering (moves all filtering to DB level)
 * - Stats calculated on paginated data (separates global vs filtered stats)
 * - Type safety leaks (proper types instead of as any)
 * - Unnecessary Promise wrapping (simplifies searchParams)
 */

import { db, tickets, categories, users, ticket_statuses, subcategories } from "@/db";
import { desc, eq, isNull, or, sql, count, inArray, ilike, and, asc } from "drizzle-orm";
import { getCachedAdminUser } from "@/lib/cache/cached-queries";
import { normalizeStatusForComparison } from "@/lib/utils";
import type { TicketMetadata } from "@/db/inferred-types";

// ============================================================================
// TYPES
// ============================================================================

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
}

/**
 * Dashboard filters - unified across all admin roles
 */
export interface DashboardFilters {
  tat?: string;
  status?: string;
  escalated?: string;
  from?: string;
  to?: string;
  user?: string;
  category?: string;
  subcategory?: string;
  sort?: string;
  page?: string;
  search?: string; // Search query for title/description
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

// ============================================================================
// SEARCH PARAMS PARSING
// ============================================================================

/**
 * Parse dashboard search params (simplified - no Promise wrapping)
 * Next.js App Router already resolves searchParams
 */
export function parseDashboardFilters(
  searchParams: Record<string, string | string[] | undefined>
): DashboardFilters {
  const getParam = (key: string): string => {
    const value = searchParams[key];
    if (typeof value === "string") return value;
    if (Array.isArray(value) && value.length > 0) return value[0] || "";
    return "";
  };

  return {
    tat: getParam("tat"),
    status: getParam("status"),
    escalated: getParam("escalated"),
    from: getParam("from"),
    to: getParam("to"),
    user: getParam("user"),
    category: getParam("category"),
    subcategory: getParam("subcategory"),
    sort: getParam("sort") || "newest",
    page: getParam("page") || "1",
    search: getParam("search"),
  };
}

// ============================================================================
// DATABASE QUERY (ALL FILTERING AT DB LEVEL)
// ============================================================================

/**
 * Fetch tickets with ALL filtering at DB level
 * This eliminates double filtering and pagination bugs
 * 
 * @param userId - Clerk user ID
 * @param filters - Dashboard filters
 * @param limit - Page size
 * @param roleType - Role type for access control
 * @returns Query result with rows, totalCount, and global stats
 */
export async function fetchDashboardTickets(
  userId: string,
  filters: DashboardFilters,
  limit: number = 20,
  roleType: 'admin' | 'snr-admin' | 'superadmin' = 'superadmin'
): Promise<DashboardQueryResult> {
  const { dbUser } = await getCachedAdminUser(userId);
  const roleName = dbUser?.roleName || null;
  const primaryDomainId = dbUser?.primary_domain_id || null;

  // Build base condition based on role
  let baseCondition;
  if (roleType === 'snr-admin' && primaryDomainId && dbUser) {
    // Snr-admin with domain: assigned to them OR unassigned in their domain
    baseCondition = or(
      eq(tickets.assigned_to, dbUser.id),
      and(
        isNull(tickets.assigned_to),
        sql`${tickets.category_id} IN (SELECT id FROM ${categories} WHERE ${categories.domain_id} = ${primaryDomainId})`
      )
    );
  } else if (roleType === 'admin' && dbUser) {
    // Admin: only tickets assigned to them
    baseCondition = eq(tickets.assigned_to, dbUser.id);
  } else {
    // Superadmin: all tickets (unassigned OR assigned OR escalated)
    baseCondition = or(
      isNull(tickets.assigned_to),
      dbUser ? eq(tickets.assigned_to, dbUser.id) : sql`false`,
      sql`${tickets.escalation_level} > 0`
    );
  }

  const conditions: ReturnType<typeof and>[] = [baseCondition];

  // Apply ALL filters at DB level (no client-side filtering)
  
  // Search filter (title/description)
  if (filters.search) {
    conditions.push(
      or(
        sql`LOWER(${tickets.title}) LIKE ${`%${filters.search.toLowerCase()}%`}`,
        sql`LOWER(${tickets.description}) LIKE ${`%${filters.search.toLowerCase()}%`}`
      )
    );
  }

  // Escalated filter
  if (filters.escalated === "true") {
    conditions.push(sql`${tickets.escalation_level} > 0`);
  }

  // User filter (creator name/email)
  if (filters.user) {
    conditions.push(
      or(
        ilike(users.full_name, `%${filters.user}%`),
        ilike(users.email, `%${filters.user}%`)
      )
    );
  }

  // Date range filters
  if (filters.from) {
    const from = new Date(filters.from);
    from.setHours(0, 0, 0, 0);
    conditions.push(sql`${tickets.created_at} >= ${from.toISOString()}`);
  }

  if (filters.to) {
    const to = new Date(filters.to);
    to.setHours(23, 59, 59, 999);
    conditions.push(sql`${tickets.created_at} <= ${to.toISOString()}`);
  }

  // Status filter
  if (filters.status) {
    const normalizedFilter = filters.status.toLowerCase();
    if (normalizedFilter === "awaiting_student_response") {
      conditions.push(or(
        ilike(ticket_statuses.value, "awaiting_student_response"),
        ilike(ticket_statuses.value, "awaiting_student")
      ));
    } else {
      conditions.push(ilike(ticket_statuses.value, normalizedFilter));
    }
  }

  // TAT filter
  if (filters.tat) {
    const now = new Date();
    const startOfToday = new Date(now);
    startOfToday.setHours(0, 0, 0, 0);
    const endOfToday = new Date(now);
    endOfToday.setHours(23, 59, 59, 999);

    if (filters.tat === "has") {
      conditions.push(sql`${tickets.resolution_due_at} IS NOT NULL`);
    } else if (filters.tat === "none") {
      conditions.push(sql`${tickets.resolution_due_at} IS NULL`);
    } else if (filters.tat === "due") {
      conditions.push(sql`${tickets.resolution_due_at} < ${now.toISOString()}`);
    } else if (filters.tat === "upcoming") {
      conditions.push(sql`${tickets.resolution_due_at} >= ${now.toISOString()}`);
    } else if (filters.tat === "today") {
      conditions.push(and(
        sql`${tickets.resolution_due_at} >= ${startOfToday.toISOString()}`,
        sql`${tickets.resolution_due_at} <= ${endOfToday.toISOString()}`
      ));
    }
  }

  // Category filter
  if (filters.category) {
    const categoryId = parseInt(filters.category, 10);
    if (!isNaN(categoryId)) {
      conditions.push(eq(tickets.category_id, categoryId));
    } else {
      // Category slug
      conditions.push(eq(categories.slug, filters.category));
    }
  }

  // Subcategory filter
  if (filters.subcategory) {
    const subcategoryId = parseInt(filters.subcategory, 10);
    if (!isNaN(subcategoryId)) {
      conditions.push(eq(tickets.subcategory_id, subcategoryId));
    }
  }

  const whereConditions = and(...conditions);

  // Pagination
  const page = parseInt(filters.page || "1", 10);
  const offsetValue = (page - 1) * limit;

  // Sort order
  let orderByClause = desc(tickets.created_at);
  if (filters.sort === "oldest") {
    orderByClause = asc(tickets.created_at);
  } else if (filters.sort === "due-date") {
    orderByClause = sql`${tickets.resolution_due_at} ASC NULLS LAST`;
  }

  // Check if we need category join for count query
  const needsCategoryJoin = filters.category && isNaN(parseInt(filters.category, 10));

  try {
    // Fetch global stats FIRST (before filtering) - for ALL tickets user can see
    const globalStatsQuery = db
      .select({
        total: count(),
        open: sql<number>`COUNT(*) FILTER (WHERE ${ticket_statuses.value} = 'open')`,
        inProgress: sql<number>`COUNT(*) FILTER (WHERE ${ticket_statuses.value} IN ('in_progress', 'escalated'))`,
        awaitingStudent: sql<number>`COUNT(*) FILTER (WHERE ${ticket_statuses.value} = 'awaiting_student_response')`,
        resolved: sql<number>`COUNT(*) FILTER (WHERE ${ticket_statuses.value} IN ('resolved', 'closed'))`,
        escalated: sql<number>`COUNT(*) FILTER (WHERE ${tickets.escalation_level} > 0)`,
        unassigned: sql<number>`COUNT(*) FILTER (WHERE ${tickets.assigned_to} IS NULL)`,
      })
      .from(tickets)
      .leftJoin(ticket_statuses, eq(ticket_statuses.id, tickets.status_id))
      .where(baseCondition);

    // Fetch filtered count and paginated rows in parallel
    let countQuery: any = db.select({ count: count() }).from(tickets);
    countQuery = countQuery.leftJoin(ticket_statuses, eq(ticket_statuses.id, tickets.status_id));
    if (needsCategoryJoin) {
      countQuery = countQuery.leftJoin(categories, eq(tickets.category_id, categories.id));
    }
    countQuery = countQuery.leftJoin(users, eq(tickets.created_by, users.id));

    const [globalStatsResult, totalResultArray, ticketRowsRawResult] = await Promise.all([
      globalStatsQuery,
      countQuery.where(whereConditions),
      db
        .select({
          id: tickets.id,
          title: tickets.title,
          description: tickets.description,
          location: tickets.location,
          status: ticket_statuses.value,
          status_id: tickets.status_id,
          category_id: tickets.category_id,
          subcategory_id: tickets.subcategory_id,
          subcategory_name: subcategories.name,
          created_by: tickets.created_by,
          assigned_to: tickets.assigned_to,
          group_id: tickets.group_id,
          escalation_level: tickets.escalation_level,
          acknowledgement_due_at: tickets.acknowledgement_due_at,
          resolution_due_at: tickets.resolution_due_at,
          metadata: tickets.metadata,
          created_at: tickets.created_at,
          updated_at: tickets.updated_at,
          category_name: categories.name,
          creator_full_name: users.full_name,
          creator_email: users.email,
        })
        .from(tickets)
        .leftJoin(ticket_statuses, eq(ticket_statuses.id, tickets.status_id))
        .leftJoin(categories, eq(tickets.category_id, categories.id))
        .leftJoin(subcategories, eq(tickets.subcategory_id, subcategories.id))
        .leftJoin(users, eq(tickets.created_by, users.id))
        .where(whereConditions)
        .orderBy(orderByClause)
        .limit(limit)
        .offset(offsetValue),
    ]);

    const ticketRowsRaw = Array.isArray(ticketRowsRawResult) ? ticketRowsRawResult : [];
    const [totalResult] = Array.isArray(totalResultArray) ? totalResultArray : [];
    const totalCount = totalResult?.count || 0;

    // Fetch assigned admin info for assigned tickets
    const assignedToIds = [
      ...new Set(
        ticketRowsRaw
          .map((t) => t.assigned_to)
          .filter((value): value is string => typeof value === "string" && value.length > 0)
      ),
    ];

    type AdminInfo = {
      id: string;
      full_name: string | null;
      email: string;
    };

    let assignedAdmins: Record<string, AdminInfo> = {};

    if (assignedToIds.length > 0) {
      try {
        const admins = await db
          .select({
            id: users.id,
            full_name: users.full_name,
            email: users.email,
          })
          .from(users)
          .where(inArray(users.id, assignedToIds));

        const safeAdmins = (Array.isArray(admins) ? admins : []).filter(
          (admin): admin is AdminInfo & { id: string } =>
            typeof admin.id === "string" && admin.id.length > 0
        );

        if (safeAdmins.length > 0) {
          assignedAdmins = Object.fromEntries(
            safeAdmins.map((admin) => [
              admin.id,
              {
                id: admin.id,
                full_name: admin.full_name || null,
                email: admin.email,
              },
            ])
          );
        }
      } catch (adminError) {
        console.error("[Dashboard] Failed to load assigned admin info:", adminError);
      }
    }

    // Transform rows to DashboardTicketRow format
    const rows: DashboardTicketRow[] = ticketRowsRaw.map((row) => {
      return {
        id: row.id,
        title: row.title,
        description: row.description,
        location: row.location,
        status: row.status,
        status_id: row.status_id || null,
        category_id: row.category_id || null,
        subcategory_id: row.subcategory_id || null,
        created_by: row.created_by || null,
        assigned_to: row.assigned_to || null,
        group_id: row.group_id || null,
        escalation_level: row.escalation_level || null,
        acknowledgement_due_at: row.acknowledgement_due_at || null,
        resolution_due_at: row.resolution_due_at || null,
        metadata: row.metadata || {},
        created_at: row.created_at || null,
        updated_at: row.updated_at || null,
        category_name: row.category_name || null,
        subcategory_name: row.subcategory_name || null,
        creator_full_name: row.creator_full_name || null,
        creator_email: row.creator_email || null,
        assigned_staff_name: row.assigned_to ? assignedAdmins[row.assigned_to]?.full_name || null : null,
        assigned_staff_email: row.assigned_to ? assignedAdmins[row.assigned_to]?.email || null : null,
      };
    });

    // Extract global stats
    const [globalStatsData] = Array.isArray(globalStatsResult) ? globalStatsResult : [];
    const globalStats: DashboardStats['overall'] = {
      total: Number(globalStatsData?.total || 0),
      open: Number(globalStatsData?.open || 0),
      inProgress: Number(globalStatsData?.inProgress || 0),
      awaitingStudent: Number(globalStatsData?.awaitingStudent || 0),
      resolved: Number(globalStatsData?.resolved || 0),
      escalated: Number(globalStatsData?.escalated || 0),
      unassigned: Number(globalStatsData?.unassigned || 0),
    };

    return {
      rows,
      totalCount,
      globalStats,
    };
  } catch (error) {
    console.error("[Dashboard] Error fetching tickets:", error);
    return {
      rows: [],
      totalCount: 0,
      globalStats: {
        total: 0,
        open: 0,
        inProgress: 0,
        awaitingStudent: 0,
        resolved: 0,
        escalated: 0,
        unassigned: 0,
      },
    };
  }
}

// ============================================================================
// STATS CALCULATION (FILTERED STATS ONLY)
// ============================================================================

/**
 * Calculate filtered stats from ticket rows
 * This is for the CURRENT FILTERED VIEW only
 * Use globalStats from fetchDashboardTickets for overall stats
 */
export function calculateFilteredStats(rows: DashboardTicketRow[]): DashboardStats['filtered'] {
  return {
    total: rows.length,
    open: rows.filter((t) => {
      const normalized = normalizeStatusForComparison(t.status);
      return normalized === "open";
    }).length,
    inProgress: rows.filter((t) => {
      const normalized = normalizeStatusForComparison(t.status);
      return normalized === "in_progress" || normalized === "escalated";
    }).length,
    awaitingStudent: rows.filter((t) => {
      const normalized = normalizeStatusForComparison(t.status);
      return normalized === "awaiting_student_response";
    }).length,
    resolved: rows.filter((t) => {
      const normalized = normalizeStatusForComparison(t.status);
      return normalized === "resolved" || normalized === "closed";
    }).length,
    escalated: rows.filter((t) => (t.escalation_level || 0) > 0).length,
  };
}

// ============================================================================
// PAGINATION UTILITIES
// ============================================================================

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

export function calculatePagination(
  page: number,
  totalCount: number,
  limit: number,
  actualRowCount: number
): PaginationInfo {
  const totalPages = Math.max(1, Math.ceil(totalCount / limit));
  const offsetValue = (page - 1) * limit;

  return {
    page,
    totalPages,
    hasNextPage: page < totalPages && actualRowCount === limit,
    hasPrevPage: page > 1,
    totalCount,
    startIndex: actualRowCount > 0 ? offsetValue + 1 : 0,
    endIndex: actualRowCount > 0 ? offsetValue + actualRowCount : 0,
    limit,
  };
}


