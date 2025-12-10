import { auth } from "@clerk/nextjs/server";
import { AdminTicketFilters } from "@/components/admin/tickets";
import { TicketListTable } from "@/components/admin/tickets/TicketListTable";
import Link from "next/link";
import { PaginationControls } from "@/components/dashboard/PaginationControls";
import { SuperAdminDashboardHeader } from "@/app/(app)/superadmin/dashboard/components/SuperAdminDashboardHeader";
import { SuperAdminDashboardStats } from "@/app/(app)/superadmin/dashboard/components/SuperAdminDashboardStats";
import { SuperAdminTicketsList } from "@/app/(app)/superadmin/dashboard/components/SuperAdminTicketsList";
import {
  fetchSuperAdminTickets,
  filterAndSortTickets,
  calculateStats,
  type DashboardFilters,
} from "@/app/(app)/superadmin/dashboard/lib/dashboard-data";
import type { Ticket } from "@/db/types-only";

// Use ISR (Incremental Static Regeneration) - cache for 30 seconds
export const revalidate = 30;

/**
 * Senior Admin Dashboard Page
 * Note: Auth and role checks are handled by snr-admin/layout.tsx
 * 
 * Senior Admin can view ALL tickets (like super_admin) but with limited management capabilities
 */
export default async function SnrAdminDashboardPage({ 
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
    return qs ? `/snr-admin/dashboard?${qs}` : `/snr-admin/dashboard`;
  };

  const page = parseInt(filters.page || "1", 10);
  const limit = 20;

  // Fetch tickets (snr_admin can see ALL tickets like super_admin)
  const { ticketRows, totalCount } = await fetchSuperAdminTickets(userId, filters, limit);

  // Filter and sort tickets
  const allTickets = filterAndSortTickets(ticketRows, filters);

  // Calculate pagination metadata
  const actualCount = allTickets.length;
  const totalPages = Math.ceil(totalCount / limit);
  const offsetValue = (page - 1) * limit;

  const pagination = {
    page,
    totalPages,
    hasNextPage: page < totalPages,
    hasPrevPage: page > 1,
    totalCount,
    startIndex: offsetValue + 1,
    endIndex: Math.min(offsetValue + actualCount, totalCount),
    actualCount,
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
  })) as unknown as Ticket[];

  return (
    <div className="space-y-8">
      <SuperAdminDashboardHeader
        unassignedCount={unassignedCount}
        actualCount={pagination.actualCount}
        pagination={pagination}
        title="Senior Admin Dashboard"
        description="View all tickets, manage committees, and handle system-wide operations"
        showViewToggle={true}
        viewToggleBasePath="/snr-admin/dashboard"
      />
      <div className="space-y-6">
        <SuperAdminDashboardStats stats={stats} />
        
        {/* Filters - Full width for more space */}
        <div className="w-full">
          <AdminTicketFilters />
        </div>
        {isListView ? (
          <>
            <TicketListTable tickets={listTickets} basePath="/snr-admin/dashboard" />
            <PaginationControls
              currentPage={pagination.page}
              totalPages={pagination.totalPages}
              hasNext={pagination.hasNextPage}
              hasPrev={pagination.hasPrevPage}
              totalCount={pagination.totalCount}
              startIndex={pagination.startIndex}
              endIndex={pagination.endIndex}
              baseUrl="/snr-admin/dashboard"
            />
          </>
        ) : (
          <SuperAdminTicketsList
            tickets={allTickets}
            unassignedCount={unassignedCount}
            pagination={pagination}
            basePath="/snr-admin/dashboard"
          />
        )}
      </div>
    </div>
  );
}
