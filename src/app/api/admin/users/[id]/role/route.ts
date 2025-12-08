/**
 * Super Admin - User Role Management
 * 
 * PATCH /api/admin/users/[id]/role - Update user role
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth/helpers';
import { updateAdminRole } from '@/lib/admin/admin-service';
import { logger } from '@/lib/logger';
import { z } from 'zod';

const UpdateRoleSchema = z.object({
  role: z.enum(['student', 'admin', 'super_admin', 'committee']),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireRole(['super_admin']);

    const { id } = await params;
    const body = await request.json();
    const parsed = UpdateRoleSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: parsed.error.issues },
        { status: 400 }
      );
    }

    await updateAdminRole(id, parsed.data.role);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    logger.error({ error: error.message }, 'Error updating role');
    return NextResponse.json(
      { error: error.message || 'Failed to update role' },
      { status: error.message.includes('not found') ? 404 : 500 }
    );
  }
}
