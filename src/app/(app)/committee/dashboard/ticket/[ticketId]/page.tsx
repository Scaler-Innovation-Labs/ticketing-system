import { auth } from "@clerk/nextjs/server";
import { redirect, notFound } from "next/navigation";
import { TicketDetailPage } from "@/components/features/tickets/display/TicketDetailPage";
import { getCommitteeTicketData } from "@/lib/ticket/admin/adminTicketData";

// Force dynamic rendering and Node runtime to avoid build-time relation issues
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const revalidate = 0;
export const dynamicParams = true;

/**
 * Committee Ticket Detail Page
 * Note: Auth is handled by committee/layout.tsx
 */
export default async function CommitteeTicketPage({ params }: { params: Promise<{ ticketId: string }> }) {
  try {
    const { userId } = await auth();
    if (!userId) throw new Error("Unauthorized");

    const { ticketId } = await params;
    const id = Number(ticketId);

    if (!Number.isFinite(id)) notFound();

    // Get ticket data using unified function
    const ticketData = await getCommitteeTicketData(id, userId);

    return (
      <TicketDetailPage
        adminType="committee"
        ticketId={id}
        {...ticketData}
      />
    );
  } catch (error: any) {
    console.error('[CommitteeTicketPage] Error:', error);
    if (error.message === 'Access denied' || error.message === 'Ticket not found') {
      redirect("/committee/dashboard");
    }
    notFound();
  }
}
