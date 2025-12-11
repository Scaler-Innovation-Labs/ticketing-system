/**
 * Ticket Service
 * 
 * Business logic for ticket management
 */

import { db, tickets, ticket_activity, ticket_statuses, categories, subcategories, users, outbox, ticket_attachments, category_fields, domains, scopes, roles, admin_profiles, admin_assignments, students, category_assignments, type DbTransaction } from '@/db';
import { eq, and, desc, asc, gte, sql, or, isNull } from 'drizzle-orm';
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
  logger.info({ subcategoryId, hasMetadata: !!metadata, metadataKeys: metadata ? Object.keys(metadata) : [] }, '[Assignment] Priority 1: Checking field-level assignment');
  
  if (!subcategoryId || !metadata || typeof metadata !== 'object') {
    logger.info({ subcategoryId, hasMetadata: !!metadata }, '[Assignment] Priority 1: Skipped - no subcategory or metadata');
    return null;
  }

  try {
    const dbInstance = txn || db;
    
    // Get all fields for the subcategory
    const fields = await dbInstance
      .select({ 
        id: category_fields.id,
        slug: category_fields.slug,
        assigned_admin_id: (category_fields as any).assigned_admin_id, // Check if column exists
      })
      .from(category_fields)
      .where(
        and(
          eq(category_fields.subcategory_id, subcategoryId),
          eq(category_fields.is_active, true)
        )
      );

    logger.info({ subcategoryId, fieldCount: fields.length, fields: fields.map(f => ({ id: f.id, slug: f.slug, hasAssignedAdmin: !!(f as any).assigned_admin_id })) }, '[Assignment] Priority 1: Fetched fields');

    // Check if any field in metadata has an assigned admin
    for (const field of fields) {
      const fieldValue = metadata[field.slug];
      const assignedAdminId = (field as any).assigned_admin_id;
      
      logger.debug({ 
        fieldId: field.id, 
        fieldSlug: field.slug, 
        hasFieldValue: !!fieldValue, 
        fieldValue, 
        hasAssignedAdmin: !!assignedAdminId,
        assignedAdminId 
      }, '[Assignment] Priority 1: Checking field');
      
      if (fieldValue && assignedAdminId) {
        logger.info({ fieldId: field.id, fieldSlug: field.slug, assignedAdminId }, '[Assignment] Priority 1: ✅ Found field-level assignee');
        return assignedAdminId;
      }
    }

    logger.info({ subcategoryId }, '[Assignment] Priority 1: ❌ No field-level assignment found');
    return null;
  } catch (error: any) {
    // If column doesn't exist, silently return null
    if (error?.message?.includes('assigned_admin_id') || error?.message?.includes('column')) {
      logger.debug({ subcategoryId, error: error.message }, '[Assignment] Priority 1: Field-level assignment not available (column may not exist)');
      return null;
    }
    logger.error({ error, subcategoryId }, '[Assignment] Priority 1: Error finding field-level assignee');
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
  logger.info({ categoryDomainId, ticketScopeId, ticketLocation, categoryScopeMode, categoryScopeId }, '[Assignment] Priority 2: Checking domain/scope-based assignment');
  
  // Must have domain_id to proceed
  if (!categoryDomainId) {
    logger.info({ categoryDomainId }, '[Assignment] Priority 2: Skipped - no domain_id');
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
    let scopeResolutionMethod: string | null = null;
    
    // PRIORITY 1: Always check student-submitted location first (overrides profile)
    // This handles cases where student explicitly selects a different location than their profile
    if (ticketLocation && categoryDomainId) {
      logger.info({ categoryDomainId, ticketLocation, ticketScopeId }, '[Assignment] Priority 2: Checking student-submitted location (overrides profile)');
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
        scopeResolutionMethod = 'ticket location (student-submitted, overrides profile)';
        logger.info({ scopeId, ticketLocation, previousScopeId: ticketScopeId, method: scopeResolutionMethod }, '[Assignment] Priority 2: ✅ Using student-submitted location (overrides profile-based scope)');
      } else {
        logger.info({ ticketLocation, categoryDomainId }, '[Assignment] Priority 2: No scope found for student-submitted location, will use profile or other method');
      }
    }
    
    // PRIORITY 2: Use pre-resolved ticketScopeId (from profile) if no location was provided
    if (!scopeId && ticketScopeId) {
      scopeId = ticketScopeId;
      scopeResolutionMethod = 'ticketScopeId (pre-resolved from profile)';
      logger.info({ scopeId, method: scopeResolutionMethod }, '[Assignment] Priority 2: Using pre-resolved ticketScopeId from profile');
    }
    
    // PRIORITY 3: If scope wasn't resolved yet and category has dynamic scope mode, try to resolve from profile
    if (!scopeId && categoryScopeMode === 'dynamic' && userId) {
      logger.info({ categoryDomainId, categoryScopeId, userId }, '[Assignment] Priority 2: Attempting to resolve dynamic scope from student profile (no location provided)');
      
      // If still no scope and category has scope_id, try to resolve from student profile
      if (!scopeId && categoryScopeId) {
        logger.info({ categoryDomainId, categoryScopeId, userId }, '[Assignment] Priority 2: Attempting to resolve dynamic scope from student profile');
        
        // Get scope configuration to find which student field to use
        const [scopeConfig] = await db
          .select({ student_field_key: scopes.student_field_key })
          .from(scopes)
          .where(eq(scopes.id, categoryScopeId))
          .limit(1);
        
        if (scopeConfig?.student_field_key) {
          // Get student profile
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
            // Resolve scope from student field
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
              default:
                logger.warn({ fieldKey }, '[Assignment] Priority 2: Unknown student field key for scope resolution');
            }
            
            if (scopeId) {
              scopeResolutionMethod = `student profile (${fieldKey})`;
              logger.info({ scopeId, fieldKey, userId, method: scopeResolutionMethod }, '[Assignment] Priority 2: ✅ Resolved dynamic scope from student profile');
            } else {
              logger.info({ fieldKey, userId }, '[Assignment] Priority 2: Student profile has no value for field');
            }
          } else {
            logger.info({ userId }, '[Assignment] Priority 2: Student profile not found');
          }
        } else {
          logger.info({ categoryScopeId }, '[Assignment] Priority 2: Scope config missing or no student_field_key');
        }
      }
      
      // If still no scope and category doesn't have scope_id, try to find any scope config in domain
      if (!scopeId && !categoryScopeId) {
        logger.info({ categoryDomainId, userId }, '[Assignment] Priority 2: Category has no scope_id, trying to find scope config in domain');
        
        // Find all scopes in this domain that have student_field_key
        const domainScopes = await db
          .select({ id: scopes.id, student_field_key: scopes.student_field_key, name: scopes.name })
          .from(scopes)
          .where(
            and(
              eq(scopes.domain_id, categoryDomainId),
              sql`${scopes.student_field_key} IS NOT NULL`
            )
          );
        
        logger.info({ domainScopesCount: domainScopes.length, domainScopes: domainScopes.map(s => ({ id: s.id, name: s.name, field: s.student_field_key })) }, '[Assignment] Priority 2: Found domain scopes with student_field_key');
        
        // Try each scope config to resolve from student profile
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
          
          // If resolved scope matches this scope config's ID, use it
          if (resolvedScopeId === scopeConfig.id) {
            scopeId = scopeConfig.id;
            scopeResolutionMethod = `student profile domain match (${scopeConfig.student_field_key} -> scope ${scopeConfig.id})`;
            logger.info({ scopeId, fieldKey: scopeConfig.student_field_key, userId, method: scopeResolutionMethod }, '[Assignment] Priority 2: ✅ Resolved dynamic scope from student profile (matched scope ID)');
            break;
          }
        }
        
        if (!scopeId) {
          logger.info({ categoryDomainId, userId }, '[Assignment] Priority 2: Could not resolve scope from student profile or metadata');
        }
      }
    }

    logger.info({ categoryDomainId, scopeId, resolutionMethod: scopeResolutionMethod || 'none (null scope)' }, '[Assignment] Priority 2: Final scope determined');

    // Debug: Check all admin_profiles in this domain to see what exists
    if (scopeId && categoryDomainId) {
      const allProfilesInDomain = await db
        .select({
          user_id: admin_profiles.user_id,
          primary_domain_id: admin_profiles.primary_domain_id,
          primary_scope_id: admin_profiles.primary_scope_id,
          role_name: roles.name,
          user_active: users.is_active,
        })
        .from(admin_profiles)
        .innerJoin(users, eq(admin_profiles.user_id, users.id))
        .innerJoin(roles, eq(users.role_id, roles.id))
        .where(
          and(
            sql`${roles.name} IN ('admin', 'snr_admin', 'super_admin')`,
            eq(admin_profiles.primary_domain_id, categoryDomainId),
            eq(users.is_active, true)
          )
        );
      
      logger.info({ 
        categoryDomainId, 
        scopeId, 
        allProfilesInDomain: allProfilesInDomain.map(p => ({
          user_id: p.user_id,
          domain_id: p.primary_domain_id,
          scope_id: p.primary_scope_id,
          role: p.role_name,
          active: p.user_active
        }))
      }, '[Assignment] Priority 2: Debug - All admin profiles in domain (any scope)');
    }

    // Collect all matching admins from admin_assignments (secondary assignments)
    const assignmentAdmins = scopeId
      ? await db
          .select({ user_id: admin_assignments.user_id })
          .from(admin_assignments)
          .where(
            and(
              eq(admin_assignments.domain_id, categoryDomainId),
              eq(admin_assignments.scope_id, scopeId)
            )
          )
      : [];

    logger.info({ categoryDomainId, scopeId, assignmentAdminCount: assignmentAdmins.length, assignmentAdmins: assignmentAdmins.map(a => a.user_id) }, '[Assignment] Priority 2: Found admins from admin_assignments');

    // Collect all matching admins from admin_profiles (primary assignments)
    // Include 'admin', 'snr_admin', and 'super_admin' roles
    const profileAdmins = scopeId
      ? await db
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
          )
      : [];

    logger.info({ categoryDomainId, scopeId, profileAdminCount: profileAdmins.length, profileAdmins: profileAdmins.map(p => p.user_id) }, '[Assignment] Priority 2: Found admins from admin_profiles (includes admin, snr_admin, and super_admin roles)');

    // Combine and deduplicate admin IDs
    const allMatchingAdmins = new Set<string>();
    assignmentAdmins.forEach(a => allMatchingAdmins.add(a.user_id));
    profileAdmins.forEach(p => allMatchingAdmins.add(p.user_id));

    logger.info({ categoryDomainId, scopeId, totalMatchingAdmins: allMatchingAdmins.size, adminIds: Array.from(allMatchingAdmins) }, '[Assignment] Priority 2: Combined matching admins');

    // If multiple admins match domain/scope, filter by category_assignments
    let finalMatchingAdmins = Array.from(allMatchingAdmins);
    
    if (finalMatchingAdmins.length > 1 && categoryId) {
      logger.info({ categoryId, matchingAdminsCount: finalMatchingAdmins.length, matchingAdmins: finalMatchingAdmins }, '[Assignment] Priority 2: Multiple admins match domain/scope, checking category_assignments');
      
      // Get admins assigned to this category
      const categoryAssignedAdmins = await db
        .select({ user_id: category_assignments.user_id })
        .from(category_assignments)
        .where(eq(category_assignments.category_id, categoryId));
      
      const categoryAssignedUserIds = new Set(categoryAssignedAdmins.map(a => a.user_id));
      logger.info({ categoryId, categoryAssignedCount: categoryAssignedUserIds.size, categoryAssignedAdmins: Array.from(categoryAssignedUserIds) }, '[Assignment] Priority 2: Found admins assigned to category');
      
      // Filter to only admins that are both in domain/scope match AND category_assignments
      finalMatchingAdmins = finalMatchingAdmins.filter(adminId => categoryAssignedUserIds.has(adminId));
      
      logger.info({ 
        categoryId, 
        filteredCount: finalMatchingAdmins.length, 
        filteredAdmins: finalMatchingAdmins 
      }, '[Assignment] Priority 2: Filtered admins (domain/scope + category assignment)');
    }

    // Only assign if exactly 1 admin matches
    if (finalMatchingAdmins.length === 1) {
      const assigneeId = finalMatchingAdmins[0];
      logger.info({ 
        categoryDomainId, 
        scopeId, 
        categoryId,
        assigneeId, 
        resolutionMethod: scopeResolutionMethod || 'unknown',
        ticketScopeId,
        ticketLocation,
        categoryScopeMode,
        categoryScopeId,
        usedCategoryAssignment: allMatchingAdmins.size > 1 && categoryId ? true : false
      }, '[Assignment] Priority 2: ✅ Found domain/scope assignee (exactly 1 match)');
      return assigneeId;
    }

    // If 0 or 2+ matches, return null to continue to next priority
    logger.info({ categoryDomainId, scopeId, categoryId, matchCount: finalMatchingAdmins.length }, '[Assignment] Priority 2: ❌ No assignment (0 or 2+ matches)');
    return null;
  } catch (error) {
    logger.error({ error, categoryDomainId, ticketScopeId, ticketLocation }, '[Assignment] Priority 2: Error finding domain/scope assignee');
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

    // 2.5. Validate metadata and resolve scope in parallel (both depend on category)
    // Pass category data to resolveTicketScope to avoid duplicate query
    const [metadataValidation, resolvedScopeId] = await Promise.all([
      input.subcategory_id && input.metadata
        ? validateTicketMetadata(input.subcategory_id, input.metadata)
        : Promise.resolve({ valid: true, errors: [] }),
      resolveTicketScope(input.category_id, userId, {
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
    logger.info({ 
      resolvedScopeId, 
      categoryScopeId: category.scope_id, 
      ticketScopeId,
      scopeMode: category.scope_mode,
      categoryId: input.category_id
    }, '[Assignment] Ticket scope ID determined (resolvedScopeId || category.scope_id)');
    
    // Priority 1: Field-level assignment
    let assignedTo: string | null = await findFieldLevelAssignee(
      input.subcategory_id || null,
      input.metadata || null,
      txn
    );
    
    // Priority 2: Domain/scope-based assignment
    // Check both input.location (top-level) and input.metadata?.location (for backward compatibility)
    const ticketLocation = (input as any).location || input.metadata?.location as string | undefined;
    if (!assignedTo) {
      assignedTo = await findDomainScopeAssignee(
        category.domain_id,
        ticketScopeId,
        ticketLocation,
        category.scope_mode,
        category.scope_id,
        userId,
        input.category_id
      );
    }
    
    // Priority 3: Subcategory-level assignment
    if (!assignedTo) {
      logger.info({ subcategoryId: input.subcategory_id, assignedAdminId: subcategory?.assigned_admin_id }, '[Assignment] Priority 3: Checking subcategory-level assignment');
      assignedTo = subcategory?.assigned_admin_id || null;
      if (assignedTo) {
        logger.info({ subcategoryId: input.subcategory_id, assigneeId: assignedTo }, '[Assignment] Priority 3: ✅ Found subcategory assignee');
      } else {
        logger.info({ subcategoryId: input.subcategory_id }, '[Assignment] Priority 3: ❌ No subcategory assignment');
      }
    }
    
    // Priority 4: Category default admin
    if (!assignedTo) {
      logger.info({ categoryId: input.category_id, defaultAdminId: category.default_admin_id }, '[Assignment] Priority 4: Checking category default admin');
      assignedTo = category.default_admin_id;
      if (assignedTo) {
        logger.info({ categoryId: input.category_id, assigneeId: assignedTo }, '[Assignment] Priority 4: ✅ Found category default admin');
      } else {
        logger.info({ categoryId: input.category_id }, '[Assignment] Priority 4: ❌ No category default admin');
      }
    }
    
    // Priority 5: Super admin fallback
    if (!assignedTo) {
      logger.info({}, '[Assignment] Priority 5: Checking super admin fallback');
      assignedTo = await findSuperAdmin(txn);
      if (assignedTo) {
        logger.info({ assigneeId: assignedTo }, '[Assignment] Priority 5: ✅ Found super admin');
      } else {
        logger.info({}, '[Assignment] Priority 5: ❌ No super admin found');
      }
    }

    logger.info({ 
      ticketCategoryId: input.category_id, 
      ticketSubcategoryId: input.subcategory_id,
      finalAssignee: assignedTo,
      assignmentSource: assignedTo 
        ? (assignedTo === subcategory?.assigned_admin_id ? 'subcategory' 
          : assignedTo === category.default_admin_id ? 'category_default' 
          : 'other')
        : 'none'
    }, '[Assignment] Final assignment decision');

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
