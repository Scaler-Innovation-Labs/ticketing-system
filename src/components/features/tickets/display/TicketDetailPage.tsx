import { Suspense } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Calendar, ArrowLeft, User, MapPin, FileText, Clock, AlertTriangle, Image as ImageIcon, Info } from "lucide-react";
import { AdminActions } from "@/components/features/tickets/actions/AdminActions";
import { CommitteeTagging } from "@/components/admin/committees";
import { AdminCommentComposer } from "@/components/features/tickets/actions/AdminCommentComposer";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import { TicketStatusBadge } from "@/components/features/tickets/display/TicketStatusBadge";
import { DynamicFieldDisplay } from "@/components/features/tickets/display/DynamicFieldDisplay";
import { addBusinessHours } from "@/lib/ticket/utils/tat-calculator";
import type { TicketMetadata } from "@/db/inferred-types";
import { LazyImageLightbox } from "@/components/features/tickets/display/LazyImageLightbox";
import { TicketTimelineServer } from "@/components/features/tickets/display/TicketTimelineServer";
import { TicketCommentsWithComposer } from "@/components/features/tickets/display/TicketCommentsWithComposer";
import { TicketCommentsServer } from "@/components/features/tickets/display/TicketCommentsServer";
import { formatTimelineDate, formatTimelineTime } from "@/lib/utils/date-format";
import { Skeleton } from "@/components/ui/skeleton";

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
  currentUserName?: string | null; // Current admin's name for optimistic comments
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

import { MessageSquare } from "lucide-react";

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
  currentUserName,
  onStatusChanged,
}: TicketDetailPageProps) {
  const config = ADMIN_CONFIGS[adminType];
  const ActionsComponent = config.actionsComponent;

  // Ensure tatDateRaw is always a Date object or null
  // ticket.due_at might be a string from the database, so we need to convert it
  let tatDateRaw: Date | null = null;
  if (ticket.due_at) {
    if (ticket.due_at instanceof Date) {
      tatDateRaw = ticket.due_at;
    } else if (typeof ticket.due_at === 'string') {
      const parsed = new Date(ticket.due_at);
      tatDateRaw = !isNaN(parsed.getTime()) ? parsed : null;
    }
  } else if (metadata?.tatDate) {
    const parsed = typeof metadata.tatDate === 'string' ? new Date(metadata.tatDate) : null;
    tatDateRaw = parsed && !isNaN(parsed.getTime()) ? parsed : null;
  }

  const isTatPaused = normalizedStatus === "awaiting_student_response" && !!metadata?.tatPausedAt;
  const remainingTatHours = metadata?.tatRemainingHours ? Number(metadata.tatRemainingHours) : null;
  const now = new Date();

  let tatDate: Date | null = tatDateRaw;
  if (isTatPaused && remainingTatHours && Number.isFinite(remainingTatHours) && tatDateRaw) {
    tatDate = addBusinessHours(now, remainingTatHours);
  }

  const hasTATDue = tatDate && tatDate instanceof Date && tatDate.getTime() < now.getTime() && !isTatPaused;
  const isTATToday = tatDate && tatDate instanceof Date && tatDate.toDateString() === now.toDateString() && !isTatPaused;

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

              {/* Attachments - Lazy-loaded */}
              {images.length > 0 && (
                <div className="p-4 rounded-lg bg-muted/50 border">
                  <div className="flex items-center gap-2 mb-3">
                    <ImageIcon className="w-4 h-4 text-muted-foreground" />
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Attachments ({images.length})</p>
                  </div>
                  <LazyImageLightbox images={images} />
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

          {/* Timeline Section - Server Component */}
          <Suspense fallback={
            <Card className="border-2">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Calendar className="w-5 h-5" />
                  Timeline
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {[1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-20 w-full" />
                  ))}
                </div>
              </CardContent>
            </Card>
          }>
            <TicketTimelineServer entries={timelineEntries} />
          </Suspense>

          {/* Comments Section - Hybrid (Server-rendered + Client state) */}
          {config.showAdminCommentComposer ? (
            <TicketCommentsWithComposer
              initialComments={comments}
              ticketId={ticketId}
              currentUserName={currentUserName || undefined}
              onStatusChanged={onStatusChanged}
            />
          ) : (
            <Suspense fallback={
              <Card className="border-2">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <MessageSquare className="w-5 h-5" />
                    Comments
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {[1, 2, 3].map((i) => (
                      <Skeleton key={i} className="h-24 w-full" />
                    ))}
                  </div>
                </CardContent>
              </Card>
            }>
              <TicketCommentsServer comments={comments} />
            </Suspense>
          )}

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
