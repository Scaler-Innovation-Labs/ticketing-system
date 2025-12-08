"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Users, Plus, RotateCcw, MessageSquare } from "lucide-react";
import { ManageGroupTicketsDialog } from "./ManageGroupTicketsDialog";
import { GroupDialog } from "./GroupDialog";
import { AddToGroupDialog } from "./AddToGroupDialog";
import { BulkActions } from "./BulkActions";
import { GroupList } from "./GroupList";

interface Ticket {
  id: number;
  status: string | null;
  description: string | null;
  location?: string | null;
  created_at: Date | string;
  category_name?: string | null;
  resolution_due_at?: Date | string | null;
  metadata?: {
    tatDate?: string;
    tat?: string;
  } | null;
  // Legacy fields kept for backward compatibility with API responses
  user_number?: string | null;
  category?: string | null;
  subcategory?: string | null;
}

interface TicketGroup {
  id: number;
  name: string;
  description: string | null;
  created_at: Date | string;
  is_archived: boolean;
  tickets: Ticket[];
  ticketCount: number;
}

interface TicketGroupingProps {
  selectedTicketIds: number[];
  onGroupCreated?: () => void;
  initialGroups?: TicketGroup[] | null;
  initialStats?: {
    totalGroups: number;
    activeGroups: number;
    archivedGroups: number;
    totalTicketsInGroups: number;
  } | null;
}

