/**
 * Committee Management API
 * 
 * GET - List all committees
 * POST - Create new committee (super_admin only)
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireRole } from '@/lib/auth/helpers';
import { listCommittees, createCommittee } from '@/lib/committee/committee-service';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const CreateCommitteeSchema = z.object({
  name: z.string().min(1).max(140),
  description: z.string().optional().nullable(),
  contact_email: z.string().email().optional().nullable(),
  head_id: z.string().uuid().optional().nullable(),
});

/**
 * GET /api/committees
 * List all committees (available to admin, snr_admin, committee, super_admin)
 */
export async function GET(request: NextRequest) {
  try {
    await requireRole(['admin', 'snr_admin', 'super_admin', 'committee']);

    const { searchParams } = new URL(request.url);
    const activeOnly = searchParams.get('active_only') === 'true';

    const committees = await listCommittees(activeOnly);

    return NextResponse.json({ committees });
  } catch (error: any) {
    logger.error({ error: error.message }, 'Failed to list committees');
    return NextResponse.json(
      { error: error.message || 'Failed to list committees' },
      { status: error.status || 500 }
    );
  }
}

/**
 * POST /api/committees
 * Create a new committee (super_admin only)
 */
export async function POST(request: NextRequest) {
  try {
    await requireRole(['super_admin']);

    const body = await request.json();
    const parsed = CreateCommitteeSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: parsed.error.issues },
        { status: 400 }
      );
    }

    const committee = await createCommittee(parsed.data);

    return NextResponse.json({ committee }, { status: 201 });
  } catch (error: any) {
    logger.error({ error: error.message }, 'Failed to create committee');
    return NextResponse.json(
      { error: error.message || 'Failed to create committee' },
      { status: error.status || 500 }
    );
  }
}
