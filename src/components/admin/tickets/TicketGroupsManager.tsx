"use client";

import { useState } from "react";
import { TicketGrouping } from "./TicketGrouping";
import { SelectableTicketList } from "./SelectableTicketList";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Users, Package } from "lucide-react";
import type { Ticket } from "@/db/types-only";
import { AdminTicketFilters } from "./AdminTicketFilters";

interface TicketGroupsManagerProps {
    tickets: Ticket[];
    basePath?: string;
    initialGroups?: any[];
    initialStats?: {
        totalGroups: number;
        activeGroups: number;
        archivedGroups: number;
        totalTicketsInGroups: number;
    } | null;
}

export function TicketGroupsManager({ tickets, basePath = "/admin/dashboard", initialGroups, initialStats }: TicketGroupsManagerProps) {
    const [selectedTicketIds, setSelectedTicketIds] = useState<number[]>([]);

    return (
        <div className="space-y-6">
            {/* Existing Groups & Toolbar */}
            <Card className="shadow-sm">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Users className="w-5 h-5" />
                        Ticket Groups
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <TicketGrouping
                        selectedTicketIds={selectedTicketIds}
                        onGroupCreated={() => setSelectedTicketIds([])}
                        initialGroups={initialGroups}
                        initialStats={initialStats}
                    />
                </CardContent>
            </Card>

            {/* Filters */}
            <Card className="shadow-sm">
                <CardHeader>
                    <CardTitle>Filters</CardTitle>
                </CardHeader>
                <CardContent>
                    <AdminTicketFilters />
                </CardContent>
            </Card>

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
                            selectedIds={selectedTicketIds}
                            onSelectionChange={setSelectedTicketIds}
                        />
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