export function TicketGrouping({ selectedTicketIds, onGroupCreated, initialGroups, initialStats }: TicketGroupingProps) {
  const [groups, setGroups] = useState<TicketGroup[]>(initialGroups || []);
  const [loading, setLoading] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isAddToGroupDialogOpen, setIsAddToGroupDialogOpen] = useState(false);
  const [isBulkActionDialogOpen, setIsBulkActionDialogOpen] = useState(false);
  const [selectedGroupId, setSelectedGroupId] = useState<number | null>(null);
  const [targetGroupIdForAdd, setTargetGroupIdForAdd] = useState<number | null>(null);
  const [groupName, setGroupName] = useState("");
  const [groupDescription, setGroupDescription] = useState("");
  const [bulkAction, setBulkAction] = useState<"comment" | "close">("comment");
  const [bulkComment, setBulkComment] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [isManageTicketsDialogOpen, setIsManageTicketsDialogOpen] = useState(false);
  const [selectedGroupForManagement, setSelectedGroupForManagement] = useState<TicketGroup | null>(null);
  const [stats, setStats] = useState<{
    totalGroups: number;
    activeGroups: number;
    archivedGroups: number;
    totalTicketsInGroups: number;
  } | null>(initialStats || null);

  const hasInitialGroups = (initialGroups?.length || 0) > 0;

  useEffect(() => {
    if (!hasInitialGroups) {
      fetchGroups();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasInitialGroups]);

  const fetchGroups = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch("/api/tickets/groups", {
        cache: 'no-store'
      });
      if (response.ok) {
        const contentType = response.headers.get("content-type");
        if (contentType && contentType.includes("application/json")) {
          const responseData = await response.json();
          // ApiResponse wraps data in { success: true, data: { groups, ... } }
          const apiData = responseData.data || responseData;
          const nextGroups = Array.isArray(apiData.groups) ? apiData.groups : null;
          if (nextGroups) {
            setGroups(nextGroups);
          }
          if (apiData.stats) {
            setStats(apiData.stats);
          }
        } else {
          toast.error("Server returned invalid response format");
        }
      } else {
        toast.error("Failed to load groups. Please try again.");
      }
    } catch (error) {
      console.error("Error fetching groups:", error);
      toast.error("An error occurred while loading groups.");
    } finally {
      setLoading(false);
    }
  }, []);

  const handleCreateGroup = useCallback(async () => {
    if (!groupName.trim() || selectedTicketIds.length === 0) {
      toast.error("Please provide a group name and select at least one ticket");
      return;
    }

    try {
      setLoading(true);
      const response = await fetch("/api/tickets/groups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: groupName.trim(),
          description: groupDescription.trim() || null,
          ticketIds: selectedTicketIds,
        }),
      });

      if (response.ok) {
        toast.success("Ticket group created successfully");
        setGroupName("");
        setGroupDescription("");
        setIsCreateDialogOpen(false);
        fetchGroups();
        onGroupCreated?.();
      } else {
        const contentType = response.headers.get("content-type");
        if (contentType && contentType.includes("application/json")) {
          const error = await response.json();
          const errorMessage = typeof error.error === 'string' ? error.error : "Failed to create group";
          toast.error(errorMessage);
        } else {
          toast.error(`Failed to create group (${response.status} ${response.statusText})`);
        }
      }
    } catch (error) {
      console.error("Error creating group:", error);
      toast.error("Failed to create group");
    } finally {
      setLoading(false);
    }
  }, [selectedTicketIds, groupName, groupDescription, onGroupCreated, fetchGroups]);

  const handleBulkAction = useCallback(async () => {
    if (!selectedGroupId) {
      toast.error("Please select a group");
      return;
    }

    if (bulkAction === "comment" && !bulkComment.trim()) {
      toast.error("Please provide a comment");
      return;
    }

    try {
      setLoading(true);
      const response = await fetch(`/api/tickets/groups/${selectedGroupId}/bulk-action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: bulkAction,
          comment: bulkComment.trim() || null,
          status: bulkAction === "close" ? "resolved" : undefined,
        }),
      });

      if (response.ok) {
        const contentType = response.headers.get("content-type");
        if (contentType && contentType.includes("application/json")) {
          const responseData = await response.json();
          // ApiResponse wraps data in { success: true, data: { summary, ... } }
          const apiData = responseData.data || responseData;
          const summary = apiData.summary || { successful: 0, failed: 0, total: 0 };
          const groupArchived = apiData.groupArchived || false;
          
          // Show success message with archive info
          let message = `Bulk action completed: ${summary.successful} successful, ${summary.failed} failed`;
          if (groupArchived) {
            message = `All tickets closed. Group has been archived.`;
            // Optimistically update the group state to reflect archived status
            if (selectedGroupId) {
              setGroups(prevGroups => 
                prevGroups.map(group => 
                  group.id === selectedGroupId 
                    ? { ...group, is_archived: true }
                    : group
                )
              );
              // Update stats optimistically
              setStats(prevStats => {
                if (!prevStats) return prevStats;
                return {
                  ...prevStats,
                  activeGroups: Math.max(0, prevStats.activeGroups - 1),
                  archivedGroups: prevStats.archivedGroups + 1,
                };
              });
            }
            // Switch to archived tab to show the archived group
            setShowArchived(true);
          }
          
          if (summary.failed > 0 && apiData.errors) {
            // Show errors if any
            const errorMessages = apiData.errors
              .map((e: { ticketId: number; error: string }) => `Ticket #${e.ticketId}: ${e.error}`)
              .join(", ");
            toast.warning(message, {
              description: errorMessages,
              duration: 5000,
            });
          } else {
            toast.success(message, {
              duration: groupArchived ? 4000 : 3000,
            });
          }
        } else {
          toast.error("Server returned invalid response format");
        }
        setBulkComment("");
        setIsBulkActionDialogOpen(false);
        setSelectedGroupId(null);
        // Refresh groups to get updated archive status and ticket counts
        await fetchGroups();
        onGroupCreated?.();
      } else {
        const contentType = response.headers.get("content-type");
        if (contentType && contentType.includes("application/json")) {
          const error = await response.json();
          const errorMessage = typeof error.error === 'string' ? error.error : "Failed to perform bulk action";
          toast.error(errorMessage);
        } else {
          toast.error(`Failed to perform bulk action (${response.status} ${response.statusText})`);
        }
      }
    } catch (error) {
      console.error("Error performing bulk action:", error);
      toast.error("Failed to perform bulk action");
    } finally {
      setLoading(false);
    }
  }, [selectedGroupId, bulkAction, bulkComment, onGroupCreated, fetchGroups]);

  const handleAddToExistingGroup = useCallback(async () => {
    if (!targetGroupIdForAdd) {
      toast.error("Please select a group");
      return;
    }

    if (selectedTicketIds.length === 0) {
      toast.error("Please select at least one ticket to add");
      return;
    }

    try {
      setLoading(true);
      const response = await fetch(`/api/tickets/groups/${targetGroupIdForAdd}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          addTicketIds: selectedTicketIds,
        }),
      });

      if (response.ok) {
        const contentType = response.headers.get("content-type");
        if (contentType && contentType.includes("application/json")) {
          const responseData = await response.json();
          // ApiResponse wraps data in { success: true, data: { message, ... } }
          const apiData = responseData.data || responseData;
          const message = apiData.message || `Added ${selectedTicketIds.length} ticket${selectedTicketIds.length !== 1 ? "s" : ""} to group`;
          toast.success(message);
        } else {
          toast.success(
            `Added ${selectedTicketIds.length} ticket${selectedTicketIds.length !== 1 ? "s" : ""} to group`
          );
        }
        setIsAddToGroupDialogOpen(false);
        setTargetGroupIdForAdd(null);
        fetchGroups();
        onGroupCreated?.();
      } else {
        const contentType = response.headers.get("content-type");
        if (contentType && contentType.includes("application/json")) {
          const error = await response.json();
          const errorMessage = typeof error.error === 'string' ? error.error : "Failed to add tickets to group";
          toast.error(errorMessage);
        } else {
          toast.error(`Failed to add tickets to group (${response.status} ${response.statusText})`);
        }
      }
    } catch (error) {
      console.error("Error adding tickets to group:", error);
      toast.error("Failed to add tickets to group");
    } finally {
      setLoading(false);
    }
  }, [targetGroupIdForAdd, selectedTicketIds, fetchGroups, onGroupCreated]);

  const handleDeleteGroup = useCallback(async (groupId: number) => {
    if (!confirm("Are you sure you want to delete this group? Tickets will be ungrouped.")) {
      return;
    }

    try {
      setLoading(true);
      const response = await fetch(`/api/tickets/groups/${groupId}`, {
        method: "DELETE",
      });

      if (response.ok) {
        toast.success("Group deleted successfully");
        fetchGroups();
        onGroupCreated?.();
      } else {
        const contentType = response.headers.get("content-type");
        if (contentType && contentType.includes("application/json")) {
          const error = await response.json();
          const errorMessage = typeof error.error === 'string' ? error.error : "Failed to delete group";
          toast.error(errorMessage);
        } else {
          toast.error(`Failed to delete group (${response.status} ${response.statusText})`);
        }
      }
    } catch (error) {
      console.error("Error deleting group:", error);
      toast.error("Failed to delete group");
    } finally {
      setLoading(false);
    }
  }, [onGroupCreated, fetchGroups]);

  const handleArchiveGroup = useCallback(async (groupId: number) => {
    // Find the group to check if it's archived
    const group = groups.find(g => g.id === groupId);
    const isArchived = group?.is_archived || false;
    
    const action = isArchived ? "unarchive" : "archive";
    if (!confirm(`Are you sure you want to ${action} this group?`)) {
      return;
    }

    try {
      setLoading(true);
      const response = await fetch(`/api/tickets/groups/${groupId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          archive: !isArchived,
        }),
      });

      if (response.ok) {
        const contentType = response.headers.get("content-type");
        if (contentType && contentType.includes("application/json")) {
          const responseData = await response.json();
          const apiData = responseData.data || responseData;
          const message = apiData.message || `Group ${action}d successfully`;
          toast.success(message);
        } else {
          toast.success(`Group ${action}d successfully`);
        }
        
        // Optimistically update the group state
        setGroups(prevGroups => 
          prevGroups.map(g => 
            g.id === groupId 
              ? { ...g, is_archived: !isArchived }
              : g
          )
        );
        
        // Update stats optimistically
        setStats(prevStats => {
          if (!prevStats) return prevStats;
          if (isArchived) {
            // Unarchiving: moving from archived to active
            return {
              ...prevStats,
              activeGroups: prevStats.activeGroups + 1,
              archivedGroups: Math.max(0, prevStats.archivedGroups - 1),
            };
          } else {
            // Archiving: moving from active to archived
            return {
              ...prevStats,
              activeGroups: Math.max(0, prevStats.activeGroups - 1),
              archivedGroups: prevStats.archivedGroups + 1,
            };
          }
        });
        
        // If archiving, switch to archived tab; if unarchiving, switch to active tab
        if (!isArchived) {
          setShowArchived(true);
        } else {
          setShowArchived(false);
        }
        
        fetchGroups();
        onGroupCreated?.();
      } else {
        const contentType = response.headers.get("content-type");
        if (contentType && contentType.includes("application/json")) {
          const error = await response.json();
          const errorMessage = typeof error.error === 'string' ? error.error : `Failed to ${action} group`;
          toast.error(errorMessage);
        } else {
          toast.error(`Failed to ${action} group (${response.status} ${response.statusText})`);
        }
      }
    } catch (error) {
      console.error(`Error ${action}ing group:`, error);
      toast.error(`Failed to ${action} group`);
    } finally {
      setLoading(false);
    }
  }, [groups, onGroupCreated, fetchGroups]);

  // Filter groups based on search query (memoized for performance)
  const filteredGroups = useMemo(() => {
    if (!searchQuery.trim()) return groups;
    const query = searchQuery.toLowerCase();
    return groups.filter(group =>
      group.name.toLowerCase().includes(query) ||
      group.description?.toLowerCase().includes(query) ||
      group.tickets.some(t => t.id.toString().includes(query))
    );
  }, [groups, searchQuery]);

  // Memoize displayed groups (filtered by archived status)
  const displayedGroups = useMemo(() =>
    filteredGroups.filter(group => showArchived || !group.is_archived),
    [filteredGroups, showArchived]
  );

  // Memoize stats calculations
  const activeGroupsCount = useMemo(() =>
    filteredGroups.filter(g => !g.is_archived).length,
    [filteredGroups]
  );

  const archivedGroupsCount = useMemo(() =>
    filteredGroups.filter(g => g.is_archived).length,
    [filteredGroups]
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-2">
          <Users className="w-5 h-5" />
          <h3 className="text-lg font-semibold">Ticket Groups</h3>
          {stats && (
            <Badge variant="secondary" className="text-xs">
              {stats.activeGroups} active
            </Badge>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={fetchGroups}
            disabled={loading}
          >
            <RotateCcw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button
            size="sm"
            disabled={selectedTicketIds.length === 0}
            onClick={() => setIsCreateDialogOpen(true)}
          >
            <Plus className="w-4 h-4 mr-2" />
            Create Group ({selectedTicketIds.length})
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={selectedTicketIds.length === 0 || groups.length === 0}
            onClick={() => setIsAddToGroupDialogOpen(true)}
          >
            <Users className="w-4 h-4 mr-2" />
            Add to Group ({selectedTicketIds.length})
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={groups.length === 0}
            onClick={() => setIsBulkActionDialogOpen(true)}
          >
            <MessageSquare className="w-4 h-4 mr-2" />
            Bulk Actions
          </Button>
        </div>
      </div>

      <GroupList
        groups={groups}
        filteredGroups={filteredGroups}
        displayedGroups={displayedGroups}
        loading={loading}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        showArchived={showArchived}
        onShowArchivedChange={setShowArchived}
        activeGroupsCount={activeGroupsCount}
        archivedGroupsCount={archivedGroupsCount}
        onManageTickets={(group) => {
          setSelectedGroupForManagement(group);
          setIsManageTicketsDialogOpen(true);
        }}
        onBulkActions={(groupId) => {
          setSelectedGroupId(groupId);
          setIsBulkActionDialogOpen(true);
        }}
        onDelete={handleDeleteGroup}
        onArchive={handleArchiveGroup}
      />

      <GroupDialog
        open={isCreateDialogOpen}
        onOpenChange={setIsCreateDialogOpen}
        groupName={groupName}
        onGroupNameChange={setGroupName}
        groupDescription={groupDescription}
        onGroupDescriptionChange={setGroupDescription}
        selectedTicketCount={selectedTicketIds.length}
        loading={loading}
        onSubmit={handleCreateGroup}
      />

      <AddToGroupDialog
        open={isAddToGroupDialogOpen}
        onOpenChange={setIsAddToGroupDialogOpen}
        groups={groups}
        targetGroupId={targetGroupIdForAdd}
        onTargetGroupIdChange={setTargetGroupIdForAdd}
        selectedTicketCount={selectedTicketIds.length}
        loading={loading}
        onSubmit={handleAddToExistingGroup}
      />

      <BulkActions
        open={isBulkActionDialogOpen}
        onOpenChange={setIsBulkActionDialogOpen}
        groups={groups}
        selectedGroupId={selectedGroupId}
        onSelectedGroupIdChange={setSelectedGroupId}
        bulkAction={bulkAction}
        onBulkActionChange={setBulkAction}
        bulkComment={bulkComment}
        onBulkCommentChange={setBulkComment}
        loading={loading}
        onSubmit={handleBulkAction}
      />

      <ManageGroupTicketsDialog
        group={selectedGroupForManagement}
        open={isManageTicketsDialogOpen}
        onOpenChange={(open) => {
          setIsManageTicketsDialogOpen(open);
          if (!open) {
            setSelectedGroupForManagement(null);
          }
        }}
        onSuccess={() => {
          fetchGroups();
          onGroupCreated?.();
        }}
      />
    </div>
  );
}
