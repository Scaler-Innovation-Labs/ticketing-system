/**
 * Ticket Service
 * 
 * Business logic for ticket management
 */

import { db, tickets, ticket_activity, ticket_statuses, categories, subcategories, users, outbox, ticket_attachments, category_fields, domains, scopes, roles, admin_profiles, admin_assignments, students, category_assignments, type DbTransaction } from '@/db';
import { eq, and, desc, asc, gte, sql, or, isNull, inArray } from 'drizzle-orm';
import { LIMITS, TICKET_STATUS } from '@/conf/constants';
import { logger } from '@/lib/logger';
import { Errors } from '@/lib/errors';
import { withTransaction } from '@/lib/db-transaction';
import { validateTicketMetadata, getSubcategoryFields } from './category-fields-service';
import { resolveTicketScope } from './scope-service';
import type { CreateTicketInput } from '@/schemas/ticket';
import { findBestAssignee, hasMatchingAssignment } from '@/lib/assignment/assignment-service';

// Cache for status IDs
const statusIdCache = new Map<string, number>();

/**
 * Get status ID by value (with caching)
 */
export async function getStatusId(statusValue: string): Promise<number> {
  // Check cache
  if (statusIdCache.has(statusValue)) {
    return statusIdCache.get(statusValue)!;
  }

  // Query database
  const [status] = await db
    .select({ id: ticket_statuses.id })
    .from(ticket_statuses)
    .where(eq(ticket_statuses.value, statusValue))
    .limit(1);

  if (!status) {
    throw Errors.notFound('Status', statusValue);
  }

  // Cache it
  statusIdCache.set(statusValue, status.id);
  return status.id;
}

/**
 * Check if user has exceeded weekly ticket limit
 */
export async function checkTicketRateLimit(userId: string): Promise<void> {
  const oneWeekAgo = new Date();
  oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

  const recentTickets = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(tickets)
    .where(
      and(
        eq(tickets.created_by, userId),
        gte(tickets.created_at, oneWeekAgo)
      )
    );

  const count = recentTickets[0]?.count || 0;

  if (count >= LIMITS.WEEKLY_TICKET_LIMIT) {
    logger.warn({ userId, count }, 'User exceeded weekly ticket limit');
    throw Errors.weeklyLimitExceeded(0, new Date(oneWeekAgo.getTime() + 7 * 24 * 60 * 60 * 1000));
  }
}

/**
 * Validate category and subcategory
 * Returns category with all fields needed for ticket creation (including scope_mode, scope_id)
 */
export async function validateCategoryAndSubcategory(
  categoryId: number,
  subcategoryId?: number
): Promise<{ category: any; subcategory?: any }> {
  // Check category exists and is active - select all fields including scope fields
  const [category] = await db
    .select()
    .from(categories)
    .where(
      and(
        eq(categories.id, categoryId),
        eq(categories.is_active, true)
      )
    )
    .limit(1);

  if (!category) {
    throw Errors.notFound('Category', String(categoryId));
  }

  // If subcategory provided, validate it
  let subcategory;
  if (subcategoryId) {
    const [sub] = await db
      .select()
      .from(subcategories)
      .where(
        and(
          eq(subcategories.id, subcategoryId),
          eq(subcategories.category_id, categoryId),
          eq(subcategories.is_active, true)
        )
      )
      .limit(1);

    if (!sub) {
      throw Errors.validation(
        `Subcategory ${subcategoryId} does not belong to category ${categoryId}`
      );
    }

    subcategory = sub;
  }

  return { category, subcategory };
}

/**
 * Calculate SLA deadlines (excluding weekends)
 */
export function calculateDeadlines(slaHours: number) {
  const { calculateDeadlinesWithBusinessHours } = require('./utils/tat-calculator');
  return calculateDeadlinesWithBusinessHours(slaHours);
}

/**
 * Find field-level assignment from ticket metadata
 * Checks if any field in the ticket metadata has an assigned admin
 */
