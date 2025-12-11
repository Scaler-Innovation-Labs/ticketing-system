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
import { eq, desc, asc, and } from 'drizzle-orm';
import { logger } from '@/lib/logger';
import { z } from 'zod';

const CreateSubcategorySchema = z.object({
  category_id: z.number().int().positive(),
  name: z.string().min(1).max(100),
  slug: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  sla_hours: z.number().int().positive().optional(),
  display_order: z.number().int().default(0).optional(),
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

    // Filter by category_id and is_active
    const conditions = [eq(subcategories.is_active, true)];
    if (categoryId) {
      conditions.push(eq(subcategories.category_id, parseInt(categoryId, 10)));
    }
    query = query.where(and(...conditions));

    // Order by display_order, then by created_at
    const subcats = await query.orderBy(asc(subcategories.display_order), desc(subcategories.created_at));

    if (includeFields && subcats.length > 0) {
      const { category_fields, field_options } = await import('@/db/schema-tickets');
      const { inArray } = await import('drizzle-orm');

      const subcatIds = subcats.map(s => s.id);

      // Fetch fields (only active ones) with subcategory assigned_admin_id
      const fields = await db
        .select({
          id: category_fields.id,
          subcategory_id: category_fields.subcategory_id,
          name: category_fields.name,
          slug: category_fields.slug,
          field_type: category_fields.field_type,
          required: category_fields.required,
          placeholder: category_fields.placeholder,
          validation: category_fields.validation,
          display_order: category_fields.display_order,
          is_active: category_fields.is_active,
          created_at: category_fields.created_at,
          updated_at: category_fields.updated_at,
          assigned_admin_id: subcategories.assigned_admin_id, // Get from subcategory since fields inherit
        })
        .from(category_fields)
        .leftJoin(subcategories, eq(category_fields.subcategory_id, subcategories.id))
        .where(and(
          inArray(category_fields.subcategory_id, subcatIds),
          eq(category_fields.is_active, true)
        ))
        .orderBy(asc(category_fields.display_order), desc(category_fields.created_at));

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
  let body: any = null;
  try {
    await requireRole(['super_admin']);

    body = await request.json();
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

    // Check for duplicate slug within the same category
    const existing = await db
      .select({ id: subcategories.id })
      .from(subcategories)
      .where(
        and(
          eq(subcategories.category_id, parsed.data.category_id),
          eq(subcategories.slug, parsed.data.slug),
          eq(subcategories.is_active, true)
        )
      )
      .limit(1);

    if (existing.length > 0) {
      return NextResponse.json(
        { error: `A subcategory with slug "${parsed.data.slug}" already exists in this category` },
        { status: 409 }
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
    
    // Handle unique constraint violations
    if (error.message?.includes('unique') || error.code === '23505') {
      const slug = body?.slug || 'unknown';
      return NextResponse.json(
        { error: `A subcategory with slug "${slug}" already exists in this category` },
        { status: 409 }
      );
    }
    
    return NextResponse.json(
      { error: error.message || 'Failed to create subcategory' },
      { status: error.message.includes('Unauthorized') ? 401 : 500 }
    );
  }
}
