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
  field_type: z.enum(['text', 'textarea', 'number', 'date', 'select', 'multiselect', 'file']).optional(),
  required: z.boolean().optional(),
  placeholder: z.string().max(255).nullable().optional(),
  validation: z.record(z.string(), z.any()).nullable().optional(),
  display_order: z.number().int().optional(),
  is_active: z.boolean().optional(),
  options: z.array(z.object({
    label: z.string(),
    value: z.string(),
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

    return NextResponse.json(field);
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
    const parsed = UpdateFieldSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: parsed.error.issues },
        { status: 400 }
      );
    }

    const { options, ...fieldData } = parsed.data;

    // Update field
    const field = await updateField(id, fieldData);

    // Update options if provided
    if (options !== undefined) {
      await updateFieldOptions(id, options);
    }

    return NextResponse.json({ success: true, field });
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