async function findFieldLevelAssignee(
  subcategoryId: number | null,
  metadata: Record<string, any> | null | undefined,
  txn?: DbTransaction
): Promise<string | null> {
  if (!subcategoryId || !metadata || typeof metadata !== 'object') {
    return null;
  }

  try {
    const dbInstance = txn || db;
    
    const fields = await dbInstance
      .select({ 
        id: category_fields.id,
        slug: category_fields.slug,
        assigned_admin_id: (category_fields as any).assigned_admin_id,
      })
      .from(category_fields)
      .where(
        and(
          eq(category_fields.subcategory_id, subcategoryId),
          eq(category_fields.is_active, true)
        )
      );

    for (const field of fields) {
      const fieldValue = metadata[field.slug];
      const assignedAdminId = (field as any).assigned_admin_id;
      
      if (fieldValue && assignedAdminId) {
        return assignedAdminId;
      }
    }

    return null;
  } catch (error: any) {
    if (error?.message?.includes('assigned_admin_id') || error?.message?.includes('column')) {
      return null;
    }
    logger.error({ error, subcategoryId }, 'Error finding field-level assignee');
    return null;
  }
}

/**
 * Find domain/scope-based assignment
 * Uses domain_id and scope_id from database tables
 * Checks both admin_profiles (primary) and admin_assignments (secondary)
 * Only assigns if exactly 1 admin matches; otherwise continues to next priority
 */
