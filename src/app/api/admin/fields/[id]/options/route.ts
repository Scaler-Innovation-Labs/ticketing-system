/**
 * Field Options Management API
 * 
 * GET - Get field options
 * POST - Update field options
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireRole } from '@/lib/auth/helpers';
import { getFieldById, updateFieldOptions } from '@/lib/field/field-service';
import { logger } from '@/lib/logger';

const UpdateOptionsSchema = z.object({
  options: z.array(
    z.object({
      label: z.string().min(1),
      value: z.string().min(1),
    })
  ),
});

/**
 * GET /api/admin/fields/[id]/options
 * Get field options
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireRole(['admin', 'super_admin']);

    const { id } = await params;
    const fieldId = parseInt(id, 10);

    if (isNaN(fieldId)) {
      return NextResponse.json(
        { error: 'Invalid field ID' },
        { status: 400 }
      );
    }

    const field = await getFieldById(fieldId);

    if (!field) {
      return NextResponse.json(
        { error: 'Field not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ options: field.options || [] });
  } catch (error: any) {
    logger.error({ error: error.message }, 'Failed to get field options');
    return NextResponse.json(
      { error: error.message || 'Failed to get field options' },
      { status: error.status || 500 }
    );
  }
}

/**
 * POST /api/admin/fields/[id]/options
 * Update field options (replaces all existing options)
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireRole(['admin', 'super_admin']);

    const { id } = await params;
    const fieldId = parseInt(id, 10);

    if (isNaN(fieldId)) {
      return NextResponse.json(
        { error: 'Invalid field ID' },
        { status: 400 }
      );
    }

    const body = await request.json();
    const parsed = UpdateOptionsSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: parsed.error.issues },
        { status: 400 }
      );
    }

    await updateFieldOptions(fieldId, parsed.data.options);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    logger.error({ error: error.message }, 'Failed to update field options');
    return NextResponse.json(
      { error: error.message || 'Failed to update field options' },
      { status: error.status || 500 }
    );
  }
}
