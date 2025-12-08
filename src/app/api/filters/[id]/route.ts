/**
 * Ticket Filters Management - Individual
 * 
 * PATCH /api/filters/[id] - Update filter
 * DELETE /api/filters/[id] - Delete filter
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/helpers';
import { updateFilter, deleteFilter } from '@/lib/filter/filter-service';
import { logger } from '@/lib/logger';
import { z } from 'zod';

const UpdateFilterSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  filter_config: z.record(z.string(), z.any()).optional(),
  is_default: z.boolean().optional(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { dbUser } = await getCurrentUser();

    const { id: idStr } = await params;
    const id = parseInt(idStr, 10);
    if (isNaN(id)) {
      return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });
    }

    const body = await request.json();
    const parsed = UpdateFilterSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: parsed.error.issues },
        { status: 400 }
      );
    }

    const filter = await updateFilter(id, dbUser.id, parsed.data);

    return NextResponse.json(filter);
  } catch (error: any) {
    logger.error({ error: error.message }, 'Error updating filter');
    return NextResponse.json(
      { error: error.message || 'Failed to update filter' },
      { status: error.message.includes('not found') ? 404 : 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { dbUser } = await getCurrentUser();

    const { id: idStr } = await params;
    const id = parseInt(idStr, 10);
    if (isNaN(id)) {
      return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });
    }

    await deleteFilter(id, dbUser.id);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    logger.error({ error: error.message }, 'Error deleting filter');
    return NextResponse.json(
      { error: error.message || 'Failed to delete filter' },
      { status: 500 }
    );
  }
}
