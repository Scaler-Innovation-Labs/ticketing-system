"use client";

import { useState } from "react";
import { TicketGrouping, SelectableTicketList } from "@/components/admin/tickets";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, Package } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { Ticket } from "@/db/types-only";

interface CommitteeTicketManagerProps {
    tickets: Ticket[];
    initialGroups?: any[] | null;
    initialStats?: {
        totalGroups: number;
        activeGroups: number;
        archivedGroups: number;
        totalTicketsInGroups: number;
    } | null;
}

export function CommitteeTicketManager({ tickets, initialGroups, initialStats }: CommitteeTicketManagerProps) {
    const [selectedTicketIds, setSelectedTicketIds] = useState<number[]>([]);

    return (
        <div className="space-y-6">
            {/* Existing Groups */}
            <Card className="shadow-sm">
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <CardTitle className="flex items-center gap-2">
                            <Users className="w-5 h-5" />
                            Existing Groups
                        </CardTitle>
                    </div>
                </CardHeader>
                <CardContent>
                    <TicketGrouping 
                        selectedTicketIds={selectedTicketIds}
                        initialGroups={initialGroups}
                        initialStats={initialStats}
                    />
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
                                Tickets will appear here once they are created by you or tagged to your committee
                            </p>
                        </div>
                    ) : (
                        <SelectableTicketList
                            tickets={tickets}
                            basePath="/committee/dashboard"
                            selectedIds={selectedTicketIds}
                            onSelectionChange={setSelectedTicketIds}
                        />
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
