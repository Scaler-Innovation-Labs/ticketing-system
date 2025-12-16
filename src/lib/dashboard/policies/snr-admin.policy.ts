/**
 * Senior Admin Role Policy
 * 
 * Defines ticket visibility for snr-admin role.
 * Snr-admin can see:
 * - Tickets assigned to them
 * - Unassigned tickets in their domain
 */

import { eq, isNull, or, and, sql } from "drizzle-orm";
import { tickets, categories } from "@/db";
import type { RolePolicy } from "../core/types";

export const snrAdminPolicy: RolePolicy = {
  roleName: 'snr-admin',
  
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
    if (!dbUser || !dbUser.primary_domain_id) {
      // If no domain, show only assigned tickets
      return dbUser ? eq(tickets.assigned_to, dbUser.id) : sql`false`;
    }
    
    // Snr-admin with domain: assigned to them OR unassigned in their domain
    return or(
      eq(tickets.assigned_to, dbUser.id),
      and(
        isNull(tickets.assigned_to),
        sql`${tickets.category_id} IN (
          SELECT id FROM ${categories} 
          WHERE ${categories.domain_id} = ${dbUser.primary_domain_id}
        )`
      )
    );
  },
};


