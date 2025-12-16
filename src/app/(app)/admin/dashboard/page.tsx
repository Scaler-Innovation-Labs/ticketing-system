import { Suspense } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { FileText } from "lucide-react";
import Link from "next/link";

// UI Components
import { StatsCards } from "@/components/dashboard/StatsCards";
import { AdminTicketFilters } from "@/components/admin/tickets";
import { TicketCard } from "@/components/layout/TicketCard";
import { TicketListTable } from "@/components/admin/tickets/TicketListTable";

// Data loading (only imported in async components)
import { auth } from "@clerk/nextjs/server";
import { getCachedAdminUser } from "@/lib/cache/cached-queries";
import { ensureUser } from "@/lib/auth/api-auth";
import type { Ticket } from "@/db/types-only";
import { getAdminFilters } from "@/lib/filters/getAdminFilters";
import {
  fetchDashboardTickets,
  parseDashboardFilters,
  calculateFilteredStats,
  calculatePagination,
  type DashboardFilters,
  type DashboardTicketRow,
} from "@/lib/dashboard/core";
import { adminPolicy } from "@/lib/dashboard/policies";
import { PaginationControls } from "@/components/dashboard/PaginationControls";

// CRITICAL FIX: Change from force-dynamic to auto to enable caching
// This allows Vercel to cache HTML per-user and reuse edge responses
export const dynamic = "auto";

