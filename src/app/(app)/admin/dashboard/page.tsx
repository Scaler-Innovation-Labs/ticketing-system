import { auth } from "@clerk/nextjs/server";
import { db, tickets, categories, users, roles, ticket_statuses, domains } from "@/db";
import { eq, inArray } from "drizzle-orm";
import { TicketCard } from "@/components/layout/TicketCard";
import { TicketListTable } from "@/components/admin/tickets/TicketListTable";
import { Card, CardContent } from "@/components/ui/card";
import { AdminTicketFilters } from "@/components/admin/tickets";
import { StatsCards } from "@/components/dashboard/StatsCards";
import { FileText } from "lucide-react";
import Link from "next/link";
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

// Force dynamic rendering on Node to avoid edge/SSR data issues
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const revalidate = 0;

/**
 * Admin Dashboard Page
 * Note: Auth and role checks are handled by admin/layout.tsx
 */
export default async function AdminDashboardPage({ searchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  // Layout ensures userId exists and user is an admin
  const { userId } = await auth();
  if (!userId) throw new Error("Unauthorized"); // TypeScript type guard - layout ensures this never happens

  // Use cached functions for better performance (request-scoped deduplication)
  let { dbUser: adminDbUser } = await getCachedAdminUser(userId);
  if (!adminDbUser) {
    try {
      await ensureUser(userId);
      ({ dbUser: adminDbUser } = await getCachedAdminUser(userId));
    } catch (err) {
      // ignore and handle below
    }
  }
  if (!adminDbUser) throw new Error("User not found");
  const adminUserId = adminDbUser.id;

  // Await searchParams (Next.js 15)
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const params = resolvedSearchParams || {};
  const searchQuery = (typeof params["search"] === "string" ? params["search"] : params["search"]?.[0]) || "";
  const category = (typeof params["category"] === "string" ? params["category"] : params["category"]?.[0]) || "";
  const subcategory = (typeof params["subcategory"] === "string" ? params["subcategory"] : params["subcategory"]?.[0]) || "";
  const location = (typeof params["location"] === "string" ? params["location"] : params["location"]?.[0]) || "";
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

  // Get admin's domain/scope assignment (cached)
  const adminAssignment = await getCachedAdminAssignment(userId);
  const hasAssignment = !!adminAssignment.domain;

  // Fetch tickets using cached function (optimized query with request-scoped caching)
  const ticketRows = await getCachedAdminTickets(adminUserId, adminAssignment);

  // Get ticket statuses for final status check
  // Store canonical values for final statuses (resolved/closed/etc.)
  const ticketStatuses = await getCachedTicketStatuses();
  const finalStatusValues = new Set<TicketStatusValue>(
    ticketStatuses
      .filter((s) => s.is_final)
      .map((s) => normalizeStatus(s.value))
      .filter((s): s is TicketStatusValue => s !== null)
  );

  // Transform to AdminTicketRow format (properly typed)
  let allTickets: AdminTicketRow[] = ticketRows.map(ticket => ({
    ...ticket,
    status_id: ticket.status_id ?? null,
    status: ticket.status_value || null,
    subcategory_name: (ticket as any).subcategory_name || null,
  }));

  // Get category names and domains for all tickets (for filtering logic)
  const categoryMap = new Map<number, { name: string; domain: string | null }>();
  const categoryIds = [...new Set(allTickets.map(t => t.category_id).filter(Boolean) as number[])];
  if (categoryIds.length > 0) {
    const categoryRecords = await db
      .select({
        id: categories.id,
        name: categories.name,
        domainName: domains.name,
      })
      .from(categories)
      .leftJoin(domains, eq(categories.domain_id, domains.id))
      .where(inArray(categories.id, categoryIds));
    for (const cat of categoryRecords) {
      categoryMap.set(cat.id, { name: cat.name, domain: cat.domainName || null });
    }
  }

  // Get domains from categories this admin is assigned to
  const { getAdminAssignedCategoryDomains } = await import("@/lib/assignment/admin-assignment");
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
  allTickets = applySearchFilter(allTickets, searchQuery);
  allTickets = applyCategoryFilter(allTickets, category, categoryMap);
  allTickets = applySubcategoryFilter(allTickets, subcategory);
  allTickets = applyLocationFilter(allTickets, location);
  allTickets = applyStatusFilter(allTickets, status);
  allTickets = applyEscalatedFilter(allTickets, escalated);
  allTickets = applyUserFilter(allTickets, user);
  allTickets = applyDateRangeFilter(allTickets, createdFrom, createdTo);
  allTickets = applyTATFilter(allTickets, tat);

  // Sort
  if (sort === "oldest") {
    allTickets = [...allTickets].reverse();
  }

  // Calculate statistics using centralized helper
  const stats = calculateTicketStats(allTickets);

  // Calculate today pending count (tickets with TAT due today that are not resolved)
  const now = new Date();
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const endOfToday = new Date(now);
  endOfToday.setHours(23, 59, 59, 999);

  const todayPending = allTickets.filter(t => {
    // Must be open (not final status)
    if (!isOpenStatus(getStatusValue(t) || '')) return false;

    // Must have TAT date due today
    const metadata = parseTicketMetadata(t.metadata);
    const tatDateStr = metadata.tatDate;
    if (!tatDateStr || typeof tatDateStr !== 'string') return false;

    const tatDate = new Date(tatDateStr);
    if (isNaN(tatDate.getTime())) return false;

    return tatDate.getTime() >= startOfToday.getTime() &&
      tatDate.getTime() <= endOfToday.getTime();
  }).length;

  const listTickets = allTickets.map((ticket) => ({
    ...ticket,
    category_name: ticket.category_name || null,
    creator_full_name: ticket.creator_full_name || null,
    creator_email: ticket.creator_email || null,
    metadata: ticket.metadata || {},
  })) as unknown as Ticket[];

  return (
    <div className="space-y-8">
      <div>
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-4xl font-bold tracking-tight mb-2 bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent">
              Admin Dashboard
            </h1>
            <p className="text-muted-foreground">
              Manage and monitor all assigned tickets
            </p>
          </div>
        </div>

        <div className="space-y-6">
          {/* Stats Cards */}
          <StatsCards stats={stats} />

          {/* Filters - Full width for more space */}
          <div className="w-full">
            <AdminTicketFilters />
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
      </div>
    </div>
  );
}
