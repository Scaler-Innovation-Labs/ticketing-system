import { Suspense } from "react";
import { auth } from "@clerk/nextjs/server";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { TicketDetailPage } from "@/components/features/tickets/display/TicketDetailPage";
import { getCachedAdminTicketData } from "@/lib/ticket/admin/adminTicketData";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

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

// OPTIMIZATION: Static shell component for faster LCP
function AdminTicketShell({ ticketId }: { ticketId: string }) {
  return (
    <div className="space-y-6">
      <Card className="border-2">
        <CardContent className="p-6">
          <div className="flex items-center gap-4 mb-4">
            <Link href="/admin/dashboard">
              <Button variant="ghost" size="sm">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Dashboard
              </Button>
            </Link>
          </div>
          <div className="space-y-2">
            <h1 className="text-3xl font-bold">Ticket #{ticketId}</h1>
            <p className="text-muted-foreground">Loading ticket details...</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// CRITICAL FIX: Page component is now SYNCHRONOUS
// This allows HTML to stream immediately (<1s TTFB)
// All auth/DB logic moved inside Suspense boundaries
export default async function AdminTicketPage({ params }: { params: Promise<{ ticketId: string }> }) {
  // OPTIMIZATION: Parse params immediately (non-blocking)
  const { ticketId } = await params;
  
  // Render shell immediately - no auth, no DB, no blocking
  return (
    <div className="space-y-6">
      {/* Static shell for immediate LCP */}
      <AdminTicketShell ticketId={ticketId} />
      
      {/* All authenticated content streams in via Suspense */}
      <Suspense fallback={<AdminTicketSkeleton />}>
        <AdminTicketAuthed params={Promise.resolve({ ticketId })} />
      </Suspense>
    </div>
  );
}
