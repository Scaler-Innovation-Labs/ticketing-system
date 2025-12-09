import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireRole } from '@/lib/auth/helpers';
import { listBatches, createBatch } from '@/lib/master-data/master-data-service';

const CreateBatchSchema = z.object({
  year: z.number().int().min(2000).max(2100),
  name: z.string().min(1).max(100),
});

export async function GET() {
  try {
    await requireRole(['snr_admin', 'super_admin']);
    
    const batches = await listBatches(false); // Get all, including inactive
    return NextResponse.json(batches);
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
    const data = CreateBatchSchema.parse(body);
    
    const batch = await createBatch(data.year, data.name);
    return NextResponse.json(batch, { status: 201 });
  } catch (error: any) {
    if (error instanceof Error && error.message.includes('Unauthorized')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation Error', details: error.issues }, { status: 400 });
    }
    return NextResponse.json({ error: error?.message || 'Internal Server Error' }, { status: 500 });
  }
}
