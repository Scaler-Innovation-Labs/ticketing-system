import { auth } from "@clerk/nextjs/server";
import { db, tickets, categories, ticket_statuses, ticket_groups, users } from "@/db";
import { desc, eq, isNotNull, and, sql, ilike } from "drizzle-orm";
import { TicketGroupManager } from "@/components/admin/tickets";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { ArrowLeft, Users, Package, CheckCircle2, TrendingUp } from "lucide-react";
import { getCachedAdminUser, getCachedAdminAssignment } from "@/lib/cache/cached-queries";
import { ticketMatchesAdminAssignment } from "@/lib/assignment/admin-assignment";
import type { Ticket, TicketMetadata } from "@/db/types-only";
import type { AdminTicketRow } from "@/lib/ticket/filters/adminTicketFilters";
import { applySubcategoryFilter, applyTATFilter } from "@/lib/ticket/filters/adminTicketFilters";
import { listTicketGroups } from "@/lib/ticket/ticket-groups-service";

// Force dynamic rendering since we use auth headers
export const dynamic = "force-dynamic";

export default async function AdminGroupsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  try {
    // Note: Auth and role checks are handled by admin/layout.tsx
    // Layout ensures userId exists and user is an admin, so we can safely use non-null assertion
    const { userId } = await auth();
    if (!userId) throw new Error("Unauthorized"); // TypeScript type guard - layout ensures this never happens

    // Use cached functions for better performance
    // Layout already ensures user exists via getOrCreateUser, so dbUser will exist
    const { dbUser } = await getCachedAdminUser(userId);

    if (!dbUser) throw new Error("User not found");

    // Get admin's domain/scope assignment (cached)
    const adminAssignment = await getCachedAdminAssignment(userId);

    // Parse search params
    const resolvedSearchParams = searchParams ? await searchParams : {};
    const params = resolvedSearchParams || {};
    const statusFilter = (typeof params["status"] === "string" ? params["status"] : params["status"]?.[0]) || "";
    const categoryFilter = (typeof params["category"] === "string" ? params["category"] : params["category"]?.[0]) || "";
    const subcategoryFilter = (typeof params["subcategory"] === "string" ? params["subcategory"] : params["subcategory"]?.[0]) || "";
    const searchQuery = (typeof params["search"] === "string" ? params["search"] : params["search"]?.[0]) || "";
    const locationFilter = (typeof params["location"] === "string" ? params["location"] : params["location"]?.[0]) || "";
    const tatFilter = (typeof params["tat"] === "string" ? params["tat"] : params["tat"]?.[0]) || "";

    // Build where conditions
    const conditions = [];

    // Status filter
    if (statusFilter) {
      const normalizedStatus = statusFilter.toLowerCase();
      if (normalizedStatus === "escalated") {
        conditions.push(sql`${tickets.escalation_level} > 0`);
      } else {
        conditions.push(sql`LOWER(${ticket_statuses.value}) = ${normalizedStatus}`);
      }
    }

    // Category filter - match by slug or name
    if (categoryFilter) {
      conditions.push(
        and(
          // Ensure category is present
          isNotNull(tickets.category_id),
          // Match either category slug or name (case-insensitive)
          sql`(${categories.slug} ILIKE ${`%${categoryFilter}%`} OR ${categories.name} ILIKE ${`%${categoryFilter}%`})`
        )
      );
    }

    // Location filter
    if (locationFilter) {
      conditions.push(ilike(tickets.location, `%${locationFilter}%`));
    }

    // Note: subcategory and TAT filters are applied after fetching using shared helpers

    // Search query filter
    if (searchQuery) {
      conditions.push(
        sql`(
          ${tickets.id}::text ILIKE ${`%${searchQuery}%`} OR
          ${tickets.description} ILIKE ${`%${searchQuery}%`}
        )`
      );
    }

    // Note: We don't filter by assigned_to here because we want to show:
    // 1. Tickets explicitly assigned to this admin
    // 2. Unassigned tickets matching admin's domain/scope (for grouping)
    // The in-memory filtering below handles domain/scope matching

    // Fetch tickets with proper joins for better data
    const allTicketRows = await db
      .select({
        id: tickets.id,
        title: tickets.title,
        description: tickets.description,
        location: tickets.location,
        status_id: tickets.status_id,
        status_value: ticket_statuses.value,
        category_id: tickets.category_id,
        subcategory_id: tickets.subcategory_id,
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
      .leftJoin(ticket_statuses, eq(tickets.status_id, ticket_statuses.id))
      .leftJoin(categories, eq(tickets.category_id, categories.id))
      .leftJoin(users, eq(tickets.created_by, users.id))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(tickets.created_at))
      .limit(1000); // Reasonable limit for grouping operations

    // Filter tickets based on admin assignment
    // Show tickets that are:
    // 1. Explicitly assigned to this admin, OR
    // 2. Unassigned tickets matching admin's domain/scope
    let allTickets: AdminTicketRow[] = allTicketRows.filter(ticket => {
      // Priority 1: Tickets explicitly assigned to this admin
      if (ticket.assigned_to === dbUser.id) {
        // If admin has a scope, filter by scope for assigned tickets too
        if (adminAssignment.scope && ticket.location) {
          const ticketLocation = (ticket.location || "").toLowerCase();
          const assignmentScope = (adminAssignment.scope || "").toLowerCase();
          return ticketLocation === assignmentScope;
        }
        return true; // Always show tickets assigned to this admin (if no scope restriction)
      }

      // Priority 2: Unassigned tickets matching admin's domain/scope
      if (!ticket.assigned_to && adminAssignment.domain) {
        return ticketMatchesAdminAssignment({
          category: ticket.category_name,
          location: ticket.location,
        }, adminAssignment);
      }

      return false;
    }) as AdminTicketRow[];

    // Apply additional in-memory filters that rely on metadata (subcategory, TAT)
    if (subcategoryFilter) {
      allTickets = applySubcategoryFilter(allTickets, subcategoryFilter);
    }

    if (tatFilter) {
      allTickets = applyTATFilter(allTickets, tatFilter);
    }

    // Fetch ticket groups with tickets
    const initialGroups = await listTicketGroups();

    // Count tickets in groups (grouped tickets)
    const groupedTicketIds = await db
      .select({ id: tickets.id })
      .from(tickets)
      .where(isNotNull(tickets.group_id));

    const groupedTicketIdSet = new Set(groupedTicketIds.map(t => t.id));

    // Filter grouped tickets based on admin assignment
    const groupedTickets = allTickets.filter(ticket => groupedTicketIdSet.has(ticket.id));

    // Available tickets are those not in any group
    const availableTickets = allTickets.filter(ticket => !groupedTicketIdSet.has(ticket.id));

    // Calculate stats
    const activeGroupsCount = initialGroups.filter(g => g.is_active).length;
    const archivedGroupsCount = initialGroups.filter(g => !g.is_active).length;
    const totalTicketsInGroups = initialGroups.reduce((acc, g) => acc + (g.ticketCount || 0), 0);
    const groupedTicketsCount = groupedTickets.length;
    const availableTicketsCount = availableTickets.length;
    const totalTicketsCount = allTickets.length;

    return (
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight mb-2 bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent">
              Ticket Groups
            </h1>
            <p className="text-muted-foreground text-sm">
              Organize tickets into groups for efficient bulk operations (comment, close, etc.)
            </p>
          </div>
          <Button variant="outline" asChild>
            <Link href="/admin/dashboard">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Dashboard
            </Link>
          </Button>
        </div>


        {/* Stats Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="border-2 hover:shadow-md transition-shadow">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Total Tickets</p>
                  <p className="text-2xl font-bold mt-1">{totalTicketsCount}</p>
                </div>
                <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                  <Package className="w-6 h-6 text-primary" />
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="border-2 hover:shadow-md transition-shadow">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Available</p>
                  <p className="text-2xl font-bold mt-1">{availableTicketsCount}</p>
                  <p className="text-xs text-muted-foreground mt-1">Not in any group</p>
                </div>
                <div className="h-12 w-12 rounded-full bg-blue-500/10 flex items-center justify-center">
                  <CheckCircle2 className="w-6 h-6 text-blue-500" />
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="border-2 hover:shadow-md transition-shadow">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Active Groups</p>
                  <p className="text-2xl font-bold mt-1">{activeGroupsCount}</p>
                  <p className="text-xs text-muted-foreground mt-1">Non-archived groups</p>
                </div>
                <div className="h-12 w-12 rounded-full bg-emerald-500/10 flex items-center justify-center">
                  <Users className="w-6 h-6 text-emerald-500" />
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="border-2 hover:shadow-md transition-shadow">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Grouped Tickets</p>
                  <p className="text-2xl font-bold mt-1">{groupedTicketsCount}</p>
                  <p className="text-xs text-muted-foreground mt-1">In groups</p>
                </div>
                <div className="h-12 w-12 rounded-full bg-purple-500/10 flex items-center justify-center">
                  <TrendingUp className="w-6 h-6 text-purple-500" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Ticket Group Manager (single experience) */}
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="w-5 h-5" />
              Ticket Groups
            </CardTitle>
          </CardHeader>
          <CardContent>
            <TicketGroupManager
              tickets={allTicketRows.map((t) => {
                let ticketMetadata: TicketMetadata = {};
                if (t.metadata && typeof t.metadata === "object" && !Array.isArray(t.metadata)) {
                  ticketMetadata = t.metadata as TicketMetadata;
                }
                return {
                  ...t,
                  status: t.status_value || null,
                  status_id: t.status_id || null,
                  scope_id: null,
                  resolved_at: ticketMetadata.resolved_at ? new Date(ticketMetadata.resolved_at) : null,
                  reopened_at: ticketMetadata.reopened_at ? new Date(ticketMetadata.reopened_at) : null,
                  acknowledged_at: ticketMetadata.acknowledged_at ? new Date(ticketMetadata.acknowledged_at) : null,
                  rating: (ticketMetadata.rating as number | null) || null,
                  feedback: (ticketMetadata.feedback as string | null) || null,
                  category_name: t.category_name || null,
                  creator_name: t.creator_full_name || null,
                  creator_email: t.creator_email || null,
                };
              }) as unknown as Ticket[]}
              basePath="/admin/dashboard"
              initialGroups={initialGroups as any}
              initialStats={{
                totalGroups: initialGroups.length,
                activeGroups: activeGroupsCount,
                archivedGroups: archivedGroupsCount,
                totalTicketsInGroups,
              }}
            />
          </CardContent>
        </Card>
      </div>
    );
  } catch (error) {
    console.error("[AdminGroupsPage] Error:", error);
    return (
      <div className="space-y-6">
        <Card>
          <CardContent className="pt-6">
            <p className="text-destructive">An error occurred while loading ticket groups. Please try again later.</p>
          </CardContent>
        </Card>
      </div>
    );
  }
}
