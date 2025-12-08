"use client";

import { useState } from "react";
import { TicketCard } from "@/components/layout/TicketCard";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { TicketGrouping } from "./TicketGrouping";
import { Users, X } from "lucide-react";
import type { Ticket } from "@/db/types-only";

export interface SelectableTicketListProps {
  tickets: Ticket[];
  basePath?: string;
  selectedIds?: number[];
  onSelectionChange?: (ids: number[]) => void;
}

export function SelectableTicketList({
  tickets,
  basePath = "/admin/dashboard",
  selectedIds = [],
  onSelectionChange = () => {}
}: SelectableTicketListProps) {

  const toggleTicket = (ticketId: number) => {
    onSelectionChange(
      selectedIds.includes(ticketId)
        ? selectedIds.filter((id) => id !== ticketId)
        : [...selectedIds, ticketId]
    );
  };

  const selectAll = () => {
    if (selectedIds.length === tickets.length) {
      onSelectionChange([]);
    } else {
      onSelectionChange(tickets.map((t) => t.id));
    }
  };

  return (
    <div className="space-y-6">
      {selectedIds.length > 0 && (
        <Card className="border-primary bg-primary/5">
          <CardContent className="py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Users className="w-5 h-5 text-primary" />
                <div>
                  <p className="font-semibold">
                    {selectedIds.length} ticket{selectedIds.length !== 1 ? "s" : ""} selected
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Use the toolbar above to create a group or perform actions
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={selectAll}>
                  {selectedIds.length === tickets.length ? "Deselect All" : "Select All"}
                </Button>
                <Button variant="outline" size="sm" onClick={() => onSelectionChange([])}>
                  <X className="w-4 h-4 mr-2" />
                  Clear
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Checkbox
              checked={selectedIds.length === tickets.length && tickets.length > 0}
              onCheckedChange={selectAll}
            />
            <span className="text-sm text-muted-foreground">
              Select all ({tickets.length} tickets)
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {tickets.map((ticket) => (
            <div key={ticket.id} className="relative">
              <Checkbox
                checked={selectedIds.includes(ticket.id)}
                onCheckedChange={() => toggleTicket(ticket.id)}
                className="absolute top-4 right-4 z-10 bg-background border-2"
              />
              <div
                className={selectedIds.includes(ticket.id) ? "ring-2 ring-primary rounded-lg" : ""}
                onClick={() => toggleTicket(ticket.id)}
              >
                <TicketCard ticket={ticket} basePath={basePath} disableLink />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

