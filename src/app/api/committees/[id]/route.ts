/**
 * Committee Detail API
 * 
 * GET - Get committee details
 * PATCH - Update committee (super_admin only)
 * DELETE - Deactivate committee (super_admin only)
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireRole } from '@/lib/auth/helpers';
import {
  getCommitteeById,
  updateCommittee,
  deleteCommittee,
} from '@/lib/committee/committee-service';
import { logger } from '@/lib/logger';

const UpdateCommitteeSchema = z.object({
  name: z.string().min(1).max(140).optional(),
  description: z.string().optional().nullable(),
  contact_email: z.string().email().optional().nullable(),
  head_id: z.string().uuid().optional().nullable(),
});

/**
 * GET /api/committees/[id]
 * Get committee details
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireRole(['admin', 'super_admin', 'committee']);

    const { id } = await params;
    const committeeId = parseInt(id, 10);

    if (isNaN(committeeId)) {
      return NextResponse.json(
        { error: 'Invalid committee ID' },
        { status: 400 }
      );
    }

    const committee = await getCommitteeById(committeeId);

    if (!committee) {
      return NextResponse.json(
        { error: 'Committee not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ committee });
  } catch (error: any) {
    logger.error({ error: error.message }, 'Failed to get committee');
    return NextResponse.json(
      { error: error.message || 'Failed to get committee' },
      { status: error.status || 500 }
    );
  }
}

/**
 * PATCH /api/committees/[id]
 * Update committee (super_admin only)
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireRole(['super_admin', 'snr_admin']);

    const { id } = await params;
    const committeeId = parseInt(id, 10);

    if (isNaN(committeeId)) {
      return NextResponse.json(
        { error: 'Invalid committee ID' },
        { status: 400 }
      );
    }

    const body = await request.json();
    const parsed = UpdateCommitteeSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: parsed.error.issues },
        { status: 400 }
      );
    }

    const committee = await updateCommittee(committeeId, parsed.data);

    return NextResponse.json({ committee });
  } catch (error: any) {
    logger.error({ error: error.message }, 'Failed to update committee');
    return NextResponse.json(
      { error: error.message || 'Failed to update committee' },
      { status: error.status || 500 }
    );
  }
}

/**
 * DELETE /api/committees/[id]
 * Deactivate committee (super_admin only)
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireRole(['super_admin', 'snr_admin']);

    const { id } = await params;
    const committeeId = parseInt(id, 10);

    if (isNaN(committeeId)) {
      return NextResponse.json(
        { error: 'Invalid committee ID' },
        { status: 400 }
      );
    }

    const committee = await deleteCommittee(committeeId);

    if (!committee) {
      return NextResponse.json({ error: 'Committee not found' }, { status: 404 });
    }

    // Invalidate dashboards that show committees
    return NextResponse.json({ committee }, {
      status: 200,
      headers: {
        "x-revalidate-paths": JSON.stringify([
          "/superadmin/dashboard/committees",
          "/snr-admin/dashboard/committees",
        ])
      }
    });
  } catch (error: any) {
    logger.error({ error: error.message }, 'Failed to delete committee');
    const message = error?.message || 'Failed to delete committee';
    const status =
      message.toLowerCase().includes('not found') ? 404 :
      message.toLowerCase().includes('unauthorized') ? 403 :
      error.status || 500;
    return NextResponse.json(
      { error: message },
      { status }
    );
  }
}
