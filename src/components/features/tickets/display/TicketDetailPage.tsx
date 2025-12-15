"use client";

import { notFound } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Calendar, ArrowLeft, User, MapPin, FileText, Clock, AlertTriangle, AlertCircle, Image as ImageIcon, MessageSquare, CheckCircle2, Sparkles, RotateCw } from "lucide-react";
import { AdminActions } from "@/components/features/tickets/actions/AdminActions";
import { CommitteeTagging } from "@/components/admin/committees";
import { AdminCommentComposer } from "@/components/features/tickets/actions/AdminCommentComposer";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { TicketStatusBadge } from "@/components/features/tickets/display/TicketStatusBadge";
import { DynamicFieldDisplay } from "@/components/features/tickets/display/DynamicFieldDisplay";
import { addBusinessHours } from "@/lib/ticket/utils/tat-calculator";
import type { TicketMetadata } from "@/db/inferred-types";
import { ImageLightbox } from "@/components/features/tickets/display/ImageLightbox";
import { Info } from "lucide-react";
import { formatTimelineDate, formatTimelineTime, formatTimelineDateTime } from "@/lib/utils/date-format";

// Admin type configuration
export type AdminType = 'admin' | 'snr-admin' | 'superadmin' | 'committee';

export interface TicketDetailPageProps {
  adminType: AdminType;
  ticketId: number;
  ticket: any;
  metadata: TicketMetadata;
  timelineEntries: any[];
  resolvedProfileFields: any[];
  dynamicFields: any[];
  images: string[];
  comments: any[];
  tatInfo: any;
  normalizedStatus: string;
  ticketProgress: number;
  statusDisplay: string | { value: string; label: string; badge_color?: string | null };
  category: string;
  subcategory: string;
  assignedStaff: string | { name: string; email?: string | null; role?: string; avatar_url?: string | null } | null;
  hasTAT: boolean;
  isSuperAdmin?: boolean;
  currentAssignedTo?: string | null;
  forwardTargets?: any[];
  tatExtensionCount?: number;
  escalationLevel?: number;
  onStatusChanged?: (newStatus: string) => void;
}

// Configuration for different admin types
const ADMIN_CONFIGS = {
  admin: {
    showCommitteeTagging: false,
    showAdminActions: true,
    showAdminCommentComposer: true,
    actionsComponent: AdminActions,
  },
  'snr-admin': {
    showCommitteeTagging: true,
    showAdminActions: true,
    showAdminCommentComposer: true,
    actionsComponent: AdminActions,
  },
  superadmin: {
    showCommitteeTagging: false,
    showAdminActions: true,
    showAdminCommentComposer: true,
    actionsComponent: AdminActions,
  },
  committee: {
    showCommitteeTagging: false,
    showAdminActions: false,
    showAdminCommentComposer: true,
    actionsComponent: null,
  },
};

// Icon map for timeline
const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  Calendar,
  CheckCircle2,
  Clock,
  AlertCircle,
  RotateCw,
  MessageSquare,
  Sparkles,
  AlertTriangle,
};

