import { auth } from "@clerk/nextjs/server";
import { AdminTicketFilters } from "@/components/admin/tickets";
import { TicketListTable } from "@/components/admin/tickets/TicketListTable";
import { SuperAdminDashboardHeader } from "./components/SuperAdminDashboardHeader";
import { SuperAdminDashboardStats } from "./components/SuperAdminDashboardStats";
import { SuperAdminTicketsList } from "./components/SuperAdminTicketsList";
import Link from "next/link";
import { PaginationControls } from "@/components/dashboard/PaginationControls";
import {
  fetchSuperAdminTickets,
  filterAndSortTickets,
  calculateStats,
  type DashboardFilters,
} from "./lib/dashboard-data";

// Use ISR (Incremental Static Regeneration) - cache for 30 seconds
// Removed force-dynamic to allow revalidation to work
export const revalidate = 30;



/**
 * Super Admin Dashboard Page
 * Note: Auth and role checks are handled by superadmin/layout.tsx
 */
export default async function SuperAdminDashboardPage({
  searchParams
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}) {
  const { userId } = await auth();
  if (!userId) throw new Error("Unauthorized");

  const resolvedSearchParams = searchParams ? await searchParams : {};
  const params = resolvedSearchParams || {};

  const filters: DashboardFilters = {
    tat: (typeof params["tat"] === "string" ? params["tat"] : params["tat"]?.[0]) || "",
    status: (typeof params["status"] === "string" ? params["status"] : params["status"]?.[0]) || "",
    escalated: (typeof params["escalated"] === "string" ? params["escalated"] : params["escalated"]?.[0]) || "",
    from: (typeof params["from"] === "string" ? params["from"] : params["from"]?.[0]) || "",
    to: (typeof params["to"] === "string" ? params["to"] : params["to"]?.[0]) || "",
    user: (typeof params["user"] === "string" ? params["user"] : params["user"]?.[0]) || "",
    sort: (typeof params["sort"] === "string" ? params["sort"] : params["sort"]?.[0]) || "newest",
    page: (typeof params["page"] === "string" ? params["page"] : params["page"]?.[0]) || "1",
  };
  const view = (typeof params["view"] === "string" ? params["view"] : params["view"]?.[0]) || "cards";
  const isListView = view === "list";

  const buildViewHref = (mode: string) => {
    const sp = new URLSearchParams();
    Object.entries(params).forEach(([key, val]) => {
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



  // Fetch tickets
  const { ticketRows, totalCount } = await fetchSuperAdminTickets(userId, filters, limit);

  // Filter and sort tickets
  const allTickets = filterAndSortTickets(ticketRows, filters);



  // Calculate pagination metadata
  // Calculate pagination metadata
  // Filters are now applied at DB level, so totalCount is accurate for the filters.
  const displayedCount = allTickets.length; // Number of tickets displayed on this page
  const totalPages = Math.max(1, Math.ceil(totalCount / limit)); // Ensure at least 1 page
  const offsetValue = (page - 1) * limit;

  const pagination = {
    page,
    totalPages,
    hasNextPage: page < totalPages && ticketRows.length === limit, // Has next if we got a full page
    hasPrevPage: page > 1,
    totalCount,
    startIndex: displayedCount > 0 ? offsetValue + 1 : 0,
    endIndex: displayedCount > 0 ? offsetValue + displayedCount : 0,
    actualCount: displayedCount,
  };

  // Calculate stats
  const stats = calculateStats(allTickets);

  // Count unassigned tickets
  const unassignedCount = ticketRows.filter((t) => !t.assigned_to).length;

  const listTickets = allTickets.map((t) => ({
    ...t,
    category_name: (t as any).category_name || null,
    creator_full_name: (t as any).creator_full_name || (t as any).creator_name || null,
    creator_email: (t as any).creator_email || null,
    metadata: (t as any).metadata || {},
  })) as unknown as import("@/db/types-only").Ticket[];

  return (
    <div className="space-y-8">
      <div>
        <SuperAdminDashboardHeader
          unassignedCount={unassignedCount}
          actualCount={pagination.actualCount}
          pagination={pagination}
          showViewToggle={true}
          viewToggleBasePath="/superadmin/dashboard"
        />
        <div className="space-y-6">
          <SuperAdminDashboardStats stats={stats} />
          
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
              tickets={allTickets}
              unassignedCount={unassignedCount}
              pagination={pagination}
            />
          )}
        </div>
      </div>
    </div>
  );
}

