import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth/helpers';
import { db } from '@/db';
import { users, roles, domains, scopes, admin_profiles } from '@/db';
import { eq, and, or, like, inArray } from 'drizzle-orm';
import { z } from 'zod';

/**
 * GET /api/admin/staff
 * List all staff members (admins, wardens, committee members)
 */
export async function GET(request: Request) {
  try {
    await requireRole(['super_admin', 'snr_admin', 'admin']);

    const { searchParams } = new URL(request.url);
    const roleFilter = searchParams.get('role');
    const search = searchParams.get('search');

    // Build query
    const conditions = [];

    // Filter by admin roles (admin, snr_admin, super_admin) by default
    const adminRoleNames = ['admin', 'snr_admin', 'super_admin'];
    const adminRoles = await db
      .select({ id: roles.id, name: roles.name })
      .from(roles)
      .where(or(...adminRoleNames.map(name => eq(roles.name, name))));

    const adminRoleIds = adminRoles.map(r => r.id);
    if (adminRoleIds.length > 0) {
      conditions.push(inArray(users.role_id, adminRoleIds));
    }

    // Filter by specific role if specified (overrides default admin filter)
    if (roleFilter) {
      const role = await db
        .select({ id: roles.id })
        .from(roles)
        .where(eq(roles.name, roleFilter))
        .limit(1);

      if (role[0]) {
        // Replace admin filter with specific role filter
        conditions.pop(); // Remove admin filter
        conditions.push(eq(users.role_id, role[0].id));
      }
    }

    // Search filter
    if (search) {
      conditions.push(
        or(
          like(users.full_name, `%${search}%`),
          like(users.email, `%${search}%`),
          like(users.phone, `%${search}%`)
        )
      );
    }

    // Get staff members with admin_profiles join for slack_user_id
    const staff = await db
      .select({
        id: users.id,
        email: users.email,
        phone: users.phone,
        full_name: users.full_name,
        avatar_url: users.avatar_url,
        role_id: users.role_id,
        role_name: roles.name,
        slack_user_id: admin_profiles.slack_user_id,
        created_at: users.created_at,
      })
      .from(users)
      .leftJoin(roles, eq(users.role_id, roles.id))
      .leftJoin(admin_profiles, eq(users.id, admin_profiles.user_id))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(users.full_name);

    // Transform to match expected format
    const staffFormatted = staff.map(s => ({
      id: s.id,
      email: s.email,
      phone: s.phone,
      fullName: s.full_name,
      avatarUrl: s.avatar_url,
      roleId: s.role_id,
      roleName: s.role_name,
      slackUserId: s.slack_user_id,
      createdAt: s.created_at,
    }));

    return NextResponse.json({ staff: staffFormatted });
  } catch (error) {
    if (error instanceof Error && error.message.includes('Unauthorized')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

const CreateStaffSchema = z.object({
  domain: z.string().nullable(),
  scope: z.string().nullable(),
  role: z.string(),
  slackUserId: z.string().nullable(),
  whatsappNumber: z.string().nullable(),
  clerkUserId: z.string().optional().nullable(),
  newUser: z.object({
    email: z.string().email(),
    firstName: z.string(),
    lastName: z.string(),
    phone: z.string().nullable(),
  }).optional(),
});

export async function POST(request: Request) {
  try {
    await requireRole(['super_admin', 'snr_admin']);

    const body = await request.json();
    const data = CreateStaffSchema.parse(body);

    let userId = data.clerkUserId;

    // 1. Handle User Creation/Retrieval (upsert if already exists)
    if (data.newUser) {
      // Check if user exists
      const existingUser = await db.query.users.findFirst({
        where: eq(users.email, data.newUser.email),
      });

      if (existingUser) {
        // Reuse existing user instead of failing with 409
        userId = existingUser.id;
        // Optionally update basic info
        await db.update(users)
          .set({
            full_name: `${data.newUser.firstName} ${data.newUser.lastName}`,
            phone: data.newUser.phone || existingUser.phone,
            is_active: true,
            updated_at: new Date(),
          })
          .where(eq(users.id, userId));
      } else {
        // Create new user
        const [newUser] = await db.insert(users).values({
          email: data.newUser.email,
          full_name: `${data.newUser.firstName} ${data.newUser.lastName}`,
          phone: data.newUser.phone,
          external_id: `pending_${Date.now()}_${Math.random().toString(36).substring(7)}`, // Placeholder
          auth_provider: 'clerk',
          is_active: true,
        }).returning();

        userId = newUser.id;
      }
    } else if (!userId) {
      return NextResponse.json({ error: 'User ID or New User details required' }, { status: 400 });
    }

    // 2. Resolve IDs
    const [role] = await db.select().from(roles).where(eq(roles.name, data.role)).limit(1);
    if (!role) return NextResponse.json({ error: 'Invalid role' }, { status: 400 });

    let domainId = null;
    if (data.domain) {
      const [domain] = await db.select().from(domains).where(eq(domains.name, data.domain)).limit(1);
      if (domain) domainId = domain.id;
    }

    let scopeId = null;
    if (data.scope) {
      const [scope] = await db.select().from(scopes).where(eq(scopes.name, data.scope)).limit(1);
      if (scope) scopeId = scope.id;
    }

    // 3. Update User Role
    await db.update(users)
      .set({
        role_id: role.id,
        phone: data.whatsappNumber || undefined, // Update phone if provided
        updated_at: new Date(),
      })
      .where(eq(users.id, userId));

    // 4. Upsert Admin Profile
    await db.insert(admin_profiles)
      .values({
        user_id: userId,
        slack_user_id: data.slackUserId,
        primary_domain_id: domainId,
        primary_scope_id: scopeId,
      })
      .onConflictDoUpdate({
        target: admin_profiles.user_id,
        set: {
          slack_user_id: data.slackUserId,
          primary_domain_id: domainId,
          primary_scope_id: scopeId,
          updated_at: new Date(),
        },
      });

    return NextResponse.json({ success: true, userId }, { status: 201 });

  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation Error', details: error.issues }, { status: 400 });
    }
    if (error instanceof Error && error.message.includes('Unauthorized')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }
    console.error('Create Staff Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

const UpdateStaffSchema = z.object({
  id: z.string().uuid(),
  domain: z.string().nullable(),
  scope: z.string().nullable(),
  role: z.string(),
  slackUserId: z.string().nullable(),
  whatsappNumber: z.string().nullable(),
});

/**
 * PATCH /api/admin/staff
 * Update an existing staff member
 */
export async function PATCH(request: Request) {
  try {
    await requireRole(['super_admin', 'snr_admin', 'admin']);

    const body = await request.json();
    const data = UpdateStaffSchema.parse(body);

    // Verify user exists
    const [existingUser] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.id, data.id))
      .limit(1);

    if (!existingUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Resolve IDs
    const [role] = await db.select().from(roles).where(eq(roles.name, data.role)).limit(1);
    if (!role) return NextResponse.json({ error: 'Invalid role' }, { status: 400 });

    let domainId = null;
    if (data.domain) {
      const [domain] = await db.select().from(domains).where(eq(domains.name, data.domain)).limit(1);
      if (domain) domainId = domain.id;
    }

    let scopeId = null;
    if (data.scope) {
      const [scope] = await db.select().from(scopes).where(eq(scopes.name, data.scope)).limit(1);
      if (scope) scopeId = scope.id;
    }

    // Update User Role and Phone
    await db.update(users)
      .set({
        role_id: role.id,
        phone: data.whatsappNumber || undefined,
        updated_at: new Date(),
      })
      .where(eq(users.id, data.id));

    // Upsert Admin Profile
    await db.insert(admin_profiles)
      .values({
        user_id: data.id,
        slack_user_id: data.slackUserId,
        primary_domain_id: domainId,
        primary_scope_id: scopeId,
      })
      .onConflictDoUpdate({
        target: admin_profiles.user_id,
        set: {
          slack_user_id: data.slackUserId,
          primary_domain_id: domainId,
          primary_scope_id: scopeId,
          updated_at: new Date(),
        },
      });

    return NextResponse.json({ success: true }, { status: 200 });

  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation Error', details: error.issues }, { status: 400 });
    }
    if (error instanceof Error && error.message.includes('Unauthorized')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }
    console.error('Update Staff Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}