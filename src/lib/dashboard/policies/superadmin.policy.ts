/**
 * Super Admin Role Policy
 * 
 * Defines ticket visibility for superadmin role.
 * Superadmin can see ALL tickets (unassigned OR assigned OR escalated).
 */

import { eq, isNull, or, sql } from "drizzle-orm";
import { tickets } from "@/db";
import type { RolePolicy } from "../core/types";

export const superadminPolicy: RolePolicy = {
  roleName: 'superadmin',
  
  getAllowedFilters(): string[] {
    return [
      'search',
      'status',
      'escalated',
      'from',
      'to',
      'user',
      'category',
      'subcategory',
      'tat',
      'sort',
      'page',
    ];
  },
  
  buildBaseCondition(dbUser: { id: string; roleName: string | null; primary_domain_id: number | null } | null) {
    // Superadmin can see ALL tickets
    // Show: unassigned OR assigned OR escalated
    return or(
      isNull(tickets.assigned_to),
      dbUser ? eq(tickets.assigned_to, dbUser.id) : sql`false`,
      sql`${tickets.escalation_level} > 0`
    );
  },
};


