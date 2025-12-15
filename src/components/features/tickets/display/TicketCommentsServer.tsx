/**
 * Ticket Comments Server Component
 * 
 * Server component for rendering ticket comments.
 * No client-side JavaScript needed - pure HTML rendering.
 */

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { MessageSquare, User } from "lucide-react";
import { formatTimelineDate, formatTimelineTime } from "@/lib/utils/date-format";

export interface TicketComment {
  text?: string;
  message?: string;
  author?: string;
  created_by?: string;
  source?: string;
  createdAt?: string | Date;
  created_at?: string | Date;
  isInternal?: boolean;
  type?: string;
}

interface TicketCommentsServerProps {
  comments: TicketComment[];
}

export function TicketCommentsServer({ comments }: TicketCommentsServerProps) {
  if (!comments || comments.length === 0) {
    return (
      <Card className="border-2">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageSquare className="w-5 h-5" />
            Comments
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-6 space-y-6">
          <div className="text-center py-12 text-muted-foreground">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-muted flex items-center justify-center">
              <MessageSquare className="w-8 h-8 opacity-50" />
            </div>
            <p className="text-sm font-medium mb-1">No comments yet</p>
            <p className="text-xs">Updates and responses will appear here</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-2">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MessageSquare className="w-5 h-5" />
          Comments
          <Badge variant="secondary" className="ml-2">
            {comments.length}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-6 space-y-6">
        <ScrollArea className="h-[500px] w-full pr-4">
          <div className="space-y-4 pb-4">
            {comments.map((comment, idx) => {
              if (!comment || typeof comment !== 'object') return null;
              
              const isInternal = comment.isInternal || comment.type === "internal_note" || comment.type === "super_admin_note";
              const commentText = (typeof comment.text === 'string' ? comment.text : typeof comment.message === 'string' ? comment.message : '') || '';
              const commentAuthor = (typeof comment.author === 'string' ? comment.author : typeof comment.created_by === 'string' ? comment.created_by : 'Unknown') || 'Unknown';
              const commentSource = typeof comment.source === 'string' ? comment.source : null;
              const rawTimestamp = comment.createdAt || comment.created_at;
              const commentCreatedAt = rawTimestamp &&
                (typeof rawTimestamp === 'string' || rawTimestamp instanceof Date)
                ? rawTimestamp : null;

              // For internal notes, use card style
              if (isInternal) {
                return (
                  <Card key={idx} className="border bg-amber-50/50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800">
                    <CardContent className="p-4">
                      <Badge variant="outline" className="mb-2 text-xs bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 border-amber-300 dark:border-amber-700">
                        Internal Note
                      </Badge>
                      <p className="text-base whitespace-pre-wrap leading-relaxed mb-3">
                        {commentText}
                      </p>
                      <Separator className="my-2" />
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        {commentCreatedAt ? (
                          <>
                            <span className="font-medium">{formatTimelineDate(commentCreatedAt)}</span>
                            <span>•</span>
                            <span className="font-medium">{formatTimelineTime(commentCreatedAt)}</span>
                            {commentAuthor && (
                              <>
                                <span>•</span>
                                <span className="font-medium">{commentAuthor}</span>
                              </>
                            )}
                          </>
                        ) : (
                          commentAuthor && (
                            <span className="font-medium">{commentAuthor}</span>
                          )
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              }

              // Chat-style for regular comments
              const isStudent = commentSource === "website";
              const isAdmin = !isStudent;

              return (
                <div key={idx} className={`flex gap-3 ${isAdmin ? 'justify-end' : 'justify-start'}`}>
                  <div className={`flex gap-3 max-w-[80%] ${isAdmin ? 'flex-row-reverse' : 'flex-row'}`}>
                    <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${isAdmin ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
                      <User className="w-4 h-4" />
                    </div>
                    <div className={`flex flex-col ${isAdmin ? 'items-end' : 'items-start'}`}>
                      <div className={`rounded-2xl px-4 py-3 ${isAdmin ? 'bg-primary text-primary-foreground rounded-tr-sm' : 'bg-muted border rounded-tl-sm'}`}>
                        <p className={`text-sm whitespace-pre-wrap leading-relaxed break-words ${isAdmin ? 'text-primary-foreground' : ''}`}>{commentText}</p>
                      </div>
                      <div className={`flex items-center gap-2 text-xs text-muted-foreground mt-1 px-1 ${isAdmin ? 'flex-row-reverse' : ''}`}>
                        {commentCreatedAt ? (
                          <>
                            <span className="font-medium">{formatTimelineDate(commentCreatedAt)}</span>
                            <span>•</span>
                            <span className="font-medium">{formatTimelineTime(commentCreatedAt)}</span>
                            {commentAuthor && (
                              <>
                                <span>•</span>
                                <span className="font-medium">{commentAuthor}</span>
                              </>
                            )}
                          </>
                        ) : (
                          commentAuthor && (
                            <span className="font-medium">{commentAuthor}</span>
                          )
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}

