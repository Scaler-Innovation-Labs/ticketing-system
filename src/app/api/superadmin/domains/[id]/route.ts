import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireRole } from '@/lib/auth/helpers';
import { updateDomain, deleteDomain } from '@/lib/master-data/master-data-service';

const UpdateDomainSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  slug: z.string().min(1).max(100).optional(),
  description: z.string().optional().nullable(),
  is_active: z.boolean().optional(),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireRole(['super_admin']);

    const { id } = await params;
    const domainId = parseInt(id);
    if (isNaN(domainId)) {
      return NextResponse.json({ error: 'Invalid domain ID' }, { status: 400 });
    }

    const body = await request.json();
    const data = UpdateDomainSchema.parse(body);

    const domain = await updateDomain(domainId, data.name, data.slug, data.description);
    return NextResponse.json(domain);
  } catch (error) {
    if (error instanceof Error && error.message.includes('Unauthorized')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation Error', details: error.issues }, { status: 400 });
    }
    if (error instanceof Error && error.message.includes('not found')) {
      return NextResponse.json({ error: 'Domain not found' }, { status: 404 });
    }
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireRole(['super_admin']);

    const { id } = await params;
    const domainId = parseInt(id);
    if (isNaN(domainId)) {
      return NextResponse.json({ error: 'Invalid domain ID' }, { status: 400 });
    }

    await deleteDomain(domainId);
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message.includes('Unauthorized')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
