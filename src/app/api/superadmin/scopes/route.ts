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
  try {
    await requireRole(['super_admin']);
    
    const body = await request.json();
    const data = CreateScopeSchema.parse(body);
    
    const scope = await createScope(
      data.domain_id,
      data.name,
      data.slug,
      data.student_field_key,
      data.reference_type,
      data.reference_id
    );
    return NextResponse.json(scope, { status: 201 });
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