async function findDomainScopeAssignee(
  categoryDomainId: number | null,
  ticketScopeId: number | null,
  ticketLocation: string | null | undefined,
  categoryScopeMode: string | null | undefined,
  categoryScopeId: number | null | undefined,
  userId: string | null | undefined,
  categoryId: number | null | undefined
): Promise<string | null> {
  // Must have domain_id to proceed
  if (!categoryDomainId) {
    return null;
  }

  try {
    // Determine the scope to use:
    // Priority order:
    // 1. Student-submitted location (ticketLocation) - ALWAYS takes precedence over profile
    // 2. Pre-resolved ticketScopeId (from resolveTicketScope, which uses profile)
    // 3. If scope_mode is dynamic and no location provided, resolve from student profile
    // 4. Otherwise use null (no scope)
    let scopeId: number | null = null;
    
    // PRIORITY 1: Always check student-submitted location first (overrides profile)
    if (ticketLocation && categoryDomainId) {
      const [scope] = await db
        .select({ id: scopes.id })
        .from(scopes)
        .where(
          and(
            eq(scopes.domain_id, categoryDomainId),
            eq(scopes.name, ticketLocation)
          )
        )
        .limit(1);
      
      if (scope) {
        scopeId = scope.id;
      }
    }
    
    // PRIORITY 2: Use pre-resolved ticketScopeId (from profile) if no location was provided
    if (!scopeId && ticketScopeId) {
      scopeId = ticketScopeId;
    }
    
    // PRIORITY 3: Only fetch from student profile if location is NOT in ticket and userId is provided
    if (!scopeId && categoryScopeMode === 'dynamic' && userId && !ticketLocation) {
      if (categoryScopeId) {
        const [scopeConfig] = await db
          .select({ student_field_key: scopes.student_field_key })
          .from(scopes)
          .where(eq(scopes.id, categoryScopeId))
          .limit(1);
        
        if (scopeConfig?.student_field_key) {
          const [student] = await db
            .select({
              hostel_id: students.hostel_id,
              class_section_id: students.class_section_id,
              batch_id: students.batch_id,
            })
            .from(students)
            .where(eq(students.user_id, userId))
            .limit(1);
          
          if (student) {
            const fieldKey = scopeConfig.student_field_key;
            switch (fieldKey) {
              case 'hostel_id':
                scopeId = student.hostel_id;
                break;
              case 'class_section_id':
                scopeId = student.class_section_id;
                break;
              case 'batch_id':
                scopeId = student.batch_id;
                break;
            }
          }
        }
      }
      
      // If still no scope and category doesn't have scope_id, try to find any scope config in domain
      if (!scopeId && !categoryScopeId) {
        const domainScopes = await db
          .select({ id: scopes.id, student_field_key: scopes.student_field_key })
          .from(scopes)
          .where(
            and(
              eq(scopes.domain_id, categoryDomainId),
              sql`${scopes.student_field_key} IS NOT NULL`
            )
          );
        
        for (const scopeConfig of domainScopes) {
          if (!scopeConfig.student_field_key) continue;
          
          const [student] = await db
            .select({
              hostel_id: students.hostel_id,
              class_section_id: students.class_section_id,
              batch_id: students.batch_id,
            })
            .from(students)
            .where(eq(students.user_id, userId))
            .limit(1);
          
          if (!student) continue;
          
          let resolvedScopeId: number | null = null;
          switch (scopeConfig.student_field_key) {
            case 'hostel_id':
              resolvedScopeId = student.hostel_id;
              break;
            case 'class_section_id':
              resolvedScopeId = student.class_section_id;
              break;
            case 'batch_id':
              resolvedScopeId = student.batch_id;
              break;
          }
          
          if (resolvedScopeId === scopeConfig.id) {
            scopeId = scopeConfig.id;
            break;
          }
        }
      }
    }

    // If no scope, can't assign by domain/scope
    if (!scopeId) {
      return null;
    }

    // PRIORITY: Check category_assignments first, then admin_profiles
    // Step 1: Get admins assigned to this category
    if (categoryId) {
      const categoryAssignedAdmins = await db
        .select({ user_id: category_assignments.user_id })
        .from(category_assignments)
        .where(eq(category_assignments.category_id, categoryId));
      
      if (categoryAssignedAdmins.length > 0) {
        const categoryAssignedUserIds = categoryAssignedAdmins.map(a => a.user_id);
        
        // Step 2: Check if any category-assigned admins match domain/scope from admin_profiles
        const matchingCategoryAdmins = await db
          .select({ user_id: admin_profiles.user_id })
          .from(admin_profiles)
          .innerJoin(users, eq(admin_profiles.user_id, users.id))
          .innerJoin(roles, eq(users.role_id, roles.id))
          .where(
            and(
              sql`${roles.name} IN ('admin', 'snr_admin', 'super_admin')`,
              eq(admin_profiles.primary_domain_id, categoryDomainId),
              eq(admin_profiles.primary_scope_id, scopeId),
              eq(users.is_active, true),
              inArray(admin_profiles.user_id, categoryAssignedUserIds)
            )
          );
        
        if (matchingCategoryAdmins.length === 1) {
          return matchingCategoryAdmins[0].user_id;
        }
      }
    }
    
    // Step 3: If no category assignment match, check admin_assignments (secondary)
    const assignmentAdmins = await db
      .select({ user_id: admin_assignments.user_id })
      .from(admin_assignments)
      .where(
        and(
          eq(admin_assignments.domain_id, categoryDomainId),
          eq(admin_assignments.scope_id, scopeId)
        )
      );
    
    // Step 4: Check admin_profiles (primary)
    const profileAdmins = await db
      .select({ user_id: admin_profiles.user_id })
      .from(admin_profiles)
      .innerJoin(users, eq(admin_profiles.user_id, users.id))
      .innerJoin(roles, eq(users.role_id, roles.id))
      .where(
        and(
          sql`${roles.name} IN ('admin', 'snr_admin', 'super_admin')`,
          eq(admin_profiles.primary_domain_id, categoryDomainId),
          eq(admin_profiles.primary_scope_id, scopeId),
          eq(users.is_active, true)
        )
      );
    
    // Combine and deduplicate
    const allMatchingAdmins = new Set<string>();
    assignmentAdmins.forEach(a => allMatchingAdmins.add(a.user_id));
    profileAdmins.forEach(p => allMatchingAdmins.add(p.user_id));
    
    // Only assign if exactly 1 admin matches
    if (allMatchingAdmins.size === 1) {
      return Array.from(allMatchingAdmins)[0];
    }
    
    // If 0 or 2+ matches, return null to continue to next priority
    return null;
  } catch (error) {
    logger.error({ error, categoryDomainId, ticketScopeId, ticketLocation }, 'Error finding domain/scope assignee');
    return null;
  }
}

