"use client";

import { Button } from "@/components/ui/button";
import { Settings, MessageSquare, X, Archive, ArchiveRestore } from "lucide-react";

interface GroupActionsProps {
  onManageTickets: () => void;
  onBulkActions: () => void;
  onDelete: () => void;
  onArchive?: () => void;
  isArchived?: boolean;
}

export function GroupActions({
  onManageTickets,
  onBulkActions,
  onDelete,
  onArchive,
  isArchived = false,
}: GroupActionsProps) {
  return (
    <div className="flex gap-2">
      <Button
        variant="outline"
        size="sm"
        className="flex-1"
        onClick={onManageTickets}
        disabled={isArchived}
      >
        <Settings className="w-4 h-4 mr-2" />
        Manage Tickets
      </Button>
      <Button
        variant="outline"
        size="sm"
        className="flex-1"
        onClick={onBulkActions}
        disabled={isArchived}
      >
        <MessageSquare className="w-4 h-4 mr-2" />
        Bulk Actions
      </Button>
      {onArchive && (
        <Button
          variant="outline"
          size="sm"
          onClick={onArchive}
          className="h-8 w-8 p-0"
          title={isArchived ? "Unarchive group" : "Archive group"}
        >
          {isArchived ? (
            <ArchiveRestore className="w-4 h-4" />
          ) : (
            <Archive className="w-4 h-4" />
          )}
        </Button>
      )}
      <Button
        variant="ghost"
        size="sm"
        onClick={onDelete}
        className="h-8 w-8 p-0"
      >
        <X className="w-4 h-4" />
      </Button>
    </div>
  );
}
