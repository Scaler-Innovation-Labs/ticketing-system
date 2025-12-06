import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireRole } from '@/lib/auth/helpers';
import { updateScope, deleteScope } from '@/lib/master-data/master-data-service';

const UpdateScopeSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  slug: z.string().min(1).max(100).optional(),
  student_field_key: z.string().max(64).optional().nullable(),
  reference_type: z.string().max(50).optional().nullable(),
  reference_id: z.number().int().positive().optional().nullable(),
  is_active: z.boolean().optional(),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireRole(['super_admin']);

    const { id } = await params;
    const scopeId = parseInt(id);
    if (isNaN(scopeId)) {
      return NextResponse.json({ error: 'Invalid scope ID' }, { status: 400 });
    }

    const body = await request.json();
    const data = UpdateScopeSchema.parse(body);

    const scope = await updateScope(
      scopeId,
      data.name,
      data.slug,
      data.student_field_key,
      data.reference_type,
      data.reference_id
    );
    return NextResponse.json(scope);
  } catch (error) {
    if (error instanceof Error && error.message.includes('Unauthorized')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation Error', details: error.issues }, { status: 400 });
    }
    if (error instanceof Error && error.message.includes('not found')) {
      return NextResponse.json({ error: 'Scope not found' }, { status: 404 });
    }
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireRole(['super_admin']);

    const { id } = await params;
    const scopeId = parseInt(id);
    if (isNaN(scopeId)) {
      return NextResponse.json({ error: 'Invalid scope ID' }, { status: 400 });
    }

    await deleteScope(scopeId);
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message.includes('Unauthorized')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
