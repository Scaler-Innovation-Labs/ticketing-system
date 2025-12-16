/**
 * Calculate Filtered Stats
 * 
 * Calculate statistics for the CURRENT FILTERED VIEW only.
 * Use globalStats from fetchDashboardTickets for overall stats.
 */

import type { DashboardTicketRow, DashboardStats } from './types';
import { normalizeStatusForComparison } from '@/lib/utils';

/**
 * Calculate filtered stats from ticket rows
 * This is for the CURRENT FILTERED VIEW only
 * Use globalStats from fetchDashboardTickets for overall stats
 */
export function calculateFilteredStats(rows: DashboardTicketRow[]): DashboardStats['filtered'] {
  return {
    total: rows.length,
    open: rows.filter((t) => {
      const normalized = normalizeStatusForComparison(t.status);
      return normalized === "open";
    }).length,
    inProgress: rows.filter((t) => {
      const normalized = normalizeStatusForComparison(t.status);
      return normalized === "in_progress" || normalized === "escalated";
    }).length,
    awaitingStudent: rows.filter((t) => {
      const normalized = normalizeStatusForComparison(t.status);
      return normalized === "awaiting_student_response";
    }).length,
    resolved: rows.filter((t) => {
      const normalized = normalizeStatusForComparison(t.status);
      return normalized === "resolved" || normalized === "closed";
    }).length,
    escalated: rows.filter((t) => (t.escalation_level || 0) > 0).length,
  };
}


