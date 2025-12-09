/**
 * Admin Category Management - Individual Category
 * 
 * GET /api/admin/categories/[id] - Get category details
 * PATCH /api/admin/categories/[id] - Update category
 * DELETE /api/admin/categories/[id] - Soft delete category
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireRole } from '@/lib/auth/helpers';
import { getCategorySchema, updateCategory, deleteCategory } from '@/lib/category/category-service';
import { logger } from '@/lib/logger';
import { invalidateCategoryCaches } from '@/lib/cache/cache-utils';

const UpdateCategorySchema = z.object({
  name: z.string().min(1).max(100).optional(),
  slug: z.string().min(1).max(100).optional(),
  description: z.string().optional(),
  icon: z.string().max(50).optional(),
  color: z.string().max(20).optional(),
  domain_id: z.number().int().positive().optional(),
  scope_id: z.number().int().positive().optional(),
  scope_mode: z.enum(['fixed', 'dynamic', 'none']).optional(),
  default_admin_id: z.string().uuid().optional(),
  sla_hours: z.number().int().positive().optional(),
  display_order: z.number().int().optional(),
  is_active: z.boolean().optional(),
});

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireRole(['admin', 'super_admin']);
    const { id } = await params;
    const categoryId = Number(id);

    if (isNaN(categoryId)) {
      return NextResponse.json({ error: 'Invalid category ID' }, { status: 400 });
    }

    const schema = await getCategorySchema(categoryId);

    if (!schema) {
      return NextResponse.json({ error: 'Category not found' }, { status: 404 });
    }

    return NextResponse.json(schema);
  } catch (error: any) {
    logger.error({ error: error.message }, 'Error fetching category');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireRole(['admin', 'snr_admin', 'super_admin']);
    const { id } = await params;
    const categoryId = Number(id);

    if (isNaN(categoryId)) {
      return NextResponse.json({ error: 'Invalid category ID' }, { status: 400 });
    }

    const body = await request.json();
    const parsed = UpdateCategorySchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request data', details: parsed.error.format() },
        { status: 400 }
      );
    }

    const category = await updateCategory(categoryId, parsed.data);

    if (!category) {
      return NextResponse.json({ error: 'Category not found' }, { status: 404 });
    }

    // Invalidate category caches after update
    invalidateCategoryCaches();

    return NextResponse.json({ category });
  } catch (error: any) {
    logger.error({ error: error.message }, 'Error updating category');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireRole(['admin', 'snr_admin', 'super_admin']);
    const { id } = await params;
    const categoryId = Number(id);

    if (isNaN(categoryId)) {
      return NextResponse.json({ error: 'Invalid category ID' }, { status: 400 });
    }

    const category = await deleteCategory(categoryId);

    if (!category) {
      return NextResponse.json({ error: 'Category not found' }, { status: 404 });
    }

    // Invalidate category caches after deletion
    invalidateCategoryCaches();

    return NextResponse.json({ message: 'Category deleted successfully' });
  } catch (error: any) {
    logger.error({ error: error.message }, 'Error deleting category');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
