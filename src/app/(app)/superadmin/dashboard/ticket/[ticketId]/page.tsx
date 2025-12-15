import { auth } from "@clerk/nextjs/server";
import { redirect, notFound } from "next/navigation";
import { TicketDetailPage } from "@/components/features/tickets/display/TicketDetailPage";
import { getAdminTicketData } from "@/lib/ticket/admin/adminTicketData";
import { db, tickets } from "@/db";
import { desc } from "drizzle-orm";

// Force dynamic rendering since we use auth() and user-specific data
export const dynamic = 'force-dynamic';

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

/**
 * Super Admin Ticket Detail Page
 * Note: Auth and role checks are handled by superadmin/layout.tsx
 */
export default async function SuperAdminTicketPage({ params }: { params: Promise<{ ticketId: string }> }) {
  try {
    const { userId } = await auth();
    if (!userId) throw new Error("Unauthorized");

  const { ticketId } = await params;
  const id = Number(ticketId);

  if (!Number.isFinite(id)) notFound();

    // Get ticket data using unified function
    const ticketData = await getAdminTicketData(id, 'superadmin', userId);

    return (
      <TicketDetailPage
        adminType="superadmin"
        ticketId={id}
        {...ticketData}
      />
    );
  } catch (error: any) {
    console.error('[SuperAdminTicketPage] Error:', error);
    if (error.message === 'Access denied' || error.message === 'Ticket not found') {
      redirect("/superadmin/dashboard");
    }
    notFound();
  }
}
