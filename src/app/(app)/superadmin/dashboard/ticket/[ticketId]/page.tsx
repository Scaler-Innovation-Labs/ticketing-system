import { Suspense } from "react";
import { auth } from "@clerk/nextjs/server";
import { redirect, notFound } from "next/navigation";
import { TicketDetailPage } from "@/components/features/tickets/display/TicketDetailPage";
import { getCachedAdminTicketData } from "@/lib/ticket/admin/adminTicketData";
import { Card, CardContent } from "@/components/ui/card";
import { db, tickets } from "@/db";
import { desc } from "drizzle-orm";

// CRITICAL FIX: Change from force-dynamic to auto to enable caching
// This allows Vercel to cache HTML and reuse edge responses
export const dynamic = "auto";
export const revalidate = 60; // Revalidate every 60 seconds

// Allow on-demand rendering for tickets not in the static params list
export const dynamicParams = true;

/**
 * Generate static params for ticket detail pages
 * Pre-renders the 50 most recent tickets at build time for faster loads
 */
export async function generateStaticParams() {
  try {
    const recentTickets = await db
      .select({ id: tickets.id })
      .from(tickets)
      .orderBy(desc(tickets.created_at))
      .limit(50);

    return recentTickets.map((ticket) => ({
      ticketId: ticket.id.toString(),
    }));
  } catch (error) {
    console.error("Error generating static params for tickets:", error);
    return [];
  }
}

// Skeleton component for streaming
function SuperAdminTicketSkeleton() {
  return (
    <div className="space-y-6">
      <Card className="border-2">
        <CardContent className="p-6">
          <div className="h-8 w-64 animate-pulse bg-muted rounded-lg mb-4" />
          <div className="h-4 w-48 animate-pulse bg-muted rounded-lg" />
        </CardContent>
      </Card>
      <Card className="border-2">
        <CardContent className="p-6">
          <div className="space-y-4">
            <div className="h-6 w-full animate-pulse bg-muted rounded-lg" />
            <div className="h-24 w-full animate-pulse bg-muted rounded-lg" />
            <div className="h-24 w-full animate-pulse bg-muted rounded-lg" />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// CRITICAL FIX: All auth and DB logic moved INSIDE Suspense
// This allows HTML to stream immediately while auth/DB happens async
// Note: User sync is already handled in superadmin/layout.tsx, so user should exist here
async function SuperAdminTicketAuthed({ params }: { params: Promise<{ ticketId: string }> }) {
  const { userId } = await auth();
  if (!userId) redirect("/superadmin/dashboard");

  const { ticketId } = await params;
  const id = Number(ticketId);

  if (!Number.isFinite(id)) notFound();

  try {
    // Get ticket data using cached function
    const ticketData = await getCachedAdminTicketData(id, 'superadmin', userId);

    return (
      <TicketDetailPage
        adminType="superadmin"
        ticketId={id}
        {...ticketData}
      />
    );
  } catch (error: any) {
    console.error('[SuperAdminTicketAuthed] Error:', error);
    if (error.message === 'Access denied' || error.message === 'Ticket not found' || error.message === 'User not found') {
      redirect("/superadmin/dashboard");
    }
    notFound();
  }
}

/**
 * Super Admin Ticket Detail Page
 * Note: Auth and role checks are handled by superadmin/layout.tsx
 */
export default function SuperAdminTicketPage({ params }: { params: Promise<{ ticketId: string }> }) {
  // Render shell immediately - no auth, no DB, no blocking
  return (
    <Suspense fallback={<SuperAdminTicketSkeleton />}>
      <SuperAdminTicketAuthed params={params} />
    </Suspense>
  );
}
