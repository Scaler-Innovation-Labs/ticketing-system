"use client";

import { useState } from "react";
import { SelectableTicketList } from "./SelectableTicketList";
import { TicketGrouping } from "./TicketGrouping";
import type { Ticket } from "@/db/types-only";

interface SelectableTicketListWrapperProps {
  tickets: Ticket[];
  basePath?: string;
  initialGroups?: any[];
  initialStats?: any;
}

export function SelectableTicketListWrapper({
  tickets,
  basePath = "/admin/dashboard",
  initialGroups,
  initialStats,
}: SelectableTicketListWrapperProps) {
  const [selectedIds, setSelectedIds] = useState<number[]>([]);

  return (
    <>
      <SelectableTicketList
        tickets={tickets}
        basePath={basePath}
        selectedIds={selectedIds}
        onSelectionChange={setSelectedIds}
      />
      <TicketGrouping
        selectedTicketIds={selectedIds}
        initialGroups={initialGroups}
        initialStats={initialStats}
        onGroupCreated={() => {
          // Clear selection after group is created
          setSelectedIds([]);
        }}
      />
    </>
  );
}

