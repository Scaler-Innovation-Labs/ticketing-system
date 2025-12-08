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
    const includeFields = searchParams.get('include_fields') === 'true';

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
        assigned_admin_id: subcategories.assigned_admin_id,
        display_order: subcategories.display_order,
      })
      .from(subcategories)
      .innerJoin(categories, eq(subcategories.category_id, categories.id))
      .$dynamic();

    if (categoryId) {
      query = query.where(eq(subcategories.category_id, parseInt(categoryId, 10)));
    }

    const subcats = await query.orderBy(desc(subcategories.created_at));

    if (includeFields && subcats.length > 0) {
      const { category_fields, field_options } = await import('@/db/schema-tickets');
      const { inArray } = await import('drizzle-orm');

      const subcatIds = subcats.map(s => s.id);

      // Fetch fields
      const fields = await db
        .select()
        .from(category_fields)
        .where(inArray(category_fields.subcategory_id, subcatIds))
        .orderBy(category_fields.display_order);

      // Fetch options for fields
      const fieldIds = fields.map(f => f.id);
      let options: any[] = [];

      if (fieldIds.length > 0) {
        options = await db
          .select()
          .from(field_options)
          .where(inArray(field_options.field_id, fieldIds))
          .orderBy(field_options.display_order);
      }

      // Map options to fields
      const fieldsWithOptions = fields.map(field => ({
        ...field,
        options: options.filter(o => o.field_id === field.id),
      }));

      // Map fields to subcategories
      const result = subcats.map(sub => ({
        ...sub,
        fields: fieldsWithOptions.filter(f => f.subcategory_id === sub.id),
      }));

      return NextResponse.json({ subcategories: result });
    }

    return NextResponse.json({ subcategories: subcats });
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
