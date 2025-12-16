/**
 * Admin Role Policy
 * 
 * Defines ticket visibility and assignment logic for admin role.
 * 
 * 3-Tier Priority System:
 * 1. Tickets explicitly assigned to this admin (via assigned_to)
 * 2. Tickets in domains from categories this admin is assigned to
 * 3. Unassigned tickets matching admin's domain/scope
 */

import { eq, isNull, or, and, sql } from "drizzle-orm";
import { tickets, categories } from "@/db";
import type { RolePolicy } from "../core/types";
import { getAdminAssignedCategoryDomains } from "@/lib/assignment/admin-assignment";

export const adminPolicy: RolePolicy = {
  roleName: 'admin',
  
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
      'location',
      'scope',
      'tat',
      'sort',
      'page',
    ];
  },
  
  async buildBaseCondition(
    dbUser: { id: string; roleName: string | null; primary_domain_id: number | null } | null,
    context?: { adminAssignment?: any }
  ) {
    if (!dbUser) {
      return sql`false`; // No user = no tickets
    }
    
    const adminUserId = dbUser.id;
    const adminAssignment = context?.adminAssignment;
    
    // Get assigned category domains for this admin
    const assignedCategoryDomains = await getAdminAssignedCategoryDomains(adminUserId);
    
    // Build 3-tier priority condition
    const conditions: any[] = [];
    
    // Priority 1: Tickets explicitly assigned to this admin
    // If admin has scope, also filter by scope match (handled in filter conditions)
    conditions.push(eq(tickets.assigned_to, adminUserId));
    
    // Priority 2: Tickets in domains from categories admin is assigned to
    if (assignedCategoryDomains.length > 0) {
      // Match categories assigned to admin via category_assignments
      conditions.push(
        and(
          sql`${tickets.category_id} IN (
            SELECT category_id FROM category_assignments 
            WHERE user_id = ${adminUserId}
          )`,
          // For escalated tickets, show them even if assigned to someone else
          or(
            isNull(tickets.assigned_to),
            eq(tickets.assigned_to, adminUserId),
            sql`${tickets.escalation_level} > 0`
          )
        )
      );
    }
    
    // Priority 3: Unassigned tickets matching admin's domain/scope
    // This requires checking category domain and scope - handled via category matching above
    // Scope filtering is applied separately in filter conditions
    
    return or(...conditions);
  },
};

