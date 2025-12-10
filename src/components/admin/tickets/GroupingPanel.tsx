"use client";

import { useState } from "react";
import type { Ticket } from "@/db/types-only";
import { SelectableTicketList } from "./SelectableTicketList";
import { TicketGrouping } from "./TicketGrouping";

interface GroupingPanelProps {
  availableTickets: Ticket[];
  initialGroups?: any;
  initialStats?: {
    totalGroups: number;
    activeGroups: number;
    archivedGroups: number;
    totalTicketsInGroups: number;
  } | null;
  onGroupCreated?: () => void;
}

/**
 * Client-side wrapper to manage ticket selection for grouping.
 */
export function GroupingPanel({
  availableTickets,
  initialGroups,
  initialStats,
  onGroupCreated,
}: GroupingPanelProps) {
  const [selectedIds, setSelectedIds] = useState<number[]>([]);

  return (
    <div className="space-y-6">
      <SelectableTicketList
        tickets={availableTickets}
        basePath="/admin/dashboard"
        selectedIds={selectedIds}
        onSelectionChange={setSelectedIds}
      />

      <TicketGrouping
        selectedTicketIds={selectedIds}
        initialGroups={initialGroups}
        initialStats={initialStats}
        onGroupCreated={onGroupCreated}
      />
    </div>
  );
}

