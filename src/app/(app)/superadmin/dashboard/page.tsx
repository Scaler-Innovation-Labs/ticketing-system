import { auth } from "@clerk/nextjs/server";
import { AdminTicketFilters } from "@/components/admin/tickets";
import { TicketListTable } from "@/components/admin/tickets/TicketListTable";
import { SuperAdminDashboardHeader } from "./components/SuperAdminDashboardHeader";
import { SuperAdminDashboardStats } from "./components/SuperAdminDashboardStats";
import { SuperAdminTicketsList } from "./components/SuperAdminTicketsList";
import { PaginationControls } from "@/components/dashboard/PaginationControls";
import {
  fetchDashboardTickets,
  parseDashboardFilters,
  calculateFilteredStats,
  calculatePagination,
  type DashboardFilters,
  type DashboardTicketRow,
} from "@/lib/dashboard/core";
import { superadminPolicy } from "@/lib/dashboard/policies";
import type { Ticket } from "@/db/types-only";

// Enable caching for better performance
export const dynamic = "auto";
export const revalidate = 60;



/**
 * Super Admin Dashboard Page
 * Note: Auth and role checks are handled by superadmin/layout.tsx
 * 
 * FIXES APPLIED:
 * - ✅ All filtering moved to DB level (no double filtering)
 * - ✅ Stats separated into global vs filtered
 * - ✅ Proper types (no 'as any' casts)
 * - ✅ Simplified searchParams parsing
 */
export default async function SuperAdminDashboardPage({
  searchParams
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}) {
  const { userId } = await auth();
  if (!userId) throw new Error("Unauthorized");

  // FIX: Await searchParams (Next.js 15+ requires this)
  const resolvedSearchParams = await searchParams;
  const filters = parseDashboardFilters(resolvedSearchParams || {});
  const view = (typeof resolvedSearchParams?.view === "string" ? resolvedSearchParams.view : Array.isArray(resolvedSearchParams?.view) ? resolvedSearchParams.view[0] : undefined) || "cards";
  const isListView = view === "list";

  const buildViewHref = (mode: string) => {
    const sp = new URLSearchParams();
    Object.entries(resolvedSearchParams || {}).forEach(([key, val]) => {
      if (key === "view" || val === undefined) return;
      if (Array.isArray(val)) {
        val.forEach((v) => v && sp.append(key, v));
      } else if (typeof val === "string") {
        sp.set(key, val);
      }
    });
    sp.set("view", mode);
    const qs = sp.toString();
    return qs ? `/superadmin/dashboard?${qs}` : `/superadmin/dashboard`;
  };

  const page = parseInt(filters.page || "1", 10);
  const limit = 20;

  // FIX: Fetch tickets with ALL filtering at DB level (no client-side filtering)
  const { rows, totalCount, globalStats } = await fetchDashboardTickets(
    userId,
    filters,
    limit,
    superadminPolicy
  );

  // FIX: Calculate filtered stats (for current view) and combine with global stats
  const filteredStats = calculateFilteredStats(rows);
  const stats = {
    overall: globalStats,
    filtered: filteredStats,
  };

  // FIX: Calculate pagination correctly (based on DB totalCount, not filtered rows)
  const pagination = calculatePagination(page, totalCount, limit, rows.length);

  // FIX: Proper type conversion (no 'as any' or 'as unknown')
  // Filter out tickets without category_id (shouldn't happen, but safety check)
  // TicketCard expects Ticket & { status?: string | null; ... }
  const listTickets = rows
    .filter((t): t is DashboardTicketRow & { category_id: number } => t.category_id !== null)
    .map((t) => {
      const ticket: Ticket = {
        id: t.id,
        title: t.title || "",
        description: t.description || "",
        location: t.location,
        status_id: t.status_id ?? 0, // Required field - use 0 as fallback if null
        category_id: t.category_id, // TypeScript knows this is number due to filter
        subcategory_id: t.subcategory_id ?? null,
        scope_id: t.scope_id ?? null, // Add scope_id field
        created_by: t.created_by ?? "",
        assigned_to: t.assigned_to ?? null,
        group_id: t.group_id ?? null,
        escalation_level: t.escalation_level ?? 0,
        acknowledgement_due_at: t.acknowledgement_due_at ?? null,
        resolution_due_at: t.resolution_due_at ?? null,
        metadata: t.metadata || {},
        created_at: t.created_at ?? new Date(),
        updated_at: t.updated_at ?? new Date(),
        ticket_number: `TKT-${t.id}`,
        priority: "medium",
        escalated_at: null,
        forward_count: 0,
        reopen_count: 0,
        reopened_at: null,
        tat_extensions: 0, // Required field, default 0
        resolved_at: null,
        closed_at: null,
        attachments: [],
      };
      // Add extended fields for TicketCard
      return {
        ...ticket,
        status: t.status || "open", // Add status field for TicketCard
        category_name: t.category_name ?? null,
        creator_full_name: t.creator_full_name ?? null,
        creator_email: t.creator_email ?? null,
      } as Ticket & { status?: string | null; category_name?: string | null; creator_full_name?: string | null; creator_email?: string | null };
    });

  return (
    <div className="space-y-8">
      <div>
        <SuperAdminDashboardHeader
          unassignedCount={globalStats.unassigned}
          actualCount={pagination.totalCount}
          pagination={pagination}
          showViewToggle={true}
          viewToggleBasePath="/superadmin/dashboard"
        />
        <div className="space-y-6">
          {/* FIX: Show filtered stats (current view) */}
          <SuperAdminDashboardStats stats={stats.filtered} />
          
          {/* Filters - Full width for more space */}
          <div className="w-full">
            <AdminTicketFilters />
          </div>
          {isListView ? (
            <>
              <TicketListTable tickets={listTickets} basePath="/superadmin/dashboard" />
              <PaginationControls
                currentPage={pagination.page}
                totalPages={pagination.totalPages}
                hasNext={pagination.hasNextPage}
                hasPrev={pagination.hasPrevPage}
                totalCount={pagination.totalCount}
                startIndex={pagination.startIndex}
                endIndex={pagination.endIndex}
                baseUrl="/superadmin/dashboard"
              />
            </>
          ) : (
            <SuperAdminTicketsList
              tickets={rows}
              unassignedCount={globalStats.unassigned}
              pagination={pagination}
            />
          )}
        </div>
      </div>
    </div>
  );
}

