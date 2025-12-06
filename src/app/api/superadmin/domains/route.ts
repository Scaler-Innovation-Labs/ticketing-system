import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireRole } from '@/lib/auth/helpers';
import { listDomains, createDomain } from '@/lib/master-data/master-data-service';

const CreateDomainSchema = z.object({
  name: z.string().min(1).max(100),
  slug: z.string().min(1).max(100),
  description: z.string().optional().nullable(),
});

export async function GET() {
  try {
    await requireRole(['super_admin']);
    
    const domains = await listDomains(false); // Get all, including inactive
    return NextResponse.json(domains);
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
    const data = CreateDomainSchema.parse(body);
    
    const domain = await createDomain(data.name, data.slug, data.description);
    return NextResponse.json(domain, { status: 201 });
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
