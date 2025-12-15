import { Suspense } from "react";
import { auth } from "@clerk/nextjs/server";
import { redirect, notFound } from "next/navigation";
import { TicketDetailPage } from "@/components/features/tickets/display/TicketDetailPage";
import { getCachedAdminTicketData } from "@/lib/ticket/admin/adminTicketData";
import { Card, CardContent } from "@/components/ui/card";

// CRITICAL FIX: Change from force-dynamic to auto to enable caching
// This allows Vercel to cache HTML and reuse edge responses
export const dynamic = "auto";
export const revalidate = 60; // Revalidate every 60 seconds

// Allow on-demand rendering for tickets not in the static params list
export const dynamicParams = true;

// Skeleton component for streaming
function AdminTicketSkeleton() {
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
async function AdminTicketAuthed({ params }: { params: Promise<{ ticketId: string }> }) {
  const { userId } = await auth();
  if (!userId) redirect("/admin/dashboard");

  const { ticketId } = await params;
  const id = Number(ticketId);

  if (!Number.isFinite(id)) notFound();

  try {
    // Get ticket data using cached function
    const ticketData = await getCachedAdminTicketData(id, 'admin', userId);

    return (
      <TicketDetailPage
        adminType="admin"
        ticketId={id}
        {...ticketData}
      />
    );
  } catch (error: any) {
    console.error('[AdminTicketPage] Error:', error);
    if (error.message === 'Access denied' || error.message === 'Ticket not found') {
      redirect("/admin/dashboard");
    }
    notFound();
  }
}

// CRITICAL FIX: Page component is now SYNCHRONOUS
// This allows HTML to stream immediately (<1s TTFB)
// All auth/DB logic moved inside Suspense boundaries
export default function AdminTicketPage({ params }: { params: Promise<{ ticketId: string }> }) {
  // Render shell immediately - no auth, no DB, no blocking
  return (
    <Suspense fallback={<AdminTicketSkeleton />}>
      <AdminTicketAuthed params={params} />
    </Suspense>
  );
}
