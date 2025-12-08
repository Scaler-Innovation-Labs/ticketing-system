/**
 * Admin User Service
 * 
 * Manages admin user accounts (separate from student service)
 * Focused single-responsibility service
 */

import { db } from '@/db';
import { users, admin_profiles, roles } from '@/db';
import { eq, and, or, ilike, sql, desc } from 'drizzle-orm';
import { logger } from '@/lib/logger';

export interface AdminData {
  email: string;
  phone: string;
  full_name: string;
  employee_id?: string;
}

/**
 * List all admins with filters
 */
export async function listAdmins(params: {
  page?: number;
  limit?: number;
  search?: string;
  includeCommittee?: boolean;
}) {
  try {
    const page = params.page || 1;
    const limit = params.limit || 50;
    const offset = (page - 1) * limit;
    const includeCommittee = params.includeCommittee || false;

    const whereConditions: any[] = [];

    if (params.search) {
      whereConditions.push(
        or(
          ilike(users.full_name, `%${params.search}%`),
          ilike(users.email, `%${params.search}%`),
          ilike(admin_profiles.employee_id, `%${params.search}%`)
        )
      );
    }

    const roleFilter = includeCommittee
      ? or(
        eq(roles.name, 'admin'),
        eq(roles.name, 'super_admin'),
        eq(roles.name, 'snr_admin'),
        eq(roles.name, 'committee'),
      )
      : or(
        eq(roles.name, 'admin'),
        eq(roles.name, 'super_admin'),
        eq(roles.name, 'snr_admin')
      );

    const adminsData = await db
      .select({
        user_id: users.id,
        email: users.email,
        full_name: users.full_name,
        phone: users.phone,
        is_active: users.is_active,
        role_name: roles.name,
        admin_id: admin_profiles.id,
        employee_id: admin_profiles.employee_id,
        created_at: users.created_at,
      })
      .from(users)
      .innerJoin(roles, eq(users.role_id, roles.id))
      .innerJoin(admin_profiles, eq(users.id, admin_profiles.user_id))
      .where(
        and(
          roleFilter,
          whereConditions.length > 0 ? and(...whereConditions) : undefined
        )
      )
      .orderBy(desc(users.created_at))
      .limit(limit)
      .offset(offset);

    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(users)
      .innerJoin(roles, eq(users.role_id, roles.id))
      .innerJoin(admin_profiles, eq(users.id, admin_profiles.user_id))
      .where(
        and(
          roleFilter,
          whereConditions.length > 0 ? and(...whereConditions) : undefined
        )
      );

    return {
      admins: adminsData,
      pagination: {
        page,
        limit,
        total: count,
        totalPages: Math.ceil(count / limit),
      },
    };
  } catch (error) {
    logger.error({ error }, 'Error listing admins');
    throw error;
  }
}

/**
 * Create admin user
 */
export async function createAdmin(data: AdminData) {
  try {
    let userId: string;

    await db.transaction(async (tx) => {
      // Get admin role
      const [adminRole] = await tx
        .select({ id: roles.id })
        .from(roles)
        .where(eq(roles.name, 'admin'))
        .limit(1);

      if (!adminRole) {
        throw new Error('Admin role not found');
      }

      // Check if user exists
      let [user] = await tx
        .select()
        .from(users)
        .where(eq(users.email, data.email))
        .limit(1);

      if (user) {
        // Check if user already has an admin profile
        const [existingAdmin] = await tx
          .select({ id: admin_profiles.id })
          .from(admin_profiles)
          .where(eq(admin_profiles.user_id, user.id))
          .limit(1);

        if (existingAdmin) {
          throw new Error('Admin profile already exists for this user');
        }

        // Update user details if provided
        await tx
          .update(users)
          .set({
            full_name: data.full_name,
            phone: data.phone,
            role_id: adminRole.id, // Ensure they have admin role
            updated_at: new Date(),
          })
          .where(eq(users.id, user.id));
      } else {
        // Create new user
        [user] = await tx
          .insert(users)
          .values({
            external_id: `manual_admin_${Date.now()}_${Math.random()}`,
            email: data.email,
            phone: data.phone,
            full_name: data.full_name,
            role_id: adminRole.id,
            is_active: true,
          })
          .returning();
      }

      userId = user.id;

      // Create admin profile
      await tx
        .insert(admin_profiles)
        .values({
          user_id: userId,
          employee_id: data.employee_id || null,
        });
    });

    logger.info({ email: data.email }, 'Admin created');
    return userId!;
  } catch (error) {
    logger.error({ error, email: data.email }, 'Error creating admin');
    throw error;
  }
}

/**
 * Deactivate admin
 */
export async function deactivateAdmin(userId: string) {
  try {
    await db
      .update(users)
      .set({ is_active: false, updated_at: new Date() })
      .where(eq(users.id, userId));

    logger.info({ userId }, 'Admin deactivated');
  } catch (error) {
    logger.error({ error, userId }, 'Error deactivating admin');
    throw error;
  }
}

/**
 * Update admin role
 */
export async function updateAdminRole(userId: string, roleName: string) {
  try {
    const [role] = await db
      .select({ id: roles.id })
      .from(roles)
      .where(eq(roles.name, roleName))
      .limit(1);

    if (!role) {
      throw new Error(`Role ${roleName} not found`);
    }

    await db
      .update(users)
      .set({ role_id: role.id, updated_at: new Date() })
      .where(eq(users.id, userId));

    logger.info({ userId, roleName }, 'Admin role updated');
  } catch (error) {
    logger.error({ error, userId, roleName }, 'Error updating admin role');
    throw error;
  }
}
