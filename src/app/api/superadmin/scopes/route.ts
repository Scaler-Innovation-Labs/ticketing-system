import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireRole } from '@/lib/auth/helpers';
import { listScopes, createScope } from '@/lib/master-data/master-data-service';

const CreateScopeSchema = z.object({
  domain_id: z.number().int().positive(),
  name: z.string().min(1).max(100),
  slug: z.string().min(1).max(100),
  student_field_key: z.string().max(64).optional().nullable(),
  reference_type: z.string().max(50).optional().nullable(),
  reference_id: z.number().int().positive().optional().nullable(),
});

export async function GET(request: Request) {
  try {
    await requireRole(['super_admin', 'admin']);
    
    const { searchParams } = new URL(request.url);
    const domainId = searchParams.get('domain_id');
    const activeOnly = searchParams.get('active_only') === 'true';
    
    const scopes = await listScopes(
      domainId ? parseInt(domainId) : undefined,
      activeOnly
    );
    return NextResponse.json(scopes);
  } catch (error) {
    if (error instanceof Error && error.message.includes('Unauthorized')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  let parsedData: z.infer<typeof CreateScopeSchema> | null = null;
  try {
    await requireRole(['super_admin']);
    
    const body = await request.json();
    parsedData = CreateScopeSchema.parse(body);
    
    const scope = await createScope(
      parsedData.domain_id,
      parsedData.name,
      parsedData.slug,
      parsedData.student_field_key,
      parsedData.reference_type,
      parsedData.reference_id
    );
    return NextResponse.json(scope, { status: 201 });
  } catch (error: any) {
    if (error instanceof Error && error.message.includes('Unauthorized')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation Error', details: error.issues }, { status: 400 });
    }
    // Handle PostgreSQL unique constraint violations for domain_id + slug
    if (error?.code === '23505' || error?.cause?.code === '23505') {
      const message = parsedData
        ? `A scope with slug "${parsedData.slug}" already exists in this domain`
        : 'Scope already exists for this domain';
      return NextResponse.json({ error: message }, { status: 409 });
    }
    return NextResponse.json({ error: error?.message || 'Internal Server Error' }, { status: 500 });
  }
}
