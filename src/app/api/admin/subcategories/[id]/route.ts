/**
 * Admin - Subcategory Management - Individual
 * 
 * GET /api/admin/subcategories/[id] - Get subcategory details
 * PATCH /api/admin/subcategories/[id] - Update subcategory
 * DELETE /api/admin/subcategories/[id] - Delete subcategory
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth/helpers';
import { db, subcategories } from '@/db';
import { eq } from 'drizzle-orm';
import { logger } from '@/lib/logger';
import { z } from 'zod';

const UpdateSubcategorySchema = z.object({
  name: z.string().min(1).max(100).optional(),
  slug: z.string().min(1).max(100).optional(),
  description: z.string().max(500).nullable().optional(),
  sla_hours: z.number().int().positive().nullable().optional(),
  is_active: z.boolean().optional(),
});

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await requireRole(['admin', 'super_admin']);

    const id = parseInt(params.id, 10);
    if (isNaN(id)) {
      return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });
    }

    const [subcategory] = await db
      .select()
      .from(subcategories)
      .where(eq(subcategories.id, id))
      .limit(1);

    if (!subcategory) {
      return NextResponse.json({ error: 'Subcategory not found' }, { status: 404 });
    }

    return NextResponse.json(subcategory);
  } catch (error: any) {
    logger.error({ error: error.message }, 'Error fetching subcategory');
    return NextResponse.json(
      { error: error.message || 'Failed to fetch subcategory' },
      { status: error.message.includes('Unauthorized') ? 401 : 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await requireRole(['super_admin']);

    const id = parseInt(params.id, 10);
    if (isNaN(id)) {
      return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });
    }

    const body = await request.json();
    const parsed = UpdateSubcategorySchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: parsed.error.issues },
        { status: 400 }
      );
    }

    const [subcategory] = await db
      .update(subcategories)
      .set(parsed.data)
      .where(eq(subcategories.id, id))
      .returning();

    if (!subcategory) {
      return NextResponse.json({ error: 'Subcategory not found' }, { status: 404 });
    }

    logger.info({ id }, 'Subcategory updated');
    return NextResponse.json(subcategory);
  } catch (error: any) {
    logger.error({ error: error.message }, 'Error updating subcategory');
    return NextResponse.json(
      { error: error.message || 'Failed to update subcategory' },
      { status: error.message.includes('Unauthorized') ? 401 : 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await requireRole(['super_admin']);

    const id = parseInt(params.id, 10);
    if (isNaN(id)) {
      return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });
    }

    await db
      .update(subcategories)
      .set({ is_active: false })
      .where(eq(subcategories.id, id));

    logger.info({ id }, 'Subcategory deleted');
    return NextResponse.json({ success: true });
  } catch (error: any) {
    logger.error({ error: error.message }, 'Error deleting subcategory');
    return NextResponse.json(
      { error: error.message || 'Failed to delete subcategory' },
      { status: error.message.includes('Unauthorized') ? 401 : 500 }
    );
  }
}
