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
  subcategory_name?: string | null;
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
      // Handle metadata structure - it might be nested with 'details' and 'profile' or flat
      const rawMeta = t.metadata && typeof t.metadata === "object" ? t.metadata : {};
      const metaDetails = (rawMeta as any)?.details || {};
      const metaProfile = (rawMeta as any)?.profile || {};

      // Merge details and profile into a flat structure for easier access
      const meta = {
        ...rawMeta,
        ...metaDetails,
        ...metaProfile,
      };

      // System keys to exclude from form details
      const systemKeys = [
        "acknowledged_at",
        "resolved_at",
        "reopened_at",
        "rating",
        "feedback",
        "attachments",
        "images",
        "details", // Exclude nested details object
        "profile", // Exclude nested profile object
        "previous_assigned_to", // System field for escalation tracking
      ];

      // Student profile fields to exclude (they're shown in separate columns)
      const studentProfileKeys = [
        "name",
        "email",
        "hostel",
        "Hostel",
        "hostel_name",
        "roomNumber",
        "room",
        "room_number",
        "batchYear",
        "batch",
        "batch_year",
        "classSection",
        "section",
        "class_section",
      ];

      // Build form details: include subcategory name first, then all dynamic fields 
      // (excluding system keys and student profile fields)
      const metaEntries = Object.entries(meta || {}).filter(
        ([k, v]) => 
          !systemKeys.includes(k) && 
          !studentProfileKeys.includes(k) && 
          v != null && 
          v !== ""
      );
      const formDetailsFromMeta = metaEntries.map(([k, v]) => {
        const value = typeof v === "string" ? v : String(v);
        return `${k}: ${value}`;
      });
      const formDetails = [
        ...(t.subcategory_name ? [`Subcategory: ${t.subcategory_name}`] : []),
        ...formDetailsFromMeta,
      ];

      // Extract student fields from multiple possible locations
      const studentName = 
        meta?.name || 
        meta?.Name ||
        metaProfile?.name ||
        t.creator_full_name ||
        "-";
      const studentEmail = 
        meta?.email || 
        meta?.Email ||
        metaProfile?.email ||
        t.creator_email ||
        "-";
      const studentHostel = 
        meta?.hostel || 
        meta?.Hostel || 
        meta?.hostel_name || 
        metaProfile?.hostel ||
        "-";
      const studentRoom = 
        meta?.roomNumber || 
        meta?.room || 
        meta?.room_number ||
        metaProfile?.roomNumber ||
        "-";
      const studentBatch = 
        meta?.batchYear || 
        meta?.batch || 
        meta?.batch_year ||
        metaProfile?.batchYear ||
        (metaProfile?.batchYear ? String(metaProfile.batchYear) : null) ||
        "-";
      const studentClass = 
        meta?.classSection || 
        meta?.section || 
        meta?.class_section ||
        metaProfile?.classSection ||
        "-";

      // Build profile details array
      const profileDetails: string[] = [];
      if (studentName !== "-") profileDetails.push(`Name: ${studentName}`);
      if (studentEmail !== "-") profileDetails.push(`Email: ${studentEmail}`);
      if (studentHostel !== "-") profileDetails.push(`Hostel: ${studentHostel}`);
      if (studentRoom !== "-") profileDetails.push(`Room: ${studentRoom}`);
      if (studentBatch !== "-") profileDetails.push(`Batch: ${studentBatch}`);
      if (studentClass !== "-") profileDetails.push(`Class: ${studentClass}`);
      if (t.location) profileDetails.push(`Location: ${t.location}`);

      return {
        ...t,
        formDetails,
        profileDetails,
        studentHostel: studentHostel !== "-" ? studentHostel : "-",
        studentRoom: studentRoom !== "-" ? studentRoom : "-",
        studentBatch: studentBatch !== "-" ? studentBatch : "-",
        studentClass: studentClass !== "-" ? studentClass : "-",
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
            <th className="px-4 py-2 font-semibold">Description</th>
            <th className="px-4 py-2 font-semibold">Profile Details</th>
            <th className="px-4 py-2 font-semibold">Created</th>
            <th className="px-4 py-2 font-semibold">TAT Due</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={8} className="px-4 py-6 text-center text-muted-foreground">
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
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Badge className={cn("text-xs", statusColor)}>{statusLabel}</Badge>
                      {escalation && <Badge variant="destructive">Escalated</Badge>}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-sm font-medium">
                      {t.category_name && t.category_name !== "0" ? t.category_name : "-"}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-xs text-muted-foreground space-y-1">
                      {t.formDetails?.length
                        ? t.formDetails.map((line, idx) => <div key={idx}>{line}</div>)
                        : "—"}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-sm text-foreground">{t.title || "Untitled"}</div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-xs text-muted-foreground space-y-1">
                      {t.profileDetails && t.profileDetails.length > 0
                        ? t.profileDetails.map((detail, idx) => <div key={idx}>{detail}</div>)
                        : "—"}
                    </div>
                  </td>
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

