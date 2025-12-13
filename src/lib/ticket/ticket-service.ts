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
        assigned_admin_id: category_fields.assigned_admin_id,
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
      const assignedAdminId = field.assigned_admin_id;
      
      if (fieldValue && assignedAdminId) {
        return assignedAdminId;
      }
    }

    return null;
  } catch (error: any) {
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
    }

    // If no scope, can't assign by domain/scope
    if (!scopeId) {
      return null;
    }

    // Optimize: Combine queries for better performance
    // Check category_assignments, admin_assignments, and admin_profiles in parallel
    const [categoryAssignedAdmins, assignmentAdmins, profileAdmins] = await Promise.all([
      // Step 1: Get admins assigned to this category (if categoryId provided)
      categoryId
        ? db
            .select({ user_id: category_assignments.user_id })
            .from(category_assignments)
            .where(eq(category_assignments.category_id, categoryId))
        : Promise.resolve([]),
      // Step 2: Check admin_assignments (secondary)
      db
        .select({ user_id: admin_assignments.user_id })
        .from(admin_assignments)
        .where(
          and(
            eq(admin_assignments.domain_id, categoryDomainId),
            eq(admin_assignments.scope_id, scopeId)
          )
        ),
      // Step 3: Check admin_profiles (primary)
      db
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
        ),
    ]);
    
    // If category assignments exist, filter profile admins to only those in category assignments
    if (categoryAssignedAdmins.length > 0) {
      const categoryAssignedUserIds = new Set(categoryAssignedAdmins.map(a => a.user_id));
      const matchingCategoryAdmins = profileAdmins.filter(p => categoryAssignedUserIds.has(p.user_id));
      
      if (matchingCategoryAdmins.length === 1) {
        return matchingCategoryAdmins[0].user_id;
      }
    }
    
    // Combine and deduplicate all matching admins
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
  // OPTIMIZATION: Move read-only validation queries outside transaction
  // These are read-only operations that don't need transaction isolation
  // This reduces transaction time and improves performance
  const [categoryValidationResult, openStatusId] = await Promise.all([
    // 1. Check rate limit (outside transaction for better performance)
    checkTicketRateLimit(userId).then(() => 
      validateCategoryAndSubcategory(input.category_id, input.subcategory_id)
    ),
    getStatusId(TICKET_STATUS.OPEN),
  ]);

  const { category, subcategory } = categoryValidationResult;

  // OPTIMIZATION: Move metadata validation and scope resolution outside transaction
  // These are read-only operations that don't need transaction isolation
  const ticketLocation = (input as any).location || input.metadata?.location as string | undefined;

  // Strip non-field profile keys before validation (they shouldn't be validated against dynamic fields)
  // Includes variants to handle different naming conventions (camelCase, snake_case, short forms)
  // Normalize to lowercase for case-insensitive matching
  const PROFILE_KEYS = new Set([
    'name',
    'email',
    'phone',
    'hostel',
    'hostel_name',
    'roomnumber', // camelCase normalized
    'room_number',
    'room',
    'batchyear', // camelCase normalized
    'batch_year',
    'batch',
    'classsection', // camelCase normalized
    'class_section',
    'section',
  ]);
  const metadataForValidation = input.metadata && typeof input.metadata === 'object'
    ? Object.fromEntries(
        Object.entries(input.metadata as Record<string, unknown>).filter(
          ([key]) => !PROFILE_KEYS.has(key.toLowerCase())
        )
      )
    : input.metadata;

  // OPTIMIZATION: Parallelize metadata validation and scope resolution
  // These are independent operations and can run simultaneously
  const [metadataValidation, resolvedScopeId] = await Promise.all([
    // Validate metadata if subcategory and metadata are provided
    input.subcategory_id && metadataForValidation
      ? validateTicketMetadata(input.subcategory_id, metadataForValidation)
      : Promise.resolve({ valid: true, errors: [] }),
    // Only fetch from student profile if location is not provided in ticket
    ticketLocation
      ? Promise.resolve(null) // Skip profile lookup if location is in ticket
      : resolveTicketScope(input.category_id, userId, {
          scope_id: category.scope_id,
          scope_mode: category.scope_mode,
        }),
  ]);

  if (!metadataValidation.valid) {
    throw Errors.validation(
      'Invalid ticket metadata',
      { errors: metadataValidation.errors }
    );
  }

  // Calculate deadlines outside transaction (pure computation)
  const deadlines = calculateDeadlines(category.sla_hours || 48);

  // All validation and preparation is done outside transaction
  // Now we only do writes inside the transaction
  return withTransaction(async (txn) => {

    // 4. Find best assignee (priority order):
    // 1) Field-level assignment (from category_fields.assigned_admin_id)
    // 2) Subcategory-level assignment (from subcategories.assigned_admin_id)
    // 3) Category default admin (from categories.default_admin_id)
    // 4) Domain/scope-based assignment (only for Hostel/College)
    // 5) Super admin fallback
    
    // Determine the ticket's final scope (resolved scope takes precedence over category scope)
    const ticketScopeId = resolvedScopeId || category.scope_id || null;
    
    // OPTIMIZATION: Pre-fetch all potential assignees in parallel
    // This reduces sequential query delays by fetching all candidates upfront
    const [fieldLevelAssignee, superAdmin, domainScopeAssignee] = await Promise.all([
      // Priority 1: Field-level assignment
      findFieldLevelAssignee(
        input.subcategory_id || null,
        input.metadata || null,
        txn
      ),
      // Priority 5: Super admin fallback (pre-fetch in case we need it)
      findSuperAdmin(txn).catch(() => null), // Don't fail if super admin lookup fails
      // Priority 4: Domain/scope-based assignment (pre-fetch, will be used if other priorities fail)
      // Only fetch if we have a domain_id (early exit optimization)
      category.domain_id
        ? findDomainScopeAssignee(
            category.domain_id,
            ticketScopeId,
            ticketLocation,
            category.scope_mode,
            category.scope_id,
            ticketLocation ? null : userId, // Skip userId if location is in ticket
            input.category_id
          ).catch(() => null) // Don't fail if domain/scope lookup fails
        : Promise.resolve(null),
    ]);
    
    // Apply assignment priority (using pre-fetched values)
    // Priority 1: Field-level assignment
    let assignedTo: string | null = fieldLevelAssignee;
    
    // Priority 2: Subcategory-level assignment (no query needed, already in memory)
    if (!assignedTo) {
      assignedTo = subcategory?.assigned_admin_id || null;
    }
    
    // Priority 3: Category default admin (no query needed, already in memory)
    if (!assignedTo) {
      assignedTo = category.default_admin_id;
    }
    
    // Priority 4: Domain/scope-based assignment (already fetched)
    if (!assignedTo) {
      assignedTo = domainScopeAssignee;
    }
    
    // Priority 5: Super admin fallback (already fetched)
    if (!assignedTo) {
      assignedTo = superAdmin;
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

    // OPTIMIZATION: Parallelize critical inserts after ticket creation
    // Attachments and activity are critical, outbox is non-blocking
    const [attachmentsResult, activityResult] = await Promise.all([
      // 6. Insert attachments into ticket_attachments table (if any)
      input.attachments && input.attachments.length > 0
        ? txn.insert(ticket_attachments).values(
            input.attachments.map((attachment) => ({
              ticket_id: ticket.id,
              uploaded_by: userId,
              file_name: attachment.filename,
              file_url: attachment.url,
              file_size: attachment.size,
              mime_type: attachment.mime_type,
            }))
          )
        : Promise.resolve(),

      // 7. Log activity (critical - must succeed)
      txn.insert(ticket_activity).values({
        ticket_id: ticket.id,
        user_id: userId,
        action: 'created',
        details: {
          title: ticket.title,
          category_id: ticket.category_id,
          subcategory_id: ticket.subcategory_id,
          priority: ticket.priority,
        },
      }),
    ]);

    // 8. Queue notification (non-blocking - don't fail if this errors)
    // Run this separately so it doesn't block ticket creation
    try {
      await txn.insert(outbox).values({
        event_type: 'ticket.created',
        aggregate_type: 'ticket',
        aggregate_id: String(ticket.id),
        payload: { ticketId: ticket.id },
      });
    } catch (outboxError: any) {
      // Log but don't throw - notification queueing failure shouldn't block ticket creation
      logger.error(
        { 
          error: outboxError?.message || String(outboxError),
          ticketId: ticket.id,
          userId 
        },
        'Failed to queue ticket creation notification'
      );
    }

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