export function TicketDetailPage({
  adminType,
  ticketId,
  ticket,
  metadata,
  timelineEntries,
  resolvedProfileFields,
  dynamicFields,
  images,
  comments,
  tatInfo,
  normalizedStatus,
  ticketProgress,
  statusDisplay,
  category,
  subcategory,
  assignedStaff,
  hasTAT,
  isSuperAdmin = false,
  currentAssignedTo = null,
  forwardTargets = [],
  tatExtensionCount = 0,
  escalationLevel = 0,
  onStatusChanged,
}: TicketDetailPageProps) {
  const config = ADMIN_CONFIGS[adminType];
  const ActionsComponent = config.actionsComponent;

  const tatDateRaw = ticket.due_at || (metadata?.tatDate ? new Date(metadata.tatDate) : null);
  const isTatPaused = normalizedStatus === "awaiting_student_response" && !!metadata?.tatPausedAt;
  const remainingTatHours = metadata?.tatRemainingHours ? Number(metadata.tatRemainingHours) : null;
  const now = new Date();

  let tatDate = tatDateRaw;
  if (isTatPaused && remainingTatHours && Number.isFinite(remainingTatHours)) {
    tatDate = addBusinessHours(now, remainingTatHours);
  }

  const hasTATDue = tatDate && tatDate.getTime() < now.getTime() && !isTatPaused;
  const isTATToday = tatDate && tatDate.toDateString() === now.toDateString() && !isTatPaused;

  // Filter dynamic fields to exclude TAT-related and profile fields
  const filteredDynamicFields = dynamicFields.filter((field) => {
    const keyLower = field.key.toLowerCase();
    const labelLower = field.label.toLowerCase();
    return !keyLower.includes('tat') &&
      !labelLower.includes('tat') &&
      !keyLower.includes('tat_set') &&
      !labelLower.includes('tat set') &&
      !keyLower.includes('tat_extensions') &&
      !labelLower.includes('tat extensions');
  });

  // Get status object
  const statusObj = typeof statusDisplay === 'object' ? statusDisplay : {
    value: statusDisplay,
    label: statusDisplay,
    badge_color: null,
  };

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-6">
      <Link href={`/${adminType}/dashboard`}>
        <Button variant="ghost" className="mb-4">
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Tickets
        </Button>
      </Link>

      {/* Header Card */}
      <Card className="border-2">
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <CardTitle className="text-3xl font-bold mb-2">Ticket #{ticket.id}</CardTitle>
              {subcategory && (
                <p className="text-muted-foreground">{subcategory}</p>
              )}
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <TicketStatusBadge status={statusObj} />
              {escalationLevel > 0 && (
                <Badge variant="destructive" className="text-sm px-3 py-1">
                  <AlertTriangle className="w-3 h-3 mr-1" />
                  Escalated × {escalationLevel}
                </Badge>
              )}
              {category && (
                <Badge variant="outline" className="text-sm px-3 py-1">{category}</Badge>
              )}
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Progress and Quick Info */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="border-2 bg-gradient-to-br from-blue-50/50 to-blue-100/30 dark:from-blue-950/20 dark:to-blue-900/10">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                <span className="text-sm font-medium text-muted-foreground">Progress</span>
              </div>
              <span className="text-lg font-bold text-blue-600 dark:text-blue-400">{ticketProgress}%</span>
            </div>
            <Progress value={ticketProgress} className="h-2" />
          </CardContent>
        </Card>
        <Card className="border-2 bg-gradient-to-br from-purple-50/50 to-purple-100/30 dark:from-purple-950/20 dark:to-purple-900/10">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <User className="w-4 h-4 text-purple-600 dark:text-purple-400" />
              <span className="text-sm font-medium text-muted-foreground">Assigned To</span>
            </div>
            <p className="text-base font-semibold break-words">
              {typeof assignedStaff === 'string' 
                ? (assignedStaff !== 'Unassigned' ? assignedStaff : 'Unassigned')
                : (assignedStaff ? assignedStaff.name : 'Unassigned')}
            </p>
          </CardContent>
        </Card>
        <Card className="border-2 bg-gradient-to-br from-green-50/50 to-green-100/30 dark:from-green-950/20 dark:to-green-900/10">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <Clock className="w-4 h-4 text-green-600 dark:text-green-400" />
              <span className="text-sm font-medium text-muted-foreground">Expected Resolution</span>
            </div>
            {tatDate ? (
              <p className="text-sm font-semibold break-words">
                {hasTATDue ? (
                  <span className="text-red-600 dark:text-red-400">Overdue</span>
                ) : (
                  formatTimelineDate(tatDate)
                )}
              </p>
            ) : (
              <p className="text-sm font-semibold break-words">Not set</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* TAT Alert */}
      {(hasTATDue || isTATToday) && (
        <Card className={`border-2 ${hasTATDue ? 'border-red-200 dark:border-red-900 bg-red-50/50 dark:bg-red-950/20' : 'border-amber-200 dark:border-amber-900 bg-amber-50/50 dark:bg-amber-950/20'}`}>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <AlertTriangle className={`w-5 h-5 ${hasTATDue ? 'text-red-600 dark:text-red-400' : 'text-amber-600 dark:text-amber-400'}`} />
              <div>
                <p className={`font-semibold ${hasTATDue ? 'text-red-700 dark:text-red-300' : 'text-amber-700 dark:text-amber-300'}`}>
                  {hasTATDue ? 'TAT Overdue' : 'TAT Due Today'}
                </p>
                {tatDate && (
                  <p className="text-sm text-muted-foreground">
                    Target resolution date: {formatTimelineDate(tatDate)}
                  </p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Ticket Details */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {/* Submitted Information */}
          <Card className="border-2 shadow-md">
            <CardHeader className="pb-3 bg-gradient-to-r from-muted/30 to-transparent">
              <CardTitle className="flex items-center gap-2 text-xl">
                <div className="p-1.5 rounded-lg bg-primary/10">
                  <FileText className="w-5 h-5 text-primary" />
                </div>
                Submitted Information
              </CardTitle>
              <CardDescription>
                Details you provided when creating this ticket
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 pt-6">
              {/* Description */}
              {ticket.description && (
                <div className="p-4 rounded-lg bg-gradient-to-br from-muted/50 to-muted/30 border-2">
                  <div className="flex items-center gap-2 mb-3">
                    <Info className="w-4 h-4 text-muted-foreground" />
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Description</p>
                  </div>
                  <p className="text-base whitespace-pre-wrap leading-relaxed break-words font-medium">{ticket.description}</p>
                </div>
              )}

              {/* Location */}
              {ticket.location && (
                <div className="p-4 rounded-lg bg-muted/50 border">
                  <div className="flex items-center gap-2 mb-2">
                    <MapPin className="w-4 h-4 text-muted-foreground" />
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Location</p>
                  </div>
                  <p className="text-sm font-semibold break-words">{ticket.location}</p>
                </div>
              )}

              {/* Attachments */}
              {images.length > 0 && (
                <div className="p-4 rounded-lg bg-muted/50 border">
                  <div className="flex items-center gap-2 mb-3">
                    <ImageIcon className="w-4 h-4 text-muted-foreground" />
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Attachments ({images.length})</p>
                  </div>
                  <ImageLightbox images={images} />
                </div>
              )}

              {/* Profile Fields */}
              {resolvedProfileFields.length > 0 && (
                <div className="space-y-3">
                  {resolvedProfileFields.map((field, index) => (
                    <div key={index} className="p-4 rounded-lg bg-muted/50 border">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-sm">📝</span>
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                          {field.field_name}
                        </p>
                      </div>
                      <p className="text-sm font-semibold break-words">
                        {field.field_value || "Not provided"}
                      </p>
                    </div>
                  ))}
                </div>
              )}

              {/* Additional Dynamic Fields */}
              {filteredDynamicFields.length > 0 && (
                <div className="space-y-3">
                  {filteredDynamicFields.map((field) => (
                    <DynamicFieldDisplay key={field.key} field={field} />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Timeline Section */}
          <Card className="border-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="w-5 h-5" />
                Timeline
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="relative">
                {timelineEntries.length > 1 && (
                  <div className="absolute left-5 top-8 bottom-8 w-0.5 bg-border" />
                )}
                <div className="space-y-4 relative">
                  {timelineEntries.map((entry: any, index: number) => {
                    const iconKey = typeof entry.icon === 'string' ? entry.icon : '';
                    const IconComponent = ICON_MAP[iconKey] ?? AlertCircle;
                    const title = typeof entry.title === 'string' ? entry.title : '';
                    const color = typeof entry.color === 'string' ? entry.color : '';
                    const textColor = typeof entry.textColor === 'string' ? entry.textColor : '';
                    const entryDate = entry.date instanceof Date ? entry.date : (entry.date ? new Date(entry.date) : null);
                    return (
                      <div key={index} className="flex items-start gap-4 relative">
                        <div className={`relative z-10 p-2.5 rounded-full flex-shrink-0 border-2 bg-background ${color}`}>
                          <IconComponent className={`w-4 h-4 ${textColor}`} />
                        </div>
                        <div className="flex-1 min-w-0 pb-4">
                          <div className="p-3 rounded-lg bg-muted/50 border">
                            <p className={`text-sm font-semibold mb-1.5 break-words ${textColor}`}>{title}</p>
                            {entry.description && (
                              <p className="text-xs text-muted-foreground mb-2 break-words">{entry.description}</p>
                            )}
                            {entryDate && (
                              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                <Calendar className="w-3.5 h-3.5" />
                                <span>{formatTimelineDate(entryDate)}</span>
                                <span>•</span>
                                <span>{formatTimelineTime(entryDate)}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Comments Section */}
          <Card className="border-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MessageSquare className="w-5 h-5" />
                Comments
                {comments.length > 0 && (
                  <Badge variant="secondary" className="ml-2">
                    {comments.length}
                  </Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-6 space-y-6">
              {comments.length > 0 ? (
                <ScrollArea className="h-[500px] w-full pr-4">
                  <div className="space-y-4 pb-4">
                    {comments.map((comment: any, idx: number) => {
                      if (!comment || typeof comment !== 'object') return null;
                      const isInternal = comment.isInternal || comment.type === "internal_note" || comment.type === "super_admin_note";
                      const commentText = (typeof comment.text === 'string' ? comment.text : typeof comment.message === 'string' ? comment.message : '') || '';
                      const commentAuthor = (typeof comment.author === 'string' ? comment.author : typeof comment.created_by === 'string' ? comment.created_by : 'Unknown') || 'Unknown';
                      const commentSource = typeof comment.source === 'string' ? comment.source : null;
                      const rawTimestamp = comment.createdAt || comment.created_at;
                      const commentCreatedAt = rawTimestamp &&
                        (typeof rawTimestamp === 'string' || rawTimestamp instanceof Date)
                        ? rawTimestamp : null;

                      // For internal notes, keep card style
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
              ) : (
                <div className="text-center py-12 text-muted-foreground">
                  <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-muted flex items-center justify-center">
                    <MessageSquare className="w-8 h-8 opacity-50" />
                  </div>
                  <p className="text-sm font-medium mb-1">No comments yet</p>
                  <p className="text-xs">Updates and responses will appear here</p>
                </div>
              )}

              <Separator />

              {config.showAdminCommentComposer && (
                <AdminCommentComposer ticketId={ticketId} />
              )}
            </CardContent>
          </Card>

          {/* Admin Actions */}
          {config.showAdminActions && ActionsComponent && (
            <Card className="border-2">
              <CardHeader>
                <CardTitle>Actions</CardTitle>
              </CardHeader>
              <CardContent>
                <ActionsComponent
                  ticketId={ticketId}
                  currentStatus={normalizedStatus}
                  hasTAT={hasTAT}
                  isSuperAdmin={isSuperAdmin}
                  currentAssignedTo={currentAssignedTo}
                  forwardTargets={forwardTargets}
                  tatExtensionCount={tatExtensionCount}
                  onStatusChanged={onStatusChanged}
                />
              </CardContent>
            </Card>
          )}

          {/* Committee Tagging */}
          {config.showCommitteeTagging && (
            <Card className="border-2">
              <CardHeader>
                <CardTitle>Committee Tagging</CardTitle>
              </CardHeader>
              <CardContent>
                <CommitteeTagging ticketId={ticketId} />
              </CardContent>
            </Card>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Ticket Information */}
          <Card className="border-2">
            <CardHeader>
              <CardTitle>Ticket Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {ticket.creator_name && (
                <div>
                  <label className="text-sm font-medium text-muted-foreground flex items-center gap-2 mb-1">
                    <User className="w-4 h-4" />
                    Created By
                  </label>
                  <p className="text-base font-medium">{ticket.creator_name || ticket.creator_email || "Unknown"}</p>
                  {ticket.creator_email && (
                    <p className="text-xs text-muted-foreground mt-1">{ticket.creator_email}</p>
                  )}
                </div>
              )}
              {ticket.location && (
                <>
                  <Separator />
                  <div>
                    <label className="text-sm font-medium text-muted-foreground flex items-center gap-2 mb-1">
                      <MapPin className="w-4 h-4" />
                      Location
                    </label>
                    <p className="text-base font-medium">{ticket.location}</p>
                  </div>
                </>
              )}
              {ticket.created_at && (
                <>
                  <Separator />
                  <div>
                    <label className="text-sm font-medium text-muted-foreground flex items-center gap-2 mb-1">
                      <Calendar className="w-4 h-4" />
                      Created
                    </label>
                    <p className="text-base font-medium">
                      {formatTimelineDate(ticket.created_at)}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {formatTimelineTime(ticket.created_at)}
                    </p>
                  </div>
                </>
              )}
              {tatDate && (
                <>
                  <Separator />
                  <div>
                    <label className="text-sm font-medium text-muted-foreground flex items-center gap-2 mb-1">
                      <Clock className="w-4 h-4" />
                      TAT Due Date
                    </label>
                    <p className="text-base font-medium">{formatTimelineDate(tatDate)}</p>
                    {hasTATDue && (
                      <p className="text-xs text-red-600 dark:text-red-400 mt-1 font-medium">
                        Overdue
                      </p>
                    )}
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* Student Information */}
          {resolvedProfileFields.length > 0 && (
            <Card className="border-2">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <User className="w-5 h-5" />
                  Student Information
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {resolvedProfileFields.map((field) => (
                    <div key={field.field_name} className="p-3 rounded-lg bg-muted/50 border">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5">
                        {field.field_name}
                      </p>
                      <p className="text-sm font-semibold break-words">{field.field_value || "Not provided"}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
