import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireRole } from '@/lib/auth/helpers';
import { listHostels, createHostel } from '@/lib/master-data/master-data-service';

const CreateHostelSchema = z.object({
  name: z.string().min(1).max(100),
  code: z.string().min(1).max(20),
  capacity: z.number().int().positive().optional(),
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
  try {
    await requireRole(['super_admin']);
    
    const body = await request.json();
    const data = CreateHostelSchema.parse(body);
    
    const hostel = await createHostel(data.name, data.code, data.capacity);
    return NextResponse.json(hostel, { status: 201 });
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
