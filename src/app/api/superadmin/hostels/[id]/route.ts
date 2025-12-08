import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireRole } from '@/lib/auth/helpers';
import { updateHostel, deleteHostel } from '@/lib/master-data/master-data-service';

const UpdateHostelSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  code: z.string().min(1).max(20).optional(),
  is_active: z.boolean().optional(),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireRole(['snr_admin', 'super_admin']);

    const { id } = await params;
    const hostelId = parseInt(id);
    if (isNaN(hostelId)) {
      return NextResponse.json({ error: 'Invalid hostel ID' }, { status: 400 });
    }

    const body = await request.json();
    const data = UpdateHostelSchema.parse(body);

    const hostel = await updateHostel(hostelId, data.name, data.code, data.is_active);
    return NextResponse.json(hostel);
  } catch (error) {
    if (error instanceof Error && error.message.includes('Unauthorized')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation Error', details: error.issues }, { status: 400 });
    }
    if (error instanceof Error && error.message.includes('not found')) {
      return NextResponse.json({ error: 'Hostel not found' }, { status: 404 });
    }
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireRole(['snr_admin', 'super_admin']);

    const { id } = await params;
    const hostelId = parseInt(id);
    if (isNaN(hostelId)) {
      return NextResponse.json({ error: 'Invalid hostel ID' }, { status: 400 });
    }

    await deleteHostel(hostelId);
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message.includes('Unauthorized')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
