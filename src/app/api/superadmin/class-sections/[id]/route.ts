import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireRole } from '@/lib/auth/helpers';
import { updateClassSection, deleteClassSection } from '@/lib/master-data/master-data-service';

const UpdateClassSectionSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  department: z.string().max(100).optional().nullable(),
  batch_id: z.number().int().positive().optional().nullable(),
  is_active: z.boolean().optional(),
});

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    await requireRole(['super_admin']);
    
    const sectionId = parseInt(params.id);
    if (isNaN(sectionId)) {
      return NextResponse.json({ error: 'Invalid class section ID' }, { status: 400 });
    }
    
    const body = await request.json();
    const data = UpdateClassSectionSchema.parse(body);
    
    const section = await updateClassSection(sectionId, data.name, data.department, data.batch_id);
    return NextResponse.json(section);
  } catch (error) {
    if (error instanceof Error && error.message.includes('Unauthorized')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation Error', details: error.issues }, { status: 400 });
    }
    if (error instanceof Error && error.message.includes('not found')) {
      return NextResponse.json({ error: 'Class section not found' }, { status: 404 });
    }
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: { id: string } }
) {
  try {
    await requireRole(['super_admin']);
    
    const sectionId = parseInt(params.id);
    if (isNaN(sectionId)) {
      return NextResponse.json({ error: 'Invalid class section ID' }, { status: 400 });
    }
    
    await deleteClassSection(sectionId);
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message.includes('Unauthorized')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
