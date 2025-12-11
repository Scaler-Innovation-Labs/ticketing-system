"use client";

import { useState, type ReactNode } from "react";
import { TicketGrouping } from "./TicketGrouping";
import { SelectableTicketList } from "./SelectableTicketList";
import type { Ticket } from "@/db/types-only";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, Package } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface TicketGroupManagerProps {
    tickets: Ticket[];
    basePath?: string;
    initialGroups?: any[] | null;
    initialStats?: {
        totalGroups: number;
        activeGroups: number;
        archivedGroups: number;
        totalTicketsInGroups: number;
    } | null;
    filters?: ReactNode;
}

export function TicketGroupManager({ tickets, basePath, initialGroups, initialStats, filters }: TicketGroupManagerProps) {
    const [selectedIds, setSelectedIds] = useState<number[]>([]);

    return (
        <div className="space-y-6">
            {/* Existing Groups & Actions */}
            <Card className="shadow-sm">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Users className="w-5 h-5" />
                        Existing Groups
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <TicketGrouping
                        selectedTicketIds={selectedIds}
                        onGroupCreated={() => setSelectedIds([])}
                        initialGroups={initialGroups}
                        initialStats={initialStats}
                    />
                </CardContent>
            </Card>

            {/* Filters (in between existing groups and selection) */}
            {filters}

            {/* Select Tickets to Group */}
            <Card className="shadow-sm">
                <CardHeader>
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                        <CardTitle>Select Tickets to Group</CardTitle>
                        <Badge variant="secondary" className="text-sm w-fit">
                            {tickets.length} {tickets.length === 1 ? "ticket" : "tickets"} available
                        </Badge>
                    </div>
                </CardHeader>
                <CardContent>
                    {tickets.length === 0 ? (
                        <div className="py-12 text-center">
                            <Package className="w-12 h-12 text-muted-foreground mx-auto mb-3 opacity-50" />
                            <p className="text-muted-foreground font-medium">No tickets available for grouping</p>
                            <p className="text-sm text-muted-foreground mt-1">
                                Create tickets first to start grouping them
                            </p>
                        </div>
                    ) : (
                        <SelectableTicketList
                            tickets={tickets}
                            basePath={basePath}
                            selectedIds={selectedIds}
                            onSelectionChange={setSelectedIds}
                        />
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
