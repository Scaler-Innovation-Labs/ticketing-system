/**
 * Super Admin - Admin Management
 * 
 * GET /api/admin/list - List all admins
 * POST /api/admin/list - Create new admin
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth/helpers';
import { listAdmins, createAdmin } from '@/lib/admin/admin-service';
import { logger } from '@/lib/logger';
import { z } from 'zod';

const CreateAdminSchema = z.object({
  email: z.string().email(),
  phone: z.string().min(10).max(15),
  full_name: z.string().min(1).max(255),
  designation: z.string().max(100).optional(),
  department: z.string().max(100).optional(),
  employee_id: z.string().max(50).optional(),
  specialization: z.string().optional(),
});

export async function GET(request: NextRequest) {
  try {
    await requireRole(['admin', 'super_admin']);

    const searchParams = request.nextUrl.searchParams;
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '50', 10);
    const search = searchParams.get('search') || undefined;

    const result = await listAdmins({ page, limit, search });

    return NextResponse.json(result);
  } catch (error: any) {
    logger.error({ error: error.message }, 'Error listing admins');
    return NextResponse.json(
      { error: error.message || 'Failed to list admins' },
      { status: error.message.includes('Unauthorized') ? 401 : 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireRole(['super_admin']);

    const body = await request.json();
    const parsed = CreateAdminSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: parsed.error.issues },
        { status: 400 }
      );
    }

    const userId = await createAdmin(parsed.data);

    return NextResponse.json({ id: userId }, { status: 201 });
  } catch (error: any) {
    logger.error({ error: error.message }, 'Error creating admin');
    return NextResponse.json(
      { error: error.message || 'Failed to create admin' },
      { status: 500 }
    );
  }
}
