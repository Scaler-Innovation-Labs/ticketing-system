"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tag, UserPlus } from "lucide-react";
import type { Ticket } from "@/db/types-only";
import { TicketCard } from "@/components/layout/TicketCard";
import TicketSearch from "@/components/student/TicketSearch";
import { Card, CardContent } from "@/components/ui/card";

interface CommitteeTicketsTabsProps {
  committeeId: number;
  taggedTickets: Ticket[];
  createdTickets: Ticket[];
  filteredTaggedTickets: Ticket[];
  filteredCreatedTickets: Ticket[];
  search: string;
  statusFilter: string;
  categoryFilter: string;
  basePath?: string; // Base path for navigation (e.g., "/superadmin/dashboard" or "/snr-admin/dashboard")
}

export function CommitteeTicketsTabs({
  committeeId,
  taggedTickets,
  createdTickets,
  filteredTaggedTickets,
  filteredCreatedTickets,
  search,
  statusFilter,
  categoryFilter,
  basePath = "/superadmin/dashboard",
}: CommitteeTicketsTabsProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const currentTab = searchParams.get("tab") || "tagged";

  const handleTabChange = (value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", value);
    router.push(`${basePath}/committees/${committeeId}/tickets?${params.toString()}`);
  };

  return (
    <Tabs value={currentTab} onValueChange={handleTabChange} className="space-y-4">
      <TabsList>
        <TabsTrigger value="tagged">
          <Tag className="w-4 h-4 mr-2" />
          Tagged Tickets ({taggedTickets.length})
        </TabsTrigger>
        <TabsTrigger value="created">
          <UserPlus className="w-4 h-4 mr-2" />
          Created Tickets ({createdTickets.length})
        </TabsTrigger>
      </TabsList>

      <TabsContent value="tagged" className="space-y-4">
        <div>
          <p className="text-sm text-muted-foreground mb-4">
            Tickets that have been tagged/assigned to this committee
          </p>
          {/* Search and Filters */}
          <TicketSearch basePath={`${basePath}/committees/${committeeId}/tickets`} />
          {/* Tickets List */}
          {filteredTaggedTickets.length === 0 ? (
            <Card className="border-2 border-dashed">
              <CardContent className="flex flex-col items-center justify-center py-16">
                <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
                  <Tag className="w-8 h-8 text-muted-foreground" />
                </div>
                <p className="text-lg font-semibold mb-1">No tagged tickets found</p>
                <p className="text-sm text-muted-foreground text-center max-w-md mb-4">
                  {search || statusFilter || categoryFilter
                    ? "Try adjusting your search or filters"
                    : "No tickets have been tagged to this committee yet"}
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {filteredTaggedTickets.map((ticket) => (
                <TicketCard
                  key={ticket.id}
                  ticket={ticket as unknown as Ticket & { status?: string | null; category_name?: string | null; creator_name?: string | null; creator_email?: string | null }}
                  basePath={basePath}
                />
              ))}
            </div>
          )}
        </div>
      </TabsContent>

      <TabsContent value="created" className="space-y-4">
        <div>
          <p className="text-sm text-muted-foreground mb-4">
            Tickets created by members of this committee
          </p>
          {/* Search and Filters */}
          <TicketSearch basePath={`${basePath}/committees/${committeeId}/tickets`} />
          {/* Tickets List */}
          {filteredCreatedTickets.length === 0 ? (
            <Card className="border-2 border-dashed">
              <CardContent className="flex flex-col items-center justify-center py-16">
                <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
                  <UserPlus className="w-8 h-8 text-muted-foreground" />
                </div>
                <p className="text-lg font-semibold mb-1">No created tickets found</p>
                <p className="text-sm text-muted-foreground text-center max-w-md mb-4">
                  {search || statusFilter || categoryFilter
                    ? "Try adjusting your search or filters"
                    : "No tickets have been created by committee members yet"}
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {filteredCreatedTickets.map((ticket) => (
                <TicketCard
                  key={ticket.id}
                  ticket={ticket as unknown as Ticket & { status?: string | null; category_name?: string | null; creator_name?: string | null; creator_email?: string | null }}
                  basePath={basePath}
                />
              ))}
            </div>
          )}
        </div>
      </TabsContent>
    </Tabs>
  );
}

