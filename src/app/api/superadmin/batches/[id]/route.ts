import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireRole } from '@/lib/auth/helpers';
import { updateBatch, deleteBatch } from '@/lib/master-data/master-data-service';

const UpdateBatchSchema = z.object({
  year: z.number().int().min(2000).max(2100).optional(),
  name: z.string().min(1).max(100).optional(),
  is_active: z.boolean().optional(),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireRole(['super_admin']);

    const { id } = await params;
    const batchId = parseInt(id);
    if (isNaN(batchId)) {
      return NextResponse.json({ error: 'Invalid batch ID' }, { status: 400 });
    }

    const body = await request.json();
    const data = UpdateBatchSchema.parse(body);

    const batch = await updateBatch(batchId, data.year, data.name);
    return NextResponse.json(batch);
  } catch (error) {
    if (error instanceof Error && error.message.includes('Unauthorized')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation Error', details: error.issues }, { status: 400 });
    }
    if (error instanceof Error && error.message.includes('not found')) {
      return NextResponse.json({ error: 'Batch not found' }, { status: 404 });
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
    const batchId = parseInt(id);
    if (isNaN(batchId)) {
      return NextResponse.json({ error: 'Invalid batch ID' }, { status: 400 });
    }

    await deleteBatch(batchId);
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message.includes('Unauthorized')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
