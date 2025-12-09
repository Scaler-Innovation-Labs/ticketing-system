/**
 * Admin - Dynamic Field Management
 * 
 * GET /api/admin/fields - List all fields
 * POST /api/admin/fields - Create new field
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth/helpers';
import { db, category_fields, field_options, subcategories } from '@/db';
import { eq, desc, asc, and } from 'drizzle-orm';
import { logger } from '@/lib/logger';
import { z } from 'zod';

const CreateFieldSchema = z.object({
  subcategory_id: z.number().int().positive(),
  name: z.string().min(1).max(100),
  slug: z.string().min(1).max(100).optional(),
  field_type: z.enum(['text', 'textarea', 'number', 'date', 'select', 'multiselect', 'multi_select', 'file', 'upload', 'boolean']),
  required: z.boolean().default(false),
  placeholder: z.string().max(255).optional().nullable(),
  validation: z.record(z.string(), z.any()).optional().nullable(),
  validation_rules: z.record(z.string(), z.any()).optional().nullable(), // Accept validation_rules as alias
  help_text: z.string().optional().nullable(), // Accept but don't store (not in schema)
  display_order: z.number().int().default(0),
  assigned_admin_id: z.string().uuid().optional().nullable(), // Accept but don't store (not in schema)
  options: z.array(z.object({
    label: z.string(),
    value: z.string(),
  })).optional(),
});

export async function GET(request: NextRequest) {
  try {
    await requireRole(['admin', 'super_admin']);

    const searchParams = request.nextUrl.searchParams;
    const subcategoryId = searchParams.get('subcategory_id');

    let query = db
      .select({
        id: category_fields.id,
        subcategory_id: category_fields.subcategory_id,
        subcategory_name: subcategories.name,
        name: category_fields.name,
        slug: category_fields.slug,
        field_type: category_fields.field_type,
        required: category_fields.required,
        placeholder: category_fields.placeholder,
        validation: category_fields.validation,
        display_order: category_fields.display_order,
        is_active: category_fields.is_active,
        created_at: category_fields.created_at,
      })
      .from(category_fields)
      .innerJoin(subcategories, eq(category_fields.subcategory_id, subcategories.id))
      .$dynamic();

    // Filter by is_active and optionally by subcategory_id
    const conditions = [eq(category_fields.is_active, true)];
    if (subcategoryId) {
      conditions.push(eq(category_fields.subcategory_id, parseInt(subcategoryId, 10)));
    }
    query = query.where(and(...conditions));

    // Order by display_order, then by created_at
    const fields = await query.orderBy(asc(category_fields.display_order), desc(category_fields.created_at));

    // Fetch options for select/multiselect fields
    const fieldIds = fields.map(f => f.id);
    const { inArray: inArrayOptions } = await import('drizzle-orm');
    const options = fieldIds.length > 0 ? await db
      .select()
      .from(field_options)
      .where(inArrayOptions(field_options.field_id, fieldIds))
      .orderBy(asc(field_options.display_order))
      : [];

    // Group options by field_id
    const optionsByField = options.reduce((acc, opt) => {
      if (!acc[opt.field_id]) acc[opt.field_id] = [];
      acc[opt.field_id].push(opt);
      return acc;
    }, {} as Record<number, typeof options>);

    const fieldsWithOptions = fields.map(field => ({
      ...field,
      options: optionsByField[field.id] || [],
    }));

    return NextResponse.json({ fields: fieldsWithOptions });
  } catch (error: any) {
    logger.error({ error: error.message }, 'Error listing fields');
    return NextResponse.json(
      { error: error.message || 'Failed to list fields' },
      { status: error.message.includes('Unauthorized') ? 401 : 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  let body: any = null;
  try {
    await requireRole(['super_admin']);

    try {
      body = await request.json();
    } catch (error) {
      return NextResponse.json(
        { error: 'Invalid JSON in request body' },
        { status: 400 }
      );
    }

    const parsed = CreateFieldSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: parsed.error.issues },
        { status: 400 }
      );
    }

    // Verify subcategory exists
    const [subcategory] = await db
      .select({ id: subcategories.id })
      .from(subcategories)
      .where(eq(subcategories.id, parsed.data.subcategory_id))
      .limit(1);

    if (!subcategory) {
      return NextResponse.json(
        { error: 'Subcategory not found' },
        { status: 404 }
      );
    }

    // Use provided slug or generate from name
    const slug = parsed.data.slug || parsed.data.name.toLowerCase().replace(/\s+/g, '-');
    
    // Check for duplicate slug within the same subcategory
    const existing = await db
      .select({ id: category_fields.id })
      .from(category_fields)
      .where(
        and(
          eq(category_fields.subcategory_id, parsed.data.subcategory_id),
          eq(category_fields.slug, slug),
          eq(category_fields.is_active, true)
        )
      )
      .limit(1);

    if (existing.length > 0) {
      return NextResponse.json(
        { error: `A field with slug "${slug}" already exists in this subcategory` },
        { status: 409 }
      );
    }

    let fieldId: number;

    await db.transaction(async (tx) => {
      // Use validation_rules if provided, otherwise use validation
      const validation = parsed.data.validation_rules || parsed.data.validation || null;
      
      // Create field
      const [field] = await tx
        .insert(category_fields)
        .values({
          subcategory_id: parsed.data.subcategory_id,
          name: parsed.data.name,
          slug: slug,
          field_type: parsed.data.field_type,
          required: parsed.data.required,
          placeholder: parsed.data.placeholder || null,
          validation: validation,
          display_order: parsed.data.display_order,
        })
        .returning();

      fieldId = field.id;

      // Create options if provided
      if (parsed.data.options && parsed.data.options.length > 0) {
        await tx.insert(field_options).values(
          parsed.data.options.map((opt, idx) => ({
            field_id: fieldId,
            label: opt.label,
            value: opt.value,
            display_order: idx,
          }))
        );
      }
    });

    logger.info({ id: fieldId! }, 'Field created');
    return NextResponse.json({ id: fieldId! }, { status: 201 });
  } catch (error: any) {
    logger.error({ error: error.message }, 'Error creating field');
    
    // Handle unique constraint violations
    if (error.message?.includes('unique') || error.code === '23505') {
      const slug = body?.slug || body?.name?.toLowerCase().replace(/\s+/g, '-') || 'unknown';
      return NextResponse.json(
        { error: `A field with slug "${slug}" already exists in this subcategory` },
        { status: 409 }
      );
    }
    
    return NextResponse.json(
      { error: error.message || 'Failed to create field' },
      { status: error.message.includes('Unauthorized') ? 401 : 500 }
    );
  }
}
