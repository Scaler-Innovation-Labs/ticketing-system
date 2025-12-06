/**
 * Admin - Subcategory Management
 * 
 * GET /api/admin/subcategories - List all subcategories
 * POST /api/admin/subcategories - Create new subcategory
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth/helpers';
import { db } from '@/db';
import { subcategories, categories } from '@/db';
import { eq, desc } from 'drizzle-orm';
import { logger } from '@/lib/logger';
import { z } from 'zod';

const CreateSubcategorySchema = z.object({
  category_id: z.number().int().positive(),
  name: z.string().min(1).max(100),
  slug: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  sla_hours: z.number().int().positive().optional(),
});

export async function GET(request: NextRequest) {
  try {
    await requireRole(['admin', 'super_admin']);

    const searchParams = request.nextUrl.searchParams;
    const categoryId = searchParams.get('category_id');

    let query = db
      .select({
        id: subcategories.id,
        category_id: subcategories.category_id,
        category_name: categories.name,
        name: subcategories.name,
        slug: subcategories.slug,
        description: subcategories.description,
        sla_hours: subcategories.sla_hours,
        is_active: subcategories.is_active,
        created_at: subcategories.created_at,
      })
      .from(subcategories)
      .innerJoin(categories, eq(subcategories.category_id, categories.id))
      .$dynamic();

    if (categoryId) {
      query = query.where(eq(subcategories.category_id, parseInt(categoryId, 10)));
    }

    const data = await query.orderBy(desc(subcategories.created_at));

    return NextResponse.json({ subcategories: data });
  } catch (error: any) {
    logger.error({ error: error.message }, 'Error listing subcategories');
    return NextResponse.json(
      { error: error.message || 'Failed to list subcategories' },
      { status: error.message.includes('Unauthorized') ? 401 : 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireRole(['super_admin']);

    const body = await request.json();
    const parsed = CreateSubcategorySchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: parsed.error.issues },
        { status: 400 }
      );
    }

    // Verify category exists
    const [category] = await db
      .select({ id: categories.id })
      .from(categories)
      .where(eq(categories.id, parsed.data.category_id))
      .limit(1);

    if (!category) {
      return NextResponse.json(
        { error: 'Category not found' },
        { status: 404 }
      );
    }

    const [subcategory] = await db
      .insert(subcategories)
      .values(parsed.data)
      .returning();

    logger.info({ id: subcategory.id }, 'Subcategory created');
    return NextResponse.json(subcategory, { status: 201 });
  } catch (error: any) {
    logger.error({ error: error.message }, 'Error creating subcategory');
    return NextResponse.json(
      { error: error.message || 'Failed to create subcategory' },
      { status: error.message.includes('Unauthorized') ? 401 : 500 }
    );
  }
}