// FIX #1: Static hero card for LCP - renders immediately, no JS/data needed
function AdminDashboardHero() {
  return (
    <Card className="border-2 shadow-sm">
      <CardContent className="p-2 sm:p-4">
        <div className="space-y-2">
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent">
            Admin Dashboard
          </h1>
          <p className="text-sm sm:text-base text-muted-foreground">
            Manage and monitor all assigned tickets
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

// Skeleton components for streaming
function AdminDashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i} className="border-2">
            <CardContent className="p-4 sm:p-6">
              <div className="h-20 animate-pulse bg-muted rounded-lg" />
            </CardContent>
          </Card>
        ))}
      </div>
      <Card className="border-2">
        <CardContent className="p-4 sm:p-6">
          <div className="h-20 animate-pulse bg-muted rounded-lg" />
        </CardContent>
      </Card>
      <div className="space-y-4">
        {[1, 2, 3, 4, 5].map((i) => (
          <Card key={i} className="border-2">
            <CardContent className="p-4 sm:p-6">
              <div className="h-24 animate-pulse bg-muted rounded-lg" />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

function StatsCardsSkeleton() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {[1, 2, 3, 4].map((i) => (
        <Card key={i} className="border-2">
          <CardContent className="p-4 sm:p-6">
            <div className="h-20 animate-pulse bg-muted rounded-lg" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function FiltersSkeleton() {
  return (
    <Card className="border-2">
      <CardContent className="p-4 sm:p-6">
        <div className="h-20 animate-pulse bg-muted rounded-lg" />
      </CardContent>
    </Card>
  );
}

function TicketsSkeleton() {
  return (
    <div className="space-y-4">
      {[1, 2, 3, 4, 5].map((i) => (
        <Card key={i} className="border-2">
          <CardContent className="p-4 sm:p-6">
            <div className="h-24 animate-pulse bg-muted rounded-lg" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// CRITICAL FIX: All auth and DB logic moved INSIDE Suspense
// This allows HTML to stream immediately while auth/DB happens async
async function AuthenticatedDashboard({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // OPTIMIZATION: Parallelize auth and searchParams parsing
  const [{ userId }, resolvedSearchParams] = await Promise.all([
    auth(),
    searchParams,
  ]);
  
  if (!userId) return null;

  // Use cached functions for better performance (request-scoped deduplication)
  let { dbUser: adminDbUser } = await getCachedAdminUser(userId);
  
  // FIX #1: Await user sync instead of returning skeleton
  // Let Suspense handle loading state, not nested skeletons
  if (!adminDbUser) {
    try {
      await ensureUser(userId);
      ({ dbUser: adminDbUser } = await getCachedAdminUser(userId));
    } catch (err) {
      // If user sync fails, redirect or show error
      console.error('[AuthenticatedDashboard] Failed to sync user:', err);
      return null;
    }
    
    // If still no user after sync, something is wrong
    if (!adminDbUser) {
      return null;
    }
  }

  const adminUserId = adminDbUser.id;

  // Parse search params using centralized utility
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
    return qs ? `/admin/dashboard?${qs}` : `/admin/dashboard`;
  };

  return (
    <AdminDashboardData
      adminUserId={adminUserId}
      userId={userId}
      filters={filters}
      buildViewHref={buildViewHref}
      isListView={isListView}
    />
  );
}

// Heavy logic component - isolated in Suspense
async function AdminDashboardData({
  adminUserId,
  userId,
  filters,
  buildViewHref,
  isListView,
}: {
  adminUserId: string;
  userId: string;
  filters: DashboardFilters;
  buildViewHref: (mode: string) => string;
  isListView: boolean;
}) {
  // Fetch filter options in parallel
  const filtersData = await getAdminFilters();
  
  const page = parseInt(filters.page || "1", 10);
  const limit = 20;

  // Fetch tickets with ALL filtering at DB level using admin policy
  const { rows, totalCount, globalStats } = await fetchDashboardTickets(
    userId,
    filters,
    limit,
    adminPolicy
  );

  // Calculate filtered stats (for current view)
  const filteredStats = calculateFilteredStats(rows);
  const stats = {
    overall: globalStats,
    filtered: filteredStats,
  };

  // Calculate pagination
  const pagination = calculatePagination(page, totalCount, limit, rows.length);

  // Convert DashboardTicketRow to Ticket format for display
  const listTickets = rows
    .filter((t): t is DashboardTicketRow & { category_id: number } => t.category_id !== null)
    .map((t) => {
      const ticket: Ticket = {
        id: t.id,
        title: t.title || "",
        description: t.description || "",
        location: t.location,
        status_id: t.status_id ?? 0,
        category_id: t.category_id,
        subcategory_id: t.subcategory_id ?? null,
        scope_id: t.scope_id ?? null,
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
        tat_extensions: 0,
        resolved_at: null,
        closed_at: null,
        attachments: [],
      };
      return {
        ...ticket,
        status: t.status || "open",
        category_name: t.category_name ?? null,
        creator_full_name: t.creator_full_name ?? null,
        creator_email: t.creator_email ?? null,
      } as Ticket & { status?: string | null; category_name?: string | null; creator_full_name?: string | null; creator_email?: string | null };
    });

  return (
    <div className="space-y-6">
      {/* Stats Cards in separate Suspense for independent streaming */}
      <Suspense fallback={<StatsCardsSkeleton />}>
        <StatsCards stats={filteredStats} />
      </Suspense>

      {/* Filters - now receives data as props (no client-side fetching) */}
      <div className="w-full">
        <AdminTicketFilters
          statuses={filtersData.statuses}
          categories={filtersData.categories}
          domains={filtersData.domains}
          scopes={filtersData.scopes}
        />
      </div>

      <div className="flex justify-between items-center pt-4 flex-wrap gap-3">
        <h2 className="text-2xl font-semibold flex items-center gap-2">
          <FileText className="w-6 h-6" />
          My Assigned Tickets
        </h2>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">View:</span>
            <Link
              href={buildViewHref("cards")}
              className={`px-3 py-1.5 rounded-md border text-sm transition-colors ${
                !isListView
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-background border-muted-foreground/40 text-foreground hover:bg-muted"
              }`}
            >
              Cards
            </Link>
            <Link
              href={buildViewHref("list")}
              className={`px-3 py-1.5 rounded-md border text-sm transition-colors ${
                isListView
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-background border-muted-foreground/40 text-foreground hover:bg-muted"
              }`}
            >
              List
            </Link>
          </div>
          <p className="text-sm text-muted-foreground">
            {pagination.totalCount} {pagination.totalCount === 1 ? 'ticket' : 'tickets'}
          </p>
        </div>
      </div>

      {/* Tickets */}
      {rows.length === 0 ? (
        <Card className="border-2 border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-16">
            <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
              <FileText className="w-8 h-8 text-muted-foreground" />
            </div>
            <p className="text-lg font-semibold mb-1">No tickets found</p>
            <p className="text-sm text-muted-foreground text-center max-w-md">
              Tickets assigned to you will appear here. Use the filters above to search for specific tickets.
            </p>
          </CardContent>
        </Card>
      ) : isListView ? (
        <>
          <TicketListTable tickets={listTickets} basePath="/admin/dashboard" />
          <PaginationControls
            currentPage={pagination.page}
            totalPages={pagination.totalPages}
            hasNext={pagination.hasNextPage}
            hasPrev={pagination.hasPrevPage}
            totalCount={pagination.totalCount}
            startIndex={pagination.startIndex}
            endIndex={pagination.endIndex}
            baseUrl="/admin/dashboard"
          />
        </>
      ) : (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {rows
              .filter((t): t is DashboardTicketRow & { category_id: number } => t.category_id !== null)
              .map((ticket) => {
                const baseTicket: Ticket = {
                  id: ticket.id,
                  title: ticket.title || "",
                  description: ticket.description || "",
                  location: ticket.location,
                  status_id: ticket.status_id ?? 0,
                  category_id: ticket.category_id,
                  subcategory_id: ticket.subcategory_id ?? null,
                  scope_id: ticket.scope_id ?? null,
                  created_by: ticket.created_by ?? "",
                  assigned_to: ticket.assigned_to ?? null,
                  group_id: ticket.group_id ?? null,
                  escalation_level: ticket.escalation_level ?? 0,
                  acknowledgement_due_at: ticket.acknowledgement_due_at ?? null,
                  resolution_due_at: ticket.resolution_due_at ?? null,
                  metadata: ticket.metadata || {},
                  created_at: ticket.created_at ?? new Date(),
                  updated_at: ticket.updated_at ?? new Date(),
                  ticket_number: `TKT-${ticket.id}`,
                  priority: "medium",
                  escalated_at: null,
                  forward_count: 0,
                  reopen_count: 0,
                  reopened_at: null,
                  tat_extensions: 0,
                  resolved_at: null,
                  closed_at: null,
                  attachments: [],
                };
                const ticketForCard = {
                  ...baseTicket,
                  status: ticket.status || "open",
                  category_name: ticket.category_name ?? null,
                  creator_full_name: ticket.creator_full_name ?? null,
                  creator_email: ticket.creator_email ?? null,
                } as Ticket & { status?: string | null; category_name?: string | null; creator_full_name?: string | null; creator_email?: string | null };
                return (
                  <TicketCard
                    key={ticket.id}
                    ticket={ticketForCard}
                    basePath="/admin/dashboard"
                  />
                );
              })}
          </div>
          <PaginationControls
            currentPage={pagination.page}
            totalPages={pagination.totalPages}
            hasNext={pagination.hasNextPage}
            hasPrev={pagination.hasPrevPage}
            totalCount={pagination.totalCount}
            startIndex={pagination.startIndex}
            endIndex={pagination.endIndex}
            baseUrl="/admin/dashboard"
          />
        </>
      )}
    </div>
  );
}

// CRITICAL FIX: Page component is now SYNCHRONOUS
// This allows HTML to stream immediately (<500ms TTFB)
// All auth/DB logic moved inside Suspense boundaries
export default function AdminDashboardPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  // Render shell immediately - no auth, no DB, no blocking
  return (
    <div className="space-y-8">
      {/* FIX #1: Static hero card - becomes LCP element, renders immediately */}
      <AdminDashboardHero />

      {/* All authenticated content streams in via Suspense */}
      <Suspense fallback={<AdminDashboardSkeleton />}>
        <AuthenticatedDashboard searchParams={searchParams || Promise.resolve({})} />
      </Suspense>
    </div>
  );
}