/**
 * Find super admin user
 */
async function findSuperAdmin(txn?: DbTransaction): Promise<string | null> {
  try {
    const dbInstance = txn || db;
    
    const [superAdmin] = await dbInstance
      .select({ id: users.id })
      .from(users)
      .innerJoin(roles, eq(users.role_id, roles.id))
      .where(
        and(
          eq(roles.name, 'super_admin'),
          eq(users.is_active, true)
        )
      )
      .limit(1);

    return superAdmin?.id || null;
  } catch (error) {
    logger.error({ error }, 'Error finding super admin');
    return null;
  }
}

/**
 * Create a new ticket
 */
export async function createTicket(
  userId: string,
  input: CreateTicketInput
) {
  // 1. Check rate limit (outside transaction for better performance)
  await checkTicketRateLimit(userId);

  return withTransaction(async (txn) => {
    // 2. Run independent queries in parallel for better performance
    const [categoryValidationResult, openStatusId] = await Promise.all([
      validateCategoryAndSubcategory(input.category_id, input.subcategory_id),
      getStatusId(TICKET_STATUS.OPEN),
    ]);

    const { category, subcategory } = categoryValidationResult;

    // 2.5. Validate metadata
    // Only resolve scope from profile if location is not in ticket (optimization)
    const ticketLocation = (input as any).location || input.metadata?.location as string | undefined;

    // Strip non-field profile keys before validation (they shouldn't be validated against dynamic fields)
    const PROFILE_KEYS = new Set([
      'name',
      'email',
      'phone',
      'hostel',
      'Hostel',
      'hostel_name',
      'roomNumber',
      'room_number',
      'room',
      'batchYear',
      'batch_year',
      'batch',
      'classSection',
      'class_section',
      'section',
    ]);
    const metadataForValidation = input.metadata && typeof input.metadata === 'object'
      ? Object.fromEntries(
          Object.entries(input.metadata as Record<string, unknown>).filter(
            ([key]) => !PROFILE_KEYS.has(key)
          )
        )
      : input.metadata;

    const metadataValidation = input.subcategory_id && metadataForValidation
      ? await validateTicketMetadata(input.subcategory_id, metadataForValidation)
      : { valid: true, errors: [] };
    
    // Only fetch from student profile if location is not provided in ticket
    const resolvedScopeId = ticketLocation
      ? null // Skip profile lookup if location is in ticket
      : await resolveTicketScope(input.category_id, userId, {
          scope_id: category.scope_id,
          scope_mode: category.scope_mode,
        });

    if (!metadataValidation.valid) {
      throw Errors.validation(
        'Invalid ticket metadata',
        { errors: metadataValidation.errors }
      );
    }

    // 3. Calculate deadlines based on SLA
    const deadlines = calculateDeadlines(category.sla_hours || 48);

    // 4. Find best assignee (priority order):
    // 1) Field-level assignment (from category_fields.assigned_admin_id)
    // 2) Domain/scope-based assignment (only for Hostel/College)
    // 3) Subcategory-level assignment (from subcategories.assigned_admin_id)
    // 4) Category default admin (from categories.default_admin_id)
    // 5) Super admin fallback
    
    // Determine the ticket's final scope (resolved scope takes precedence over category scope)
    const ticketScopeId = resolvedScopeId || category.scope_id || null;
    
    // Priority 1: Field-level assignment
    let assignedTo: string | null = await findFieldLevelAssignee(
      input.subcategory_id || null,
      input.metadata || null,
      txn
    );
    
    // Priority 2: Domain/scope-based assignment
    if (!assignedTo) {
      assignedTo = await findDomainScopeAssignee(
        category.domain_id,
        ticketScopeId,
        ticketLocation,
        category.scope_mode,
        category.scope_id,
        ticketLocation ? null : userId, // Skip userId if location is in ticket (no need to fetch profile)
        input.category_id
      );
    }
    
    // Priority 3: Subcategory-level assignment
    if (!assignedTo) {
      assignedTo = subcategory?.assigned_admin_id || null;
    }
    
    // Priority 4: Category default admin
    if (!assignedTo) {
      assignedTo = category.default_admin_id;
    }
    
    // Priority 5: Super admin fallback
    if (!assignedTo) {
      assignedTo = await findSuperAdmin(txn);
    }

    // 5. Create ticket
    // Use location from top-level input or metadata (for backward compatibility)
    const ticketLocationValue = (input as any).location || input.metadata?.location as string | undefined;
    const [ticket] = await txn
      .insert(tickets)
      .values({
        ticket_number: `TKT-${Date.now()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`,
        title: input.title,
        description: input.description,
        location: ticketLocationValue,
        category_id: input.category_id,
        subcategory_id: input.subcategory_id,
        scope_id: resolvedScopeId,
        status_id: openStatusId,
        priority: input.priority || 'medium',
        created_by: userId,
        assigned_to: assignedTo,
        metadata: input.metadata || {},
        attachments: input.attachments || [],
        ...deadlines,
      })
      .returning();

    // 6. Insert attachments into ticket_attachments table
    if (input.attachments && input.attachments.length > 0) {
      await txn.insert(ticket_attachments).values(
        input.attachments.map((attachment) => ({
          ticket_id: ticket.id,
          uploaded_by: userId,
          file_name: attachment.filename,
          file_url: attachment.url,
          file_size: attachment.size,
          mime_type: attachment.mime_type,
        }))
      );
    }

    // 7. Log activity
    await txn.insert(ticket_activity).values({
      ticket_id: ticket.id,
      user_id: userId,
      action: 'created',
      details: {
        title: ticket.title,
        category_id: ticket.category_id,
        subcategory_id: ticket.subcategory_id,
        priority: ticket.priority,
      },
    });

    // 7. Queue notification
    await txn.insert(outbox).values({
      event_type: 'ticket.created',
      aggregate_type: 'ticket',
      aggregate_id: String(ticket.id),
      payload: { ticketId: ticket.id },
    });

    logger.info(
      {
        ticketId: ticket.id,
        ticketNumber: ticket.ticket_number,
        userId,
        categoryId: input.category_id,
      },
      'Ticket created'
    );

    return ticket;
  });
}

