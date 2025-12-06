/**
 * Auth Helpers for API Routes
 * 
 * Utilities for authentication and authorization in Next.js API routes.
 * - Get current user from Clerk
 * - Require authentication
 * - Require specific roles
 */

import { auth, currentUser } from '@clerk/nextjs/server';
import { type UserRole } from '@/conf/constants';
import { logger } from '@/lib/logger';
import { Errors } from '@/lib/errors';
import { getUserRole, assertAnyRole } from './roles';
import { getOrCreateUser, type ClerkUser } from './user-sync';

/**
 * Get authenticated user info from Clerk
 * 
 * Returns null if not authenticated.
 * Use this for optional auth.
 */
export async function getAuthUser() {
  const { userId } = await auth();
  
  if (!userId) {
    return null;
  }

  return {
    clerkUserId: userId,
  };
}

/**
 * Require authentication or throw
 * 
 * Use this at the start of protected API routes.
 * 
 * @example
 * export async function GET() {
 *   const { userId } = await requireAuth();
 *   // ... rest of handler
 * }
 */
export async function requireAuth() {
  const { userId } = await auth();

  if (!userId) {
    logger.warn('Unauthorized API access attempt');
    throw Errors.unauthorized('Authentication required');
  }

  return {
    clerkUserId: userId,
  };
}

/**
 * Get or create user in local database from Clerk session
 * 
 * This syncs the Clerk user to our database if needed.
 * Use this when you need the database user record.
 * 
 * @example
 * const { user, dbUser } = await requireDbUser();
 */
export async function requireDbUser() {
  const { userId } = await auth();

  if (!userId) {
    throw Errors.unauthorized('Authentication required');
  }

  // Get full user data from Clerk
  const clerkUser = await currentUser();

  if (!clerkUser) {
    throw Errors.unauthorized('User not found');
  }

  // Map Clerk user to our ClerkUser interface
  const mappedClerkUser: ClerkUser = {
    id: clerkUser.id,
    externalId: clerkUser.externalId || clerkUser.id,
    emailAddresses: clerkUser.emailAddresses.map(e => ({
      emailAddress: e.emailAddress,
    })),
    phoneNumbers: clerkUser.phoneNumbers?.map(p => ({
      phoneNumber: p.phoneNumber,
    })),
    firstName: clerkUser.firstName,
    lastName: clerkUser.lastName,
    imageUrl: clerkUser.imageUrl,
  };

  // Sync to database
  const dbUser = await getOrCreateUser(userId, mappedClerkUser);

  return {
    clerkUserId: userId,
    user: clerkUser,
    dbUser,
  };
}

/**
 * Require specific role(s) or throw
 * 
 * Use this to protect admin-only routes.
 * 
 * @example
 * export async function POST() {
 *   const { dbUser } = await requireRole([USER_ROLES.ADMIN]);
 *   // ... admin action
 * }
 */
export async function requireRole(allowedRoles: UserRole[]) {
  const { dbUser } = await requireDbUser();

  // Check role
  await assertAnyRole(dbUser.id, allowedRoles);

  // Get actual role
  const role = await getUserRole(dbUser.id);

  return {
    dbUser,
    role: role!,
  };
}

/**
 * Get current user with role
 * 
 * Convenience function that returns user + role.
 * Use this when you need role-based logic.
 * 
 * @example
 * const { dbUser, role } = await getCurrentUser();
 * if (role === USER_ROLES.ADMIN) {
 *   // Show admin options
 * }
 */
export async function getCurrentUser() {
  const { dbUser } = await requireDbUser();
  const role = await getUserRole(dbUser.id);

  if (!role) {
    logger.error({ userId: dbUser.id }, 'User has no role assigned');
    throw Errors.forbidden('User role not configured');
  }

  return {
    dbUser,
    role,
  };
}

/**
 * Create API response helpers
 * 
 * Use these for consistent API responses.
 */
export const ApiResponse = {
  /**
   * Success response
   */
  success<T>(data: T, status = 200) {
    return Response.json(
      {
        success: true,
        data,
      },
      { status }
    );
  },

  /**
   * Created response
   */
  created<T>(data: T) {
    return Response.json(
      {
        success: true,
        data,
      },
      { status: 201 }
    );
  },

  /**
   * No content response
   */
  noContent() {
    return new Response(null, { status: 204 });
  },

  /**
   * Error response
   */
  error(message: string, code: string, status = 400, details?: unknown) {
    return Response.json(
      {
        success: false,
        error: {
          message,
          code,
          ...(details ? { details } : {}),
        },
      },
      { status }
    );
  },
};

/**
 * Verify CRON secret for scheduled jobs
 * 
 * Use this in /api/cron/* routes to verify requests are from Vercel Cron.
 * 
 * @example
 * export async function GET(req: Request) {
 *   verifyCronSecret(req);
 *   // ... cron job logic
 * }
 */
export function verifyCronSecret(req: Request): void {
  const authHeader = req.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    logger.error('CRON_SECRET not configured');
    throw Errors.internal('Server configuration error');
  }

  if (authHeader !== `Bearer ${cronSecret}`) {
    logger.warn(
      { authHeader: authHeader ? 'present' : 'missing' },
      'Invalid cron secret'
    );
    throw Errors.unauthorized('Invalid cron secret');
  }
}

/**
 * Extract pagination params from URL search params
 * 
 * @example
 * const { page, limit, offset } = getPaginationParams(req.nextUrl.searchParams);
 */
export function getPaginationParams(searchParams: URLSearchParams) {
  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
  const limit = Math.min(
    100,
    Math.max(1, parseInt(searchParams.get('limit') || '10', 10))
  );
  const offset = (page - 1) * limit;

  return { page, limit, offset };
}

/**
 * Extract sort params from URL search params
 * 
 * @example
 * const { sortBy, sortOrder } = getSortParams(
 *   req.nextUrl.searchParams,
 *   'created_at',
 *   ['created_at', 'updated_at', 'title']
 * );
 */
export function getSortParams(
  searchParams: URLSearchParams,
  defaultSortBy: string,
  allowedFields: string[]
) {
  const sortBy = searchParams.get('sortBy') || defaultSortBy;
  const sortOrder = searchParams.get('sortOrder') === 'asc' ? 'asc' : 'desc';

  // Validate sortBy is in allowed fields
  if (!allowedFields.includes(sortBy)) {
    throw Errors.validation(
      `Invalid sort field: ${sortBy}. Allowed: ${allowedFields.join(', ')}`
    );
  }

  return { sortBy, sortOrder };
}
