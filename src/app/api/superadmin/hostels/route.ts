import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireRole } from '@/lib/auth/helpers';
import { listHostels, createHostel } from '@/lib/master-data/master-data-service';

const CreateHostelSchema = z.object({
  name: z.string().min(1).max(100),
  code: z.string().min(1).max(20),
});

export async function GET() {
  try {
    await requireRole(['super_admin']);

    const hostels = await listHostels(false); // Get all, including inactive
    return NextResponse.json(hostels);
  } catch (error) {
    if (error instanceof Error && error.message.includes('Unauthorized')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  let parsedData: z.infer<typeof CreateHostelSchema> | null = null;
  
  try {
    await requireRole(['super_admin']);

    const body = await request.json();
    parsedData = CreateHostelSchema.parse(body);

    const hostel = await createHostel(parsedData.name, parsedData.code);
    return NextResponse.json(hostel, { status: 201 });
  } catch (error: any) {
    if (error instanceof Error && error.message.includes('Unauthorized')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation Error', details: error.issues }, { status: 400 });
    }
    // Handle PostgreSQL unique constraint violations for hostel name or code
    if (error?.code === '23505' || error?.cause?.code === '23505') {
      const constraint = error?.cause?.constraint_name || error?.constraint_name || '';
      let message = 'A hostel with this name or code already exists';
      if (constraint.includes('name') && parsedData) {
        message = `A hostel with the name "${parsedData.name}" already exists`;
      } else if (constraint.includes('code') && parsedData) {
        message = `A hostel with the code "${parsedData.code}" already exists`;
      }
      return NextResponse.json({ error: message }, { status: 409 });
    }
    return NextResponse.json({ error: error?.message || 'Internal Server Error' }, { status: 500 });
  }
}