/**
 * Get ticket by ID with relations
 */
export async function getTicketById(ticketId: number) {
  const [ticket] = await db
    .select({
      ticket: tickets,
      status: {
        id: ticket_statuses.id,
        value: ticket_statuses.value,
        label: ticket_statuses.label,
        color: ticket_statuses.color,
      },
      category: categories,
      subcategory: subcategories,
      creator: {
        id: users.id,
        email: users.email,
        full_name: users.full_name,
        avatar_url: users.avatar_url,
      },
    })
    .from(tickets)
    .leftJoin(ticket_statuses, eq(tickets.status_id, ticket_statuses.id))
    .leftJoin(categories, eq(tickets.category_id, categories.id))
    .leftJoin(subcategories, eq(tickets.subcategory_id, subcategories.id))
    .leftJoin(users, eq(tickets.created_by, users.id))
    .where(eq(tickets.id, ticketId))
    .limit(1);

  if (!ticket) {
    throw Errors.notFound('Ticket', String(ticketId));
  }

  return ticket;
}

/**
 * Get ticket activity history
 */
export async function getTicketActivity(ticketId: number) {
  const activities = await db
    .select({
      activity: ticket_activity,
      user: {
        id: users.id,
        email: users.email,
        full_name: users.full_name,
        avatar_url: users.avatar_url,
      },
    })
    .from(ticket_activity)
    .leftJoin(users, eq(ticket_activity.user_id, users.id))
    .where(eq(ticket_activity.ticket_id, ticketId))
    .orderBy(desc(ticket_activity.created_at));

  return activities;
}
