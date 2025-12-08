import { notFound } from "next/navigation";
import { db, committees } from "@/db";
import { eq } from "drizzle-orm";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { StatsCards } from "@/components/dashboard/StatsCards";
import { filterTickets } from "@/lib/ticket/filters/filterTickets";
import { calculateTicketStats } from "@/lib/committee/calculateStats";
import { getCommitteeTaggedTickets } from "@/lib/committee/getCommitteeTaggedTickets";
import { getCommitteeCreatedTickets } from "@/lib/committee/getCommitteeCreatedTickets";
import { CommitteeTicketsTabs } from "@/components/committee/CommitteeTicketsTabs";

export const dynamic = "force-dynamic";

/**
 * Senior Admin Committee Tickets Page
 * Note: Auth/role handled by snr-admin layout
 */
export default async function SnrCommitteeTicketsPage({
  params,
  searchParams
}: {
  params: Promise<{ committeeId: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {

  const { committeeId } = await params;
  const id = Number(committeeId);
  if (!Number.isFinite(id)) {
    notFound();
  }

  // Get committee with head_id
  const [committee] = await db
    .select({
      id: committees.id,
      name: committees.name,
      description: committees.description,
      contact_email: committees.contact_email,
      head_id: committees.head_id,
    })
    .from(committees)
    .where(eq(committees.id, id))
    .limit(1);

  if (!committee) {
    notFound();
  }

  // Await searchParams (Next.js 15)
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const paramsObj = resolvedSearchParams || {};
  const search = (typeof paramsObj["search"] === "string" ? paramsObj["search"] : paramsObj["search"]?.[0]) || "";
  const statusFilter = (typeof paramsObj["status"] === "string" ? paramsObj["status"] : paramsObj["status"]?.[0]) || "";
  const categoryFilter = (typeof paramsObj["category"] === "string" ? paramsObj["category"] : paramsObj["category"]?.[0]) || "";

  // Fetch tagged and created tickets separately
  const [taggedTickets, createdTickets] = await Promise.all([
    getCommitteeTaggedTickets(id),
    getCommitteeCreatedTickets(id),
  ]);

  // Apply filters to both sets
  const filteredTaggedTickets = filterTickets(taggedTickets, search, statusFilter, categoryFilter);
  const filteredCreatedTickets = filterTickets(createdTickets, search, statusFilter, categoryFilter);

  // Calculate stats from all tickets (for display)
  const allTickets = [...taggedTickets, ...createdTickets];
  const stats = calculateTicketStats(allTickets);

  return (
    <div className="space-y-8 p-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <Button variant="outline" size="sm" asChild>
              <Link href="/snr-admin/dashboard/committees">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Committees
              </Link>
            </Button>
          </div>
          <h1 className="text-4xl font-bold tracking-tight mb-2 bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent">
            {committee.name} - Tickets
          </h1>
          <p className="text-muted-foreground">
            View tickets tagged to this committee or created by committee members
          </p>
        </div>
      </div>

      {/* Stats Cards */}
      {allTickets.length > 0 && <StatsCards stats={stats} />}

      {/* Tabs for Tagged vs Created */}
      <CommitteeTicketsTabs
        committeeId={id}
        taggedTickets={taggedTickets}
        createdTickets={createdTickets}
        filteredTaggedTickets={filteredTaggedTickets}
        filteredCreatedTickets={filteredCreatedTickets}
        search={search}
        statusFilter={statusFilter}
        categoryFilter={categoryFilter}
      />
    </div>
  );
}

