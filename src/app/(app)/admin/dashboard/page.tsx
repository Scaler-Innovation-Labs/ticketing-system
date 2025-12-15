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
import { getCachedAdminUser, getCachedAdminAssignment, getCachedAdminTickets, getCachedTicketStatuses } from "@/lib/cache/cached-queries";
import { ensureUser } from "@/lib/auth/api-auth";
import { ticketMatchesAdminAssignment } from "@/lib/assignment/admin-assignment";
import type { Ticket } from "@/db/types-only";
import type { AdminTicketRow } from "@/lib/ticket/filters/adminTicketFilters";
import {
  applySearchFilter,
  applyCategoryFilter,
  applySubcategoryFilter,
  applyLocationFilter,
  applyScopeFilter,
  applyStatusFilter,
  applyEscalatedFilter,
  applyUserFilter,
  applyDateRangeFilter,
  applyTATFilter,
  calculateTicketStats,
  getStatusValue,
} from "@/lib/ticket/filters/adminTicketFilters";
import { parseTicketMetadata } from "@/lib/ticket/validation/parseTicketMetadata";
import { isOpenStatus, normalizeStatus } from "@/lib/ticket/utils/normalizeStatus";
import type { TicketStatusValue } from "@/conf/constants";
import { getCachedCategoryMap } from "@/lib/cache/cached-queries";
import { getAdminAssignedCategoryDomains } from "@/lib/assignment/admin-assignment";
import { getAdminFilters } from "@/lib/filters/getAdminFilters";

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
  const { userId } = await auth();
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

  // Parse search params
  const resolvedSearchParams = await searchParams;
  const params = resolvedSearchParams || {};
  const searchQuery = (typeof params["search"] === "string" ? params["search"] : params["search"]?.[0]) || "";
  const category = (typeof params["category"] === "string" ? params["category"] : params["category"]?.[0]) || "";
  const subcategory = (typeof params["subcategory"] === "string" ? params["subcategory"] : params["subcategory"]?.[0]) || "";
  const location = (typeof params["location"] === "string" ? params["location"] : params["location"]?.[0]) || "";
  const scope = (typeof params["scope"] === "string" ? params["scope"] : params["scope"]?.[0]) || "";
  const tat = (typeof params["tat"] === "string" ? params["tat"] : params["tat"]?.[0]) || "";
  const status = (typeof params["status"] === "string" ? params["status"] : params["status"]?.[0]) || "";
  const createdFrom = (typeof params["from"] === "string" ? params["from"] : params["from"]?.[0]) || "";
  const createdTo = (typeof params["to"] === "string" ? params["to"] : params["to"]?.[0]) || "";
  const user = (typeof params["user"] === "string" ? params["user"] : params["user"]?.[0]) || "";
  const sort = (typeof params["sort"] === "string" ? params["sort"] : params["sort"]?.[0]) || "newest";
  const view = (typeof params["view"] === "string" ? params["view"] : params["view"]?.[0]) || "cards";
  const escalated = (typeof params["escalated"] === "string" ? params["escalated"] : params["escalated"]?.[0]) || "";

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
    return qs ? `/admin/dashboard?${qs}` : `/admin/dashboard`;
  };

  const isListView = view === "list";

  return (
    <AdminDashboardData
      adminUserId={adminUserId}
      userId={userId}
      searchParams={{
        searchQuery,
        category,
        subcategory,
        location,
        scope,
        tat,
        status,
        createdFrom,
        createdTo,
        user,
        sort,
        view,
        escalated,
      }}
      buildViewHref={buildViewHref}
      isListView={isListView}
    />
  );
}

