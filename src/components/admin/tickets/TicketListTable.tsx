"use client";

import { useMemo } from "react";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type TicketLike = {
  id: number;
  title: string | null;
  status?: string | null;
  category_name?: string | null;
  subcategory_id?: number | null;
  location?: string | null;
  created_at?: Date | string | null;
  resolution_due_at?: Date | string | null;
  escalation_level?: number | null;
  creator_full_name?: string | null;
  creator_email?: string | null;
  metadata?: any;
};

interface TicketListTableProps {
  tickets: TicketLike[];
  basePath: string;
}

const formatDate = (d?: Date | string | null) => {
  if (!d) return "-";
  const date = typeof d === "string" ? new Date(d) : d;
  if (isNaN(date.getTime())) return "-";
  return format(date, "MMM d, yyyy");
};

export function TicketListTable({ tickets, basePath }: TicketListTableProps) {
  const rows = useMemo(() => {
    return (tickets || []).map((t) => {
      const meta = t.metadata && typeof t.metadata === "object" ? t.metadata : {};
      // Pick up to 2 dynamic fields from metadata (excluding system keys)
      const metaEntries = Object.entries(meta || {}).filter(
        ([k]) =>
          ![
            "acknowledged_at",
            "resolved_at",
            "reopened_at",
            "rating",
            "feedback",
            "attachments",
            "images",
          ].includes(k)
      );
      const formDetails = metaEntries.slice(0, 2).map(([k, v]) => `${k}: ${v as string}`);

      const studentHostel = meta?.hostel || meta?.Hostel || meta?.hostel_name || "-";
      const studentRoom = meta?.roomNumber || meta?.room || "-";
      const studentBatch = meta?.batchYear || meta?.batch || "-";
      const studentClass = meta?.classSection || meta?.section || "-";

      return {
        ...t,
        formDetails,
        studentHostel,
        studentRoom,
        studentBatch,
        studentClass,
      };
    });
  }, [tickets]);

  return (
    <div className="overflow-x-auto border rounded-lg bg-card">
      <table className="w-full text-sm">
        <thead className="bg-muted/40">
          <tr className="text-left">
            <th className="px-4 py-2 font-semibold">Ticket</th>
            <th className="px-4 py-2 font-semibold">Status</th>
            <th className="px-4 py-2 font-semibold">Category</th>
            <th className="px-4 py-2 font-semibold">Form Details</th>
            <th className="px-4 py-2 font-semibold">Student</th>
            <th className="px-4 py-2 font-semibold">Hostel</th>
            <th className="px-4 py-2 font-semibold">Room</th>
            <th className="px-4 py-2 font-semibold">Batch</th>
            <th className="px-4 py-2 font-semibold">Class</th>
            <th className="px-4 py-2 font-semibold">Location</th>
            <th className="px-4 py-2 font-semibold">Created</th>
            <th className="px-4 py-2 font-semibold">TAT Due</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={12} className="px-4 py-6 text-center text-muted-foreground">
                No tickets found.
              </td>
            </tr>
          ) : (
            rows.map((t) => {
              const statusLabel = t.status || "Unknown";
              const statusColor =
                (t.status || "").toLowerCase() === "resolved"
                  ? "bg-green-100 text-green-700"
                  : (t.status || "").toLowerCase() === "open"
                  ? "bg-amber-100 text-amber-700"
                  : "bg-muted text-foreground";
              const tat = t.resolution_due_at ? formatDate(t.resolution_due_at) : "-";
              const escalation = t.escalation_level && t.escalation_level > 0;
              return (
                <tr key={t.id} className="border-t hover:bg-muted/30">
                  <td className="px-4 py-3">
                    <div className="font-semibold text-primary">
                      <a href={`${basePath}/ticket/${t.id}`}>#{t.id}</a>
                    </div>
                    <div className="text-sm text-foreground">{t.title || "Untitled"}</div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Badge className={cn("text-xs", statusColor)}>{statusLabel}</Badge>
                      {escalation && <Badge variant="destructive">Escalated</Badge>}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-sm font-medium">{t.category_name || "-"}</div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-xs text-muted-foreground space-y-1">
                      {t.formDetails?.length
                        ? t.formDetails.map((line, idx) => <div key={idx}>{line}</div>)
                        : "—"}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-sm font-medium">{t.creator_full_name || "Unknown"}</div>
                    <div className="text-xs text-muted-foreground">{t.creator_email || "—"}</div>
                  </td>
                  <td className="px-4 py-3 text-sm">{t.studentHostel || "—"}</td>
                  <td className="px-4 py-3 text-sm">{t.studentRoom || "—"}</td>
                  <td className="px-4 py-3 text-sm">{t.studentBatch || "—"}</td>
                  <td className="px-4 py-3 text-sm">{t.studentClass || "—"}</td>
                  <td className="px-4 py-3 text-sm">{t.location || "—"}</td>
                  <td className="px-4 py-3 text-sm">{formatDate(t.created_at)}</td>
                  <td className="px-4 py-3 text-sm">{tat}</td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}

