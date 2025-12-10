/**
 * Scope Resolution Service
 * 
 * Handles dynamic scope resolution based on user profile
 * - Fixed: Category has specific scope
 * - Dynamic: Resolved from student profile (hostel_id, class_section_id, etc.)
 * - None: No scoping
 */

import { db, categories, scopes, students } from '@/db';
import { eq } from 'drizzle-orm';
import { logger } from '@/lib/logger';
import { Errors } from '@/lib/errors';

/**
 * Resolve scope for a ticket based on category and user
 * @param categoryId - Category ID (if categoryData not provided)
 * @param userId - User ID
 * @param categoryData - Optional pre-fetched category data to avoid duplicate query
 */
export async function resolveTicketScope(
  categoryId: number,
  userId: string,
  categoryData?: { scope_id: number | null; scope_mode: string | null }
): Promise<number | null> {
  let scope_mode: string | null;
  let scope_id: number | null;

  // Use provided category data if available, otherwise fetch it
  if (categoryData) {
    scope_mode = categoryData.scope_mode;
    scope_id = categoryData.scope_id;
  } else {
    // Get category with scope configuration
    const [category] = await db
      .select({
        id: categories.id,
        scope_id: categories.scope_id,
        scope_mode: categories.scope_mode,
      })
      .from(categories)
      .where(eq(categories.id, categoryId))
      .limit(1);

    if (!category) {
      throw Errors.notFound('Category', String(categoryId));
    }

    scope_mode = category.scope_mode;
    scope_id = category.scope_id;
  }

  // No scoping
  if (scope_mode === 'none') {
    return null;
  }

  // Fixed scope
  if (scope_mode === 'fixed') {
    if (!scope_id) {
      logger.warn(
        { categoryId, scopeMode: scope_mode },
        'Category has fixed scope mode but no scope_id'
      );
      return null;
    }
    return scope_id;
  }

  // Dynamic scope - resolve from user profile
  if (scope_mode === 'dynamic') {
    // For dynamic scope mode, scope_id is optional - it's used to configure which field to use
    // If no scope_id, we can't resolve dynamically, so return null (no scoping)
    if (!scope_id) {
      logger.debug(
        { categoryId, scopeMode: scope_mode },
        'Category has dynamic scope mode but no scope_id - skipping scope resolution'
      );
      return null;
    }

    // Get scope configuration
    const [scopeConfig] = await db
      .select()
      .from(scopes)
      .where(eq(scopes.id, scope_id))
      .limit(1);

    if (!scopeConfig || !scopeConfig.student_field_key) {
      logger.warn(
        { categoryId, scopeId: scope_id },
        'Scope configuration missing or no student_field_key'
      );
      return null;
    }

    // Get student profile
    const [student] = await db
      .select()
      .from(students)
      .where(eq(students.user_id, userId))
      .limit(1);

    if (!student) {
      throw Errors.notFound('Student profile', userId);
    }

    // Resolve field value
    const fieldKey = scopeConfig.student_field_key;
    let resolvedScopeId: number | null = null;

    switch (fieldKey) {
      case 'hostel_id':
        resolvedScopeId = student.hostel_id;
        break;
      case 'class_section_id':
        resolvedScopeId = student.class_section_id;
        break;
      case 'batch_id':
        resolvedScopeId = student.batch_id;
        break;
      default:
        logger.warn(
          { fieldKey, scopeId: scope_id },
          'Unknown student field key for scope resolution'
        );
    }

    if (!resolvedScopeId) {
      logger.warn(
        { userId, fieldKey, categoryId },
        'Could not resolve scope from student profile'
      );
    }

    return resolvedScopeId;
  }

  logger.warn(
    { scopeMode: scope_mode, categoryId },
    'Unknown scope mode'
  );
  
  return null;
}

/**
 * Check if user has access to a scope
 */
export async function checkScopeAccess(
  userId: string,
  scopeId: number | null
): Promise<boolean> {
  // No scope = everyone has access
  if (!scopeId) {
    return true;
  }

  // Get student profile
  const [student] = await db
    .select()
    .from(students)
    .where(eq(students.user_id, userId))
    .limit(1);

  if (!student) {
    // Not a student - might be admin/staff
    return true;
  }

  // Check if student's attributes match scope
  const matchesHostel = student.hostel_id === scopeId;
  const matchesClassSection = student.class_section_id === scopeId;
  const matchesBatch = student.batch_id === scopeId;

  return matchesHostel || matchesClassSection || matchesBatch;
}
