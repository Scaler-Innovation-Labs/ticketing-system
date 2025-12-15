/**
 * Ticket Comments with Composer (Hybrid Client Component)
 * 
 * Manages comments state client-side for optimistic updates.
 * Wraps TicketCommentsServer (server component) with client state management.
 * 
 * Strategy: Server-render initial list + client-side live updates
 * This is how GitHub / Linear / Jira handle comments.
 */

"use client";

import { useState, useMemo } from "react";
import { TicketCommentsServer } from "./TicketCommentsServer";
import { AdminCommentComposer } from "@/components/features/tickets/actions/AdminCommentComposer";
import { Separator } from "@/components/ui/separator";
import type { TicketComment } from "./TicketCommentsServer";

interface TicketCommentsWithComposerProps {
  initialComments: TicketComment[];
  ticketId: number;
  currentUserName?: string; // Current user's name for optimistic comments
  onStatusChanged?: (newStatus: string) => void;
}

/**
 * Convert API activity response to TicketComment format
 */
function activityToComment(activity: any, isInternal: boolean = false): TicketComment {
  const details = activity.details || {};
  return {
    text: details.comment || '',
    author: activity.user_name || activity.user_id || 'Unknown', // Use user_name from API, fallback to user_id
    source: isInternal ? 'admin' : 'admin',
    createdAt: activity.created_at || new Date(),
    created_at: activity.created_at || new Date(),
    isInternal: isInternal || activity.action === 'internal_note',
    type: activity.action === 'internal_note' ? 'internal_note' : 'comment',
  };
}

export function TicketCommentsWithComposer({
  initialComments,
  ticketId,
  currentUserName,
  onStatusChanged,
}: TicketCommentsWithComposerProps) {
  // FIX: Manage comments state client-side for optimistic updates
  const [localComments, setLocalComments] = useState<TicketComment[]>(initialComments || []);
  const [optimisticComments, setOptimisticComments] = useState<TicketComment[]>([]);

  // Merge server comments with optimistic comments
  const allComments = useMemo(() => {
    return [...localComments, ...optimisticComments];
  }, [localComments, optimisticComments]);

  // Handle optimistic comment addition
  const handleCommentAdded = (comment: TicketComment) => {
    // Ensure optimistic comment has author name
    const commentWithAuthor: TicketComment = {
      ...comment,
      author: comment.author || currentUserName || 'Unknown',
    };
    setOptimisticComments(prev => [...prev, commentWithAuthor]);
  };

  // Handle comment confirmation from API response
  const handleCommentConfirmed = async (response: Response, isQuestion: boolean = false) => {
    try {
      const data = await response.json();
      
      // Extract activity from response (for both regular comments and questions)
      if (data.activity) {
        const serverComment = activityToComment(data.activity, false);
        // Remove optimistic comment and add server comment
        setOptimisticComments(prev => prev.slice(0, -1));
        setLocalComments(prev => [...prev, serverComment]);
      } else if (isQuestion && data.activity) {
        // For questions, use activity from response (should always be present now)
        const serverComment = activityToComment(data.activity, false);
        setOptimisticComments(prev => prev.slice(0, -1));
        setLocalComments(prev => [...prev, serverComment]);
      } else if (isQuestion && data.question) {
        // Fallback: construct comment from response data if activity missing
        const questionComment: TicketComment = {
          text: data.question,
          source: 'admin',
          author: currentUserName || 'Unknown', // Include author name
          createdAt: new Date(),
          created_at: new Date(),
          isInternal: false,
          type: 'comment',
        };
        setOptimisticComments(prev => prev.slice(0, -1));
        setLocalComments(prev => [...prev, questionComment]);
      }
    } catch (error) {
      // On error, remove optimistic comment
      setOptimisticComments(prev => prev.slice(0, -1));
    }
  };

  return (
    <>
      <TicketCommentsServer comments={allComments} />
      <div className="mt-6">
        <Separator className="mb-6" />
        <AdminCommentComposer 
          ticketId={ticketId}
          currentUserName={currentUserName}
          onCommentAdded={handleCommentAdded}
          onStatusChanged={onStatusChanged}
          onCommentConfirmed={handleCommentConfirmed}
        />
      </div>
    </>
  );
}

