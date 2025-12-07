/**
 * Admin Categories API
 * 
 * GET /api/admin/categories - List all categories (with stats)
 * POST /api/admin/categories - Create new category
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireRole } from '@/lib/auth/helpers';
import { getActiveCategories, getAllCategories, createCategory } from '@/lib/category/category-service';
import { logger } from '@/lib/logger';

const CreateCategorySchema = z.object({
  name: z.string().min(1).max(100),
  slug: z.string().min(1).max(100),
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

export async function GET(request: NextRequest) {
  try {
    await requireRole(['admin', 'super_admin']);

    const { searchParams } = new URL(request.url);
    const includeFields = searchParams.get('include_fields') === 'true';

    const categories = await getAllCategories(includeFields);

    return NextResponse.json({ categories });
  } catch (error: any) {
    logger.error({ error: error.message }, 'Error fetching admin categories');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireRole(['super_admin']);

    const body = await request.json();
    const parsed = CreateCategorySchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request data', details: parsed.error.format() },
        { status: 400 }
      );
    }

    const category = await createCategory(parsed.data);

    return NextResponse.json({ category }, { status: 201 });
  } catch (error: any) {
    logger.error({ error: error.message }, 'Error creating category');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
