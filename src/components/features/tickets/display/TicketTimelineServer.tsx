/**
 * Ticket Timeline Server Component
 * 
 * Server component for rendering ticket timeline.
 * No client-side JavaScript needed - pure HTML rendering.
 */

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CalendarCheck, Calendar, CheckCircle2, Clock, AlertCircle, RotateCw, MessageSquare, Sparkles, AlertTriangle } from "lucide-react";
import { formatTimelineDate, formatTimelineTime } from "@/lib/utils/date-format";
import type { TimelineEntry } from "@/lib/ticket/formatting/buildTimeline";

interface TicketTimelineServerProps {
  entries: TimelineEntry[];
}

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

export function TicketTimelineServer({ entries }: TicketTimelineServerProps) {
  if (!entries || entries.length === 0) {
    return (
      <Card className="border-2">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <div className="p-1.5 rounded-lg bg-primary/10">
              <CalendarCheck className="w-4 h-4 text-primary" />
            </div>
            Timeline
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">
            <p className="text-sm">No timeline entries yet</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-2">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <div className="p-1.5 rounded-lg bg-primary/10">
            <CalendarCheck className="w-4 h-4 text-primary" />
          </div>
          Timeline
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="relative">
          {entries.length > 1 && (
            <div className="absolute left-5 top-8 bottom-8 w-0.5 bg-border" />
          )}
          <div className="space-y-4 relative">
            {entries.map((entry, idx) => {
              const IconComponent = entry.icon && ICON_MAP[entry.icon]
                ? ICON_MAP[entry.icon]
                : Calendar;

              return (
                <div key={idx} className="flex items-start gap-4 relative">
                  <div className={`relative z-10 p-2.5 rounded-full flex-shrink-0 border-2 bg-background ${entry.color}`}>
                    <IconComponent className={`w-4 h-4 ${entry.textColor}`} />
                  </div>
                  <div className="flex-1 min-w-0 pb-4">
                    <div className="p-3 rounded-lg bg-muted/50 border">
                      <p className={`text-sm font-semibold mb-1.5 break-words ${entry.textColor}`}>{entry.title}</p>
                      {entry.description && (
                        <p className="text-xs text-muted-foreground mb-2 break-words">{entry.description}</p>
                      )}
                      {entry.date && (
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <Calendar className="w-3.5 h-3.5" />
                          <span>{formatTimelineDate(entry.date)}</span>
                          <span>•</span>
                          <span>{formatTimelineTime(entry.date)}</span>
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
  );
}

