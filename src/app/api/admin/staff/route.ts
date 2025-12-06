import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth/helpers';
import { db } from '@/db';
import { users, roles, domains, scopes, admin_profiles } from '@/db';
import { eq, and, or, like } from 'drizzle-orm';
import { z } from 'zod';

/**
 * GET /api/admin/staff
 * List all staff members (admins, wardens, committee members)
 */
export async function GET(request: Request) {
  try {
    await requireRole(['super_admin', 'admin']);

    const { searchParams } = new URL(request.url);
    const roleFilter = searchParams.get('role');
    const search = searchParams.get('search');

    // Build query
    const conditions = [];

    // Filter by role if specified
    if (roleFilter) {
      const role = await db
        .select({ id: roles.id })
        .from(roles)
        .where(eq(roles.name, roleFilter))
        .limit(1);

      if (role[0]) {
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

    // Get staff members
    const staff = await db
      .select({
        id: users.id,
        email: users.email,
        phone: users.phone,
        full_name: users.full_name,
        avatar_url: users.avatar_url,
        role_id: users.role_id,
        role_name: roles.name,
        created_at: users.created_at,
      })
      .from(users)
      .leftJoin(roles, eq(users.role_id, roles.id))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(users.full_name);

    return NextResponse.json(staff);
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
    await requireRole(['super_admin']);

    const body = await request.json();
    const data = CreateStaffSchema.parse(body);

    let userId = data.clerkUserId;

    // 1. Handle User Creation/Retrieval
    if (data.newUser) {
      // Check if user exists
      const existingUser = await db.query.users.findFirst({
        where: eq(users.email, data.newUser.email),
      });

      if (existingUser) {
        return NextResponse.json({ error: 'User with this email already exists' }, { status: 409 });
      }

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
