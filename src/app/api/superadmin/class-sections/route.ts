import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireRole } from '@/lib/auth/helpers';
import { listClassSections, createClassSection } from '@/lib/master-data/master-data-service';

const CreateClassSectionSchema = z.object({
  name: z.string().min(1).max(100),
  department: z.string().max(100).optional().nullable(),
  batch_id: z.number().int().positive().optional().nullable(),
});

export async function GET() {
  try {
    await requireRole(['snr_admin', 'super_admin']);
    
    const sections = await listClassSections(false); // Get all, including inactive
    return NextResponse.json(sections);
  } catch (error) {
    if (error instanceof Error && error.message.includes('Unauthorized')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    await requireRole(['admin', 'snr_admin', 'super_admin']);
    
    const body = await request.json();
    const data = CreateClassSectionSchema.parse(body);
    
    const section = await createClassSection(data.name, data.department, data.batch_id);
    return NextResponse.json(section, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message.includes('Unauthorized')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation Error', details: error.issues }, { status: 400 });
    }
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
