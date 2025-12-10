/**
 * Admin - Field Management - Individual
 * 
 * GET /api/admin/fields/[id] - Get field details
 * PATCH /api/admin/fields/[id] - Update field
 * DELETE /api/admin/fields/[id] - Delete field
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth/helpers';
import { getFieldById, updateField, deleteField, updateFieldOptions } from '@/lib/field/field-service';
import { logger } from '@/lib/logger';
import { z } from 'zod';

const UpdateFieldSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  slug: z.string().min(1).max(100).optional(),
  field_type: z.enum(['text', 'textarea', 'number', 'date', 'select', 'multiselect', 'multi_select', 'file']).optional(),
  required: z.boolean().optional(),
  placeholder: z.string().max(255).nullable().optional(),
  help_text: z.string().nullable().optional(),
  validation: z.record(z.string(), z.any()).nullable().optional(),
  validation_rules: z.record(z.string(), z.any()).nullable().optional(),
  display_order: z.number().int().optional(),
  is_active: z.boolean().optional(),
  subcategory_id: z.number().int().optional(),
  assigned_admin_id: z.string().uuid().nullable().optional(),
  options: z.array(z.object({
    label: z.string(),
    value: z.string(),
    display_order: z.number().int().optional(),
  })).optional(),
});

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireRole(['admin', 'super_admin']);

    const { id: idStr } = await params;
    const id = parseInt(idStr, 10);
    if (isNaN(id)) {
      return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });
    }

    const field = await getFieldById(id);

    if (!field) {
      return NextResponse.json({ error: 'Field not found' }, { status: 404 });
    }

    // Transform field data for frontend compatibility
    const validationData = (field.validation || {}) as Record<string, any>;
    const transformedField = {
      ...field,
      // Normalize both "multiselect" (old) and "multi_select" (new) to "multi_select" for frontend
      field_type: (field.field_type === 'multiselect' || field.field_type === 'multi_select') 
        ? 'multi_select' 
        : field.field_type,
      // Map validation to validation_rules for frontend
      validation_rules: validationData,
      // Extract help_text from validation if present
      help_text: validationData.help_text || null,
      // Ensure options are properly formatted with all required fields
      options: (field.options || []).map((opt: any) => ({
        id: opt.id,
        label: opt.label || '',
        value: opt.value || '',
        display_order: opt.display_order ?? 0,
      })),
    };

    return NextResponse.json(transformedField);
  } catch (error: any) {
    logger.error({ error: error.message }, 'Error fetching field');
    return NextResponse.json(
      { error: error.message || 'Failed to fetch field' },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireRole(['super_admin']);

    const { id: idStr } = await params;
    const id = parseInt(idStr, 10);
    if (isNaN(id)) {
      return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });
    }

    const body = await request.json();
    
    // Map validation_rules to validation if present
    if (body.validation_rules !== undefined && body.validation === undefined) {
      body.validation = body.validation_rules;
    }
    
    // Keep multi_select as-is (don't normalize to multiselect)
    // The database will store "multi_select" for new/updated fields
    
    const parsed = UpdateFieldSchema.safeParse(body);

    if (!parsed.success) {
      logger.error({ error: parsed.error.issues, body }, 'Field update validation failed');
      return NextResponse.json(
        { error: 'Invalid input', details: parsed.error.issues },
        { status: 400 }
      );
    }

    const { options, validation_rules, subcategory_id, assigned_admin_id, ...fieldData } = parsed.data;

    // Generate slug if name is updated but slug is not provided
    if (fieldData.name && !fieldData.slug) {
      const { generateSlug } = await import('@/lib/utils/slug');
      fieldData.slug = generateSlug(fieldData.name);
    }

    // Ensure validation is set from validation_rules if provided
    if (validation_rules !== undefined) {
      fieldData.validation = validation_rules;
    }

    // Update field
    const field = await updateField(id, fieldData);

    // Update options if provided (for select/multiselect fields)
    // If options is explicitly null/empty array, delete all options
    // If options is undefined, preserve existing options
    if (options !== undefined) {
      await updateFieldOptions(id, options);
    }
    // If options is undefined and field is select/multiselect, preserve existing options
    // (updateFieldOptions won't be called, so existing options remain)

    // Fetch updated field with options to return
    const updatedField = await getFieldById(id);
    if (!updatedField) {
      return NextResponse.json({ error: 'Field not found after update' }, { status: 404 });
    }

    // Transform for frontend
    const validationData = (updatedField.validation || {}) as Record<string, any>;
    const transformedField = {
      ...updatedField,
      // Normalize both "multiselect" (old) and "multi_select" (new) to "multi_select" for frontend
      field_type: (updatedField.field_type === 'multiselect' || updatedField.field_type === 'multi_select') 
        ? 'multi_select' 
        : updatedField.field_type,
      validation_rules: validationData,
      help_text: validationData.help_text || null,
      options: (updatedField.options || []).map((opt: any) => ({
        id: opt.id,
        label: opt.label || '',
        value: opt.value || '',
        display_order: opt.display_order ?? 0,
      })),
    };

    return NextResponse.json({ success: true, field: transformedField });
  } catch (error: any) {
    logger.error({ error: error.message }, 'Error updating field');
    return NextResponse.json(
      { error: error.message || 'Failed to update field' },
      { status: error.message.includes('not found') ? 404 : 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireRole(['super_admin']);

    const { id: idStr } = await params;
    const id = parseInt(idStr, 10);
    if (isNaN(id)) {
      return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });
    }

    await deleteField(id);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    logger.error({ error: error.message }, 'Error deleting field');
    return NextResponse.json(
      { error: error.message || 'Failed to delete field' },
      { status: 500 }
    );
  }
}
