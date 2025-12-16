import { Card, CardContent } from "@/components/ui/card";
import { TicketCard } from "@/components/layout/TicketCard";
import { FileText } from "lucide-react";
import type { Ticket } from "@/db/types-only";
import { PaginationControls } from "@/components/dashboard/PaginationControls";
import type { DashboardTicketRow, PaginationInfo } from "@/lib/dashboard/core";

interface SuperAdminTicketsListProps {
  tickets: DashboardTicketRow[];
  unassignedCount: number;
  pagination: PaginationInfo;
  basePath?: string;
}

export function SuperAdminTicketsList({ tickets, unassignedCount, pagination, basePath = "/superadmin/dashboard" }: SuperAdminTicketsListProps) {
  if (tickets.length === 0) {
    return (
      <Card className="border-2 border-dashed">
        <CardContent className="flex flex-col items-center justify-center py-16">
          <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
            <FileText className="w-8 h-8 text-muted-foreground" />
          </div>
          <p className="text-lg font-semibold mb-1">No tickets found</p>
          <p className="text-sm text-muted-foreground text-center max-w-md">
            Unassigned tickets and escalations will appear here. Use the filters above to search for specific tickets.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {tickets
          .filter((t): t is DashboardTicketRow & { category_id: number } => t.category_id !== null)
          .map((ticket) => {
            // Convert DashboardTicketRow to Ticket format for TicketCard
            // TicketCard expects Ticket & { status?: string | null; ... }
            const baseTicket: Ticket = {
              id: ticket.id,
              title: ticket.title || "",
              description: ticket.description || "",
              location: ticket.location,
              status_id: ticket.status_id ?? 0, // Required field - use 0 as fallback if null
              category_id: ticket.category_id, // TypeScript knows this is number due to filter
              subcategory_id: ticket.subcategory_id ?? null,
              scope_id: ticket.scope_id ?? null, // Add scope_id field
              created_by: ticket.created_by ?? "",
              assigned_to: ticket.assigned_to ?? null,
              group_id: ticket.group_id ?? null,
              escalation_level: ticket.escalation_level ?? 0,
              acknowledgement_due_at: ticket.acknowledgement_due_at ?? null,
              resolution_due_at: ticket.resolution_due_at ?? null,
              metadata: ticket.metadata || {},
              created_at: ticket.created_at ?? new Date(),
              updated_at: ticket.updated_at ?? new Date(),
              ticket_number: `TKT-${ticket.id}`,
              priority: "medium",
              escalated_at: null,
              forward_count: 0,
              reopen_count: 0,
              reopened_at: null,
              tat_extensions: 0, // Required field, default 0
              resolved_at: null,
              closed_at: null,
              attachments: [],
            };
            // Add extended fields for TicketCard
            const ticketForCard = {
              ...baseTicket,
              status: ticket.status || "open", // Add status field for TicketCard
              category_name: ticket.category_name ?? null,
              creator_full_name: ticket.creator_full_name ?? null,
              creator_email: ticket.creator_email ?? null,
            } as Ticket & { status?: string | null; category_name?: string | null; creator_full_name?: string | null; creator_email?: string | null };
            return (
              <TicketCard
                key={ticket.id}
                ticket={ticketForCard}
                basePath={basePath}
              />
            );
          })}
      </div>

      <PaginationControls
        currentPage={pagination.page}
        totalPages={pagination.totalPages}
        hasNext={pagination.hasNextPage}
        hasPrev={pagination.hasPrevPage}
        totalCount={pagination.totalCount}
        startIndex={pagination.startIndex}
        endIndex={pagination.endIndex}
        baseUrl={basePath}
      />
    </>
  );
}
