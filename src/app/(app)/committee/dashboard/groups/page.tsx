import { auth } from "@clerk/nextjs/server";
import { tickets, ticket_groups } from "@/db";
import { eq, isNotNull } from "drizzle-orm";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { ArrowLeft, Users, Package, CheckCircle2, TrendingUp } from "lucide-react";
import { getCachedUser, getCachedCommitteeTickets } from "@/lib/cache/cached-queries";
import { AdminTicketFilters } from "@/components/admin/tickets";
import type { Ticket } from "@/db/types-only";
import { CommitteeTicketManager } from "@/components/committee/CommitteeTicketManager";
import { db } from "@/db";
import { listTicketGroups } from "@/lib/ticket/ticket-groups-service";

// Force dynamic rendering since we use auth headers
export const dynamic = "force-dynamic";

export default async function CommitteeGroupsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  try {
    // Layout ensures userId exists and user is a committee member
    const { userId } = await auth();
    if (!userId) throw new Error("Unauthorized");

    // Use cached function for better performance
    const user = await getCachedUser(userId);

    // Parse search params
    const resolvedSearchParams = searchParams ? await searchParams : {};
    const params = resolvedSearchParams || {};
    const statusFilter = (typeof params["status"] === "string" ? params["status"] : params["status"]?.[0]) || "";
    const categoryFilter = (typeof params["category"] === "string" ? params["category"] : params["category"]?.[0]) || "";
    const searchQuery = (typeof params["search"] === "string" ? params["search"] : params["search"]?.[0]) || "";
    const locationFilter = (typeof params["location"] === "string" ? params["location"] : params["location"]?.[0]) || "";

    // Fetch all committee-accessible tickets
    const allCommitteeTickets = await getCachedCommitteeTickets(user.id);

    // Apply filters
    let allTickets = allCommitteeTickets;

    if (statusFilter) {
      const normalizedStatus = statusFilter.toLowerCase();
      if (normalizedStatus === "escalated") {
        allTickets = allTickets.filter(t => (t.escalation_level || 0) > 0);
      } else {
        allTickets = allTickets.filter(t => {
          const ticketStatus = (t.status || "").toLowerCase();
          return ticketStatus === normalizedStatus;
        });
      }
    }

    if (categoryFilter) {
      // Filter by category ID (the filter value is the category ID as string)
      allTickets = allTickets.filter(t => {
        return t.category_id?.toString() === categoryFilter;
      });
    }

    if (locationFilter) {
      allTickets = allTickets.filter(t => {
        const location = (t.location || "").toLowerCase();
        return location.includes(locationFilter.toLowerCase());
      });
    }

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      allTickets = allTickets.filter(t => {
        return (
          t.id.toString().includes(query) ||
          (t.description || "").toLowerCase().includes(query) ||
          (t.title || "").toLowerCase().includes(query)
        );
      });
    }

    // Fetch ticket groups with tickets
    const initialGroups = await listTicketGroups();

    // Count tickets in groups (grouped tickets)
    const groupedTicketIds = await db
      .select({ id: tickets.id })
      .from(tickets)
      .where(isNotNull(tickets.group_id));

    const groupedTicketIdSet = new Set(groupedTicketIds.map((t) => t.id));

    // Filter grouped tickets based on committee access
    const groupedTickets = allTickets.filter((ticket) => groupedTicketIdSet.has(ticket.id));

    // Available tickets are those not in any group
    const availableTickets = allTickets.filter((ticket) => !groupedTicketIdSet.has(ticket.id));

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
            <Link href="/committee/dashboard">
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

        {/* Ticket Manager */}
        <CommitteeTicketManager
          tickets={allTickets.map((t) => ({
            id: t.id,
            status: t.status || null,
            description: t.description || null,
            category_name: t.category_name || null,
            location: t.location || null,
            created_at: t.created_at,
            updated_at: t.updated_at,
            title: t.title || "",
            creator_name: t.creator_full_name || null,
            creator_email: t.creator_email || null,
            // Add other properties as needed to satisfy Ticket type
          })) as unknown as Ticket[]}
          initialGroups={initialGroups}
          initialStats={{
            totalGroups: initialGroups.length,
            activeGroups: activeGroupsCount,
            archivedGroups: archivedGroupsCount,
            totalTicketsInGroups,
          }}
          filters={
            <Card className="shadow-sm">
              <CardHeader>
                <CardTitle>Filters & Search</CardTitle>
              </CardHeader>
              <CardContent>
                <AdminTicketFilters />
              </CardContent>
            </Card>
          }
        />
      </div>
    );
  } catch (error) {
    console.error("[CommitteeGroupsPage] Error:", error);
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