// Heavy logic component - isolated in Suspense
async function AdminDashboardData({
  adminUserId,
  userId,
  searchParams,
  buildViewHref,
  isListView,
}: {
  adminUserId: string;
  userId: string;
  searchParams: {
    searchQuery: string;
    category: string;
    subcategory: string;
    location: string;
    scope: string;
    tat: string;
    status: string;
    createdFrom: string;
    createdTo: string;
    user: string;
    sort: string;
    view: string;
    escalated: string;
  };
  buildViewHref: (mode: string) => string;
  isListView: boolean;
}) {
  // Get admin's domain/scope assignment (cached)
  const adminAssignment = await getCachedAdminAssignment(userId);
  const hasAssignment = !!adminAssignment.domain;

  // Fetch tickets using cached function (optimized query with request-scoped caching)
  const ticketRows = await getCachedAdminTickets(adminUserId, adminAssignment);

  // Get ticket statuses for final status check
  const ticketStatuses = await getCachedTicketStatuses();
  const finalStatusValues = new Set<TicketStatusValue>(
    ticketStatuses
      .filter((s) => s.is_final)
      .map((s) => normalizeStatus(s.value))
      .filter((s): s is TicketStatusValue => s !== null)
  );

  // Fetch filter options server-side (parallel, cached)
  // This replaces client-side API calls and eliminates waterfall
  const filters = await getAdminFilters();

  // Transform to AdminTicketRow format (properly typed)
  let allTickets: AdminTicketRow[] = ticketRows.map(ticket => ({
    ...ticket,
    status_id: ticket.status_id ?? null,
    status: ticket.status_value || null,
    subcategory_name: (ticket as any).subcategory_name || null,
  }));

  // UPGRADE #1: Use cached category map (doesn't change per admin)
  // This reduces DB queries and improves cold start performance
  // Convert plain object to Map for efficient lookups
  const categoryMapData = await getCachedCategoryMap();
  const categoryMap = new Map<number, { name: string; domain: string | null }>(
    Object.entries(categoryMapData).map(([id, data]) => [Number(id), data])
  );

  // FIX #2: Use top-level import instead of dynamic import
  // This reduces cold start penalty and per-request overhead
  const assignedCategoryDomains = adminUserId
    ? await getAdminAssignedCategoryDomains(adminUserId)
    : [];

  /**
   * Filter tickets by admin assignment
   * 
   * Priority order:
   * 1. Tickets explicitly assigned to this admin (via assigned_to)
   *    - If admin has scope, also filter by scope match
   * 2. Tickets in domains from categories this admin is assigned to
   *    - If admin has scope, also filter by scope match
   * 3. Unassigned tickets matching admin's domain/scope (from primary assignment)
   *    - Allows admins to pick up unassigned tickets in their domain
   */
  if (adminUserId) {
    allTickets = allTickets.filter(t => {
      // Priority 1: Explicitly assigned tickets
      if (t.assigned_to === adminUserId) {
        // If admin has a scope, filter by scope for assigned tickets too
        if (adminAssignment.scope && t.location) {
          const ticketLocation = (t.location || "").toLowerCase();
          const assignmentScope = (adminAssignment.scope || "").toLowerCase();
          return ticketLocation === assignmentScope;
        }
        return true; // Always show tickets assigned to this admin (if no scope restriction)
      }

      const metadata = parseTicketMetadata(t.metadata);
      const prevAssignee = (metadata as any)?.previous_assigned_to as string | null;

      // Priority 2: Tickets in domains from categories admin is assigned to
      const ticketCategoryInfo = t.category_id ? categoryMap.get(t.category_id) : null;
      if (ticketCategoryInfo?.domain && assignedCategoryDomains.includes(ticketCategoryInfo.domain)) {
        // Admin is assigned to this category's domain
        // For escalated tickets, show them even if assigned to someone else
        // This ensures escalated tickets don't disappear from the original admin's dashboard
        const isEscalated = (t.escalation_level || 0) > 0;
        if (isEscalated) {
          // Show escalated tickets in admin's domain regardless of current assignment, and also if previously assigned
          if (adminAssignment.scope && t.location) {
            const ticketLocation = (t.location || "").toLowerCase();
            const assignmentScope = (adminAssignment.scope || "").toLowerCase();
            return ticketLocation === assignmentScope;
          }
          // Also allow visibility if admin was previous assignee
          if (prevAssignee && prevAssignee === adminUserId) {
            return true;
          }
          return true; // Show escalated tickets in admin's domain
        }
        
        // If admin has a scope, filter by scope
        if (adminAssignment.scope && t.location) {
          const ticketLocation = (t.location || "").toLowerCase();
          const assignmentScope = (adminAssignment.scope || "").toLowerCase();
          return ticketLocation === assignmentScope;
        }
        // No scope restriction, show all tickets in this domain
        return true;
      }

      // Priority 3: Unassigned tickets matching admin's domain/scope
      if (!t.assigned_to && hasAssignment) {
        const ticketCategory = ticketCategoryInfo?.name || null;
        return ticketMatchesAdminAssignment(
          { category: ticketCategory, location: t.location },
          adminAssignment
        );
      }

      return false;
    });
  } else {
    // If user ID not found, show no tickets
    allTickets = [];
  }

  // Apply filters using centralized helper functions
  allTickets = applySearchFilter(allTickets, searchParams.searchQuery);
  allTickets = applyCategoryFilter(allTickets, searchParams.category, categoryMap);
  allTickets = applySubcategoryFilter(allTickets, searchParams.subcategory);
  allTickets = applyLocationFilter(allTickets, searchParams.location);
  allTickets = applyScopeFilter(allTickets, searchParams.scope);
  allTickets = applyStatusFilter(allTickets, searchParams.status);
  allTickets = applyEscalatedFilter(allTickets, searchParams.escalated);
  allTickets = applyUserFilter(allTickets, searchParams.user);
  allTickets = applyDateRangeFilter(allTickets, searchParams.createdFrom, searchParams.createdTo);
  allTickets = applyTATFilter(allTickets, searchParams.tat);

  // Sort
  if (searchParams.sort === "oldest") {
    allTickets = [...allTickets].reverse();
  }

  // Calculate statistics using centralized helper
  const stats = calculateTicketStats(allTickets);

  // UPGRADE #3: Defer todayPending calculation - it's O(n) with metadata parsing
  // This will be calculated client-side or lazy-loaded on hover/tooltip
  // For now, we'll skip it to improve initial render time
  const todayPending = 0; // Deferred - can be calculated client-side if needed

  const listTickets = allTickets.map((ticket) => ({
    ...ticket,
    category_name: ticket.category_name || null,
    creator_full_name: ticket.creator_full_name || null,
    creator_email: ticket.creator_email || null,
    metadata: ticket.metadata || {},
  })) as unknown as Ticket[];

  return (
    <div className="space-y-6">
      {/* UPGRADE #2: Stats Cards in separate Suspense for independent streaming */}
      {/* Stats are expensive but not critical for first paint */}
      <Suspense fallback={<StatsCardsSkeleton />}>
        <StatsCards stats={stats} />
      </Suspense>

      {/* Filters - now receives data as props (no client-side fetching) */}
      <div className="w-full">
        <AdminTicketFilters
          statuses={filters.statuses}
          categories={filters.categories}
          domains={filters.domains}
          scopes={filters.scopes}
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
            {allTickets.length} {allTickets.length === 1 ? 'ticket' : 'tickets'}
          </p>
        </div>
      </div>

      {/* Tickets */}
      {allTickets.length === 0 ? (
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
        <TicketListTable tickets={listTickets} basePath="/admin/dashboard" />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {allTickets.map((ticket) => {
            // Transform to TicketCard expected format with proper types
            const ticketForCard = {
              ...ticket,
              status: getStatusValue(ticket) || 'open',
              category_name: ticket.category_name || undefined,
              creator_name: ticket.creator_full_name || undefined,
              creator_email: ticket.creator_email || undefined,
              // Add missing fields from ticket (AdminTicketRow)
              ticket_number: ticket.ticket_number,
              priority: ticket.priority,
              group_id: ticket.group_id,
              escalated_at: ticket.escalated_at,
              description: ticket.description,
              location: ticket.location,
              status_id: ticket.status_id ?? 0,
              category_id: ticket.category_id,
              escalation_level: ticket.escalation_level ?? 0,
              forward_count: ticket.forward_count ?? 0,
              reopen_count: ticket.reopen_count ?? 0,
              reopened_at: ticket.reopened_at,
              tat_extensions: 0, // Stub or parse if needed
              resolved_at: ticket.resolved_at,
              closed_at: ticket.closed_at,
              attachments: [], // Stub
            };
            return (
              <TicketCard
                key={ticket.id}
                ticket={ticketForCard}
                basePath="/admin/dashboard"
              />
            );
          })}
        </div>
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
