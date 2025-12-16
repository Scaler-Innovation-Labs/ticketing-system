/**
 * Fetch Dashboard Tickets (Core)
 * 
 * Centralized ticket fetching with DB-level filtering.
 * Uses role policies for visibility logic.
 * 
 * CRITICAL: All filtering happens at DB level - NO client-side filtering.
 */

import { db, tickets, categories, users, ticket_statuses, subcategories } from "@/db";
import { desc, eq, isNull, or, sql, count, inArray, ilike, and, asc } from "drizzle-orm";
import { getCachedAdminUser } from "@/lib/cache/cached-queries";
import type { DashboardFilters, DashboardQueryResult, RolePolicy } from "./types";
import { validatePaginationBounds } from "./pagination";
import { getCachedGlobalStats, generateStatsCacheKey } from "./cached-global-stats";

/**
 * Apply filters to DB query conditions
 * All filtering happens at SQL level - no client-side filtering
 */
function applyFiltersToConditions(
  filters: DashboardFilters,
  conditions: any[]
): void {
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

  // Location filter
  if (filters.location) {
    conditions.push(eq(tickets.location, filters.location));
  }

  // Scope filter (if scope_id column exists)
  if (filters.scope) {
    const scopeId = parseInt(filters.scope, 10);
    if (!isNaN(scopeId)) {
      conditions.push(eq(tickets.scope_id, scopeId));
    }
  }
}

/**
 * Fetch tickets with ALL filtering at DB level
 * 
 * @param userId - Clerk user ID
 * @param filters - Dashboard filters
 * @param limit - Page size
 * @param policy - Role policy for visibility logic
 * @returns Query result with rows, totalCount, and global stats
 */
export async function fetchDashboardTickets(
  userId: string,
  filters: DashboardFilters,
  limit: number,
  policy: RolePolicy,
  context?: any // Additional context for role policies (e.g., adminAssignment)
): Promise<DashboardQueryResult> {
  // Performance timing
  const startTime = performance.now();
  
  const { dbUser } = await getCachedAdminUser(userId);
  
  // Build base condition from role policy (may be async)
  // Pass additional context if needed (e.g., adminAssignment for admin role)
  const baseConditionStart = performance.now();
  const baseConditionResult = policy.buildBaseCondition(dbUser, context);
  const baseCondition = baseConditionResult instanceof Promise 
    ? await baseConditionResult 
    : baseConditionResult;
  const baseConditionTime = performance.now() - baseConditionStart;
  
  // Build filter conditions
  const filterConditions: any[] = [];
  applyFiltersToConditions(filters, filterConditions);
  
  // Combine base condition with filters
  const whereConditions = filterConditions.length > 0
    ? and(baseCondition, ...filterConditions)
    : baseCondition;

  // Pagination with bounds checking
  const page = parseInt(filters.page || "1", 10);
  // Initial validation (totalCount will be validated after query)
  const { page: validPage, limit: validLimit, offset: offsetValue } = validatePaginationBounds(page, 0, limit);

  // Sort order
  let orderByClause = desc(tickets.created_at);
  if (filters.sort === "oldest") {
    orderByClause = asc(tickets.created_at);
  } else if (filters.sort === "due-date") {
    orderByClause = sql`${tickets.resolution_due_at} ASC NULLS LAST`;
  }

  // Determine which joins are needed based on filters and required fields
  const needsCategoryJoin = filters.category && isNaN(parseInt(filters.category, 10));
  const needsUserJoin = !!filters.user; // Only join users if filtering by user
  const needsSubcategoryJoin = false; // Only join if subcategory_name is displayed (check display requirements)
  
  // Always need status join for status filtering and status display
  const needsStatusJoin = true;
  
  // Always need category join for category_name display (TicketCard shows category)
  const needsCategoryNameJoin = true;
  
  // Always need user join for creator_full_name and creator_email (TicketCard shows creator)
  const needsCreatorJoin = true;

  try {
    const queryStart = performance.now();
    
    // Fetch cached global stats (CRITICAL: This avoids expensive COUNT query)
    const cacheKey = generateStatsCacheKey(policy.roleName, dbUser?.primary_domain_id ?? null);
    const globalStatsPromise = getCachedGlobalStats(baseCondition, cacheKey);

    // Build count query with conditional joins
    let countQuery: any = db.select({ count: count() }).from(tickets);
    if (needsStatusJoin || filters.status) {
      countQuery = countQuery.leftJoin(ticket_statuses, eq(ticket_statuses.id, tickets.status_id));
    }
    if (needsCategoryJoin || needsCategoryNameJoin) {
      countQuery = countQuery.leftJoin(categories, eq(tickets.category_id, categories.id));
    }
    if (needsUserJoin || needsCreatorJoin) {
      countQuery = countQuery.leftJoin(users, eq(tickets.created_by, users.id));
    }

    // Build rows query - TicketCard requires: status, category_name, creator_full_name, creator_email
    // So we always need these joins for display
    const [globalStats, totalResultArray, ticketRowsRawResult] = await Promise.all([
      globalStatsPromise,
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
          scope_id: tickets.scope_id,
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
        .limit(validLimit)
        .offset(offsetValue),
    ]);
    const queryTime = performance.now() - queryStart;

    const ticketRowsRaw = Array.isArray(ticketRowsRawResult) ? ticketRowsRawResult : [];
    const [totalResult] = Array.isArray(totalResultArray) ? totalResultArray : [];
    const totalCount = totalResult?.count || 0;
    
    // Re-validate pagination with actual totalCount (clamp page if needed)
    const { page: finalPage } = validatePaginationBounds(validPage, totalCount, validLimit);

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
    const rows = ticketRowsRaw.map((row) => ({
      id: row.id,
      title: row.title,
      description: row.description,
      location: row.location,
      status: row.status,
      status_id: row.status_id || null,
      category_id: row.category_id || null,
      subcategory_id: row.subcategory_id || null,
      scope_id: row.scope_id || null, // Add scope_id field
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
    }));

    // Global stats are already fetched from cache (no extraction needed)

    const totalTime = performance.now() - startTime;
    
    // Log query performance (only in development or if slow)
    if (process.env.NODE_ENV === 'development' || totalTime > 1000) {
      console.log(`[Dashboard] Query performance (${policy.roleName}):`, {
        totalTime: `${totalTime.toFixed(2)}ms`,
        baseConditionTime: `${baseConditionTime.toFixed(2)}ms`,
        queryTime: `${queryTime.toFixed(2)}ms`,
        rowsReturned: rows.length,
        totalCount,
        page: finalPage,
        filters: Object.keys(filters).filter(k => filters[k as keyof DashboardFilters]),
      });
    }

    return {
      rows,
      totalCount,
      globalStats,
    };
  } catch (error) {
    const totalTime = performance.now() - startTime;
    console.error("[Dashboard] Error fetching tickets:", error, {
      role: policy.roleName,
      time: `${totalTime.toFixed(2)}ms`,
    });
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

