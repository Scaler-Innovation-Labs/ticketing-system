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
  let parsedData: { name: string; slug: string; description?: string | null } | null = null;
  
  try {
    await requireRole(['super_admin']);
    
    const body = await request.json();
    parsedData = CreateDomainSchema.parse(body);
    
    const domain = await createDomain(parsedData.name, parsedData.slug, parsedData.description);
    return NextResponse.json(domain, { status: 201 });
  } catch (error: any) {
    if (error instanceof Error && error.message.includes('Unauthorized')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation Error', details: error.issues }, { status: 400 });
    }
    // Handle PostgreSQL unique constraint violations
    if (error?.code === '23505' || error?.cause?.code === '23505') {
      const constraint = error?.cause?.constraint_name || error?.constraint_name || 'unique constraint';
      let message = 'A domain with this name or slug already exists';
      if (constraint.includes('name') && parsedData) {
        message = `A domain with the name "${parsedData.name}" already exists`;
      } else if (constraint.includes('slug') && parsedData) {
        message = `A domain with the slug "${parsedData.slug}" already exists`;
      }
      return NextResponse.json({ error: message }, { status: 409 });
    }
    return NextResponse.json({ error: error?.message || 'Internal Server Error' }, { status: 500 });
  }
}
