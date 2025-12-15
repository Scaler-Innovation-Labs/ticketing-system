"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, MessageCircleQuestion, MessageSquarePlus } from "lucide-react";
import { toast } from "sonner";
import { logger } from "@/lib/logger";
import { AriaLiveRegion } from "@/lib/ui/aria-live-region";

interface AdminCommentComposerProps {
  ticketId: number;
  currentUserName?: string; // Current user's name for optimistic comments
  onCommentAdded?: (comment: { text: string; source: string; createdAt: Date; author?: string }) => void;
  onStatusChanged?: (newStatus: string) => void;
  onCommentConfirmed?: (response: Response, isQuestion?: boolean) => void;
}

export function AdminCommentComposer({ ticketId, currentUserName, onCommentAdded, onStatusChanged, onCommentConfirmed }: AdminCommentComposerProps) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState<"comment" | "question" | null>(null);

  const handleSubmit = async (action: "comment" | "question") => {
    if (!message.trim()) {
      toast.error("Please enter a message");
      return;
    }

    const messageText = message.trim();
    const optimisticComment = {
      text: messageText,
      source: "admin",
      createdAt: new Date(),
      author: currentUserName || 'Unknown', // Include author name for optimistic comment
    };

    // Optimistic updates - update UI immediately
    if (onCommentAdded) {
      onCommentAdded(optimisticComment);
    }

    if (action === "question" && onStatusChanged) {
      onStatusChanged("awaiting_student_response");
    }

    setMessage("");
    setLoading(action);

    try {
      let response: Response;

      if (action === "question") {
        // Single atomic API call - updates status + adds comment in one transaction
        response = await fetch(`/api/tickets/${ticketId}/ask-question`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: 'include',
          body: JSON.stringify({
            question: messageText,
          }),
        });
      } else {
        // Regular comment (no status change)
        response = await fetch(`/api/tickets/${ticketId}/comments`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: 'include',
          body: JSON.stringify({
            comment: messageText,
            is_internal: false, // Admin comments are visible to students
            attachments: [],
          }),
        });
      }

      if (!response.ok) {
        // Rollback optimistic comment
        const error = await response.json().catch(() => ({ error: "Failed to send comment" }));
        throw new Error(error.error || "Failed to send comment");
      }

      // FIX: Clone response for onCommentConfirmed (response can only be read once)
      const responseClone = response.clone();
      
      // FIX: Confirm comment with server response (replaces optimistic with real data)
      if (onCommentConfirmed) {
        await onCommentConfirmed(responseClone, action === "question");
      }

      toast.success(action === "question" ? "Question sent to student" : "Comment added");
    } catch (error) {
      logger.error({ error, component: "AdminCommentComposer", ticketId }, "Comment composer error");
      // Extract error message properly
      let errorMessage = "Something went wrong";
      if (error instanceof Error) {
        errorMessage = error.message;
      } else if (typeof error === 'object' && error !== null) {
        // Handle API error response objects
        const errObj = error as Record<string, unknown>;
        if (typeof errObj.message === 'string') {
          errorMessage = errObj.message;
        } else if (typeof errObj.error === 'string') {
          errorMessage = errObj.error;
        }
      } else if (typeof error === 'string') {
        errorMessage = error;
      }
      toast.error(errorMessage);
      // Restore message on error
      setMessage(messageText);
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="space-y-3">
      <AriaLiveRegion
        loading={loading !== null}
        loadingMessage={loading === "comment" ? "Adding comment..." : loading === "question" ? "Sending question..." : undefined}
        success={false}
        error={false}
      />
      <div>
        <p className="text-sm font-semibold text-foreground">Send an update</p>
        <p className="text-xs text-muted-foreground">
          Students receive an email + dashboard notification for every message
        </p>
      </div>

      <Textarea
        value={message}
        onChange={(event) => setMessage(event.target.value)}
        placeholder="Type your update or question for the student..."
        rows={4}
        className="resize-none"
        disabled={loading !== null}
      />

      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          onClick={() => handleSubmit("comment")}
          disabled={loading !== null || message.trim().length === 0}
        >
          {loading === "comment" ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Sending...
            </>
          ) : (
            <>
              <MessageSquarePlus className="w-4 h-4 mr-2" />
              Add Comment
            </>
          )}
        </Button>

        <Button
          variant="default"
          onClick={() => handleSubmit("question")}
          disabled={loading !== null || message.trim().length === 0}
          className="bg-primary text-primary-foreground"
        >
          {loading === "question" ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Sending...
            </>
          ) : (
            <>
              <MessageCircleQuestion className="w-4 h-4 mr-2" />
              Ask Question
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

