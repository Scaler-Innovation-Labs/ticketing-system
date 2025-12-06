/**
 * Role Management Service
 * 
 * Handles user role assignment and lookup with caching.
 * - Role assignment
 * - Cached role lookup
 * - Permission checks
 */

import { db, users, roles, students, admin_profiles } from '@/db';
import { eq } from 'drizzle-orm';
import { USER_ROLES, type UserRole, CACHE_TTL } from '@/conf/constants';
import { logger } from '@/lib/logger';
import { Errors } from '@/lib/errors';

// In-memory cache for role lookups
interface RoleCache {
  role: UserRole;
  expiresAt: number;
}

const roleCache = new Map<string, RoleCache>();

/**
 * Get user role from database
 * 
 * Queries the database for user's role with proper joins.
 * This is the source of truth - cache should call this.
 */
export async function getUserRoleFromDB(
  userId: string
): Promise<UserRole | null> {
  try {
    // Check if userId is a UUID
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId);

    const [user] = await db
      .select({
        roleId: users.role_id,
        roleName: roles.name,
      })
      .from(users)
      .leftJoin(roles, eq(users.role_id, roles.id))
      .where(isUuid ? eq(users.id, userId) : eq(users.external_id, userId))
      .limit(1);

    if (!user || !user.roleName) {
      // Check if user exists but has no role assigned
      const [userExists] = await db
        .select({ id: users.id })
        .from(users)
        .where(isUuid ? eq(users.id, userId) : eq(users.external_id, userId))
        .limit(1);

      if (userExists) {
        // User exists but no role - default to student
        return USER_ROLES.STUDENT;
      }

      return null;
    }

    return user.roleName as UserRole;
  } catch (error) {
    logger.error({ userId, error }, 'Failed to fetch user role');
    return null;
  }
}

/**
 * Get user role with caching
 * 
 * Returns cached role if available, otherwise queries database.
 * Use this in API routes for better performance.
 */
export async function getUserRole(userId: string): Promise<UserRole | null> {
  // Check cache first
  const cached = roleCache.get(userId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.role;
  }

  // Cache miss - fetch from database
  const role = await getUserRoleFromDB(userId);

  if (role) {
    // Store in cache
    roleCache.set(userId, {
      role,
      expiresAt: Date.now() + CACHE_TTL.USER_ROLE,
    });
  }

  return role;
}

/**
 * Invalidate role cache for a user
 * 
 * Call this after updating a user's role.
 */
export function invalidateRoleCache(userId: string): void {
  roleCache.delete(userId);
  logger.debug({ userId }, 'Role cache invalidated');
}

/**
 * Clear all role cache
 * 
 * Call this sparingly - only during admin operations that affect many users.
 */
export function clearRoleCache(): void {
  const size = roleCache.size;
  roleCache.clear();
  logger.info({ cacheSize: size }, 'Role cache cleared');
}

/**
 * Assign role to user
 * 
 * Updates user's role in database and invalidates cache.
 */
export async function assignRole(
  userId: string,
  roleName: UserRole
): Promise<void> {
  // Validate role name
  const validRoles = Object.values(USER_ROLES);
  if (!validRoles.includes(roleName)) {
    throw Errors.validation(`Invalid role: ${roleName}`);
  }

  // Find role ID
  const [role] = await db
    .select({ id: roles.id })
    .from(roles)
    .where(eq(roles.name, roleName))
    .limit(1);

  if (!role) {
    throw Errors.notFound('Role', roleName);
  }

  // Update user
  await db
    .update(users)
    .set({
      role_id: role.id,
      updated_at: new Date(),
    })
    .where(eq(users.external_id, userId));

  // Invalidate cache
  invalidateRoleCache(userId);

  logger.info({ userId, role: roleName }, 'Role assigned');
}

/**
 * Check if user has specific role
 * 
 * @example
 * if (await hasRole(userId, USER_ROLES.ADMIN)) {
 *   // Allow admin action
 * }
 */
export async function hasRole(
  userId: string,
  requiredRole: UserRole
): Promise<boolean> {
  const userRole = await getUserRole(userId);
  return userRole === requiredRole;
}

/**
 * Check if user has any of the specified roles
 * 
 * @example
 * if (await hasAnyRole(userId, [USER_ROLES.ADMIN, USER_ROLES.SUPER_ADMIN])) {
 *   // Allow admin/super_admin action
 * }
 */
export async function hasAnyRole(
  userId: string,
  allowedRoles: UserRole[]
): Promise<boolean> {
  const userRole = await getUserRole(userId);
  return userRole ? allowedRoles.includes(userRole) : false;
}

/**
 * Assert user has required role or throw error
 * 
 * Use this to guard API routes by role.
 * 
 * @example
 * await assertRole(userId, USER_ROLES.ADMIN);
 */
export async function assertRole(
  userId: string,
  requiredRole: UserRole
): Promise<void> {
  const hasRequiredRole = await hasRole(userId, requiredRole);

  if (!hasRequiredRole) {
    throw Errors.forbidden(
      `This action requires ${requiredRole} role`
    );
  }
}

/**
 * Assert user has any of the allowed roles or throw error
 * 
 * @example
 * await assertAnyRole(userId, [USER_ROLES.ADMIN, USER_ROLES.SUPER_ADMIN]);
 */
export async function assertAnyRole(
  userId: string,
  allowedRoles: UserRole[]
): Promise<void> {
  const hasAllowedRole = await hasAnyRole(userId, allowedRoles);

  if (!hasAllowedRole) {
    throw Errors.forbidden(
      `This action requires one of: ${allowedRoles.join(', ')}`
    );
  }
}

/**
 * Get user profile with role
 * 
 * Returns complete user profile including student/admin details.
 */
export async function getUserProfile(userId: string) {
  const [user] = await db
    .select({
      id: users.id,
      email: users.email,
      phone: users.phone,
      fullName: users.full_name,
      avatarUrl: users.avatar_url,
      isActive: users.is_active,
      roleName: roles.name,
    })
    .from(users)
    .leftJoin(roles, eq(users.role_id, roles.id))
    .where(eq(users.external_id, userId))
    .limit(1);

  if (!user) {
    throw Errors.notFound('User', userId);
  }

  const role = (user.roleName as UserRole) || USER_ROLES.STUDENT;

  // Fetch student profile if student
  if (role === USER_ROLES.STUDENT) {
    // Need to use internal UUID for student lookup
    const [studentProfile] = await db
      .select()
      .from(students)
      .where(eq(students.user_id, user.id))
      .limit(1);

    return {
      ...user,
      role,
      studentProfile,
    };
  }

  // Fetch admin profile if admin
  if (role === USER_ROLES.ADMIN || role === USER_ROLES.SUPER_ADMIN) {
    // Need to use internal UUID for admin profile lookup
    const [adminProfile] = await db
      .select()
      .from(admin_profiles)
      .where(eq(admin_profiles.user_id, user.id))
      .limit(1);

    return {
      ...user,
      role,
      adminProfile,
    };
  }

  return {
    ...user,
    role,
  };
}

/**
 * Check if user is student
 */
export async function isStudent(userId: string): Promise<boolean> {
  return hasRole(userId, USER_ROLES.STUDENT);
}

/**
 * Check if user is admin (any admin level)
 */
export async function isAdmin(userId: string): Promise<boolean> {
  return hasAnyRole(userId, [
    USER_ROLES.ADMIN,
    USER_ROLES.SUPER_ADMIN,
  ]);
}

/**
 * Check if user is super admin
 */
export async function isSuperAdmin(userId: string): Promise<boolean> {
  return hasRole(userId, USER_ROLES.SUPER_ADMIN);
}
