/**
 * Ticket Comments Client Component (Hybrid)
 * 
 * Wraps TicketCommentsServer with client-side state management.
 * Enables optimistic updates and live comment appending without router.refresh().
 * 
 * Strategy: Server-render initial list + client-side live updates
 * This is how GitHub / Linear / Jira handle comments.
 */

"use client";

import { useState, useMemo, useImperativeHandle, forwardRef } from "react";
import { TicketCommentsServer } from "./TicketCommentsServer";
import type { TicketComment } from "./TicketCommentsServer";

interface TicketCommentsClientProps {
  initialComments: TicketComment[];
  ticketId: number;
}

export interface TicketCommentsClientRef {
  addComment: (comment: TicketComment) => void;
  confirmComment: (activity: any, isInternal?: boolean) => void;
  removeOptimisticComment: () => void;
}

/**
 * Convert API activity response to TicketComment format
 */
function activityToComment(activity: any, isInternal: boolean = false): TicketComment {
  const details = activity.details || {};
  return {
    text: details.comment || '',
    author: activity.user_id || 'Unknown',
    source: isInternal ? 'admin' : 'admin',
    createdAt: activity.created_at || new Date(),
    created_at: activity.created_at || new Date(),
    isInternal: isInternal || activity.action === 'internal_note',
    type: activity.action === 'internal_note' ? 'internal_note' : 'comment',
  };
}

export const TicketCommentsClient = forwardRef<TicketCommentsClientRef, TicketCommentsClientProps>(
  ({ initialComments, ticketId }, ref) => {
    // FIX: Manage comments state client-side for optimistic updates
    const [localComments, setLocalComments] = useState<TicketComment[]>(initialComments || []);
    const [optimisticComments, setOptimisticComments] = useState<TicketComment[]>([]);

    // Merge server comments with optimistic comments (newest first for display)
    const allComments = useMemo(() => {
      return [...localComments, ...optimisticComments];
    }, [localComments, optimisticComments]);

    // Expose methods via ref for parent components to call
    useImperativeHandle(ref, () => ({
      addComment: (comment: TicketComment) => {
        setOptimisticComments(prev => [...prev, comment]);
      },
      confirmComment: (activity: any, isInternal: boolean = false) => {
        const serverComment = activityToComment(activity, isInternal);
        // Remove last optimistic comment and add server comment
        setOptimisticComments(prev => prev.slice(0, -1));
        setLocalComments(prev => [...prev, serverComment]);
      },
      removeOptimisticComment: () => {
        setOptimisticComments(prev => prev.slice(0, -1));
      },
    }), []);

    return <TicketCommentsServer comments={allComments} />;
  }
);

TicketCommentsClient.displayName = "TicketCommentsClient";

