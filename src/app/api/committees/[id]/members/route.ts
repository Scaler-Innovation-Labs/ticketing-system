/**
 * Committee Members API
 * 
 * GET - List committee members
 * POST - Add member to committee
 * DELETE - Remove member from committee
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireRole } from '@/lib/auth/helpers';
import {
  getCommitteeMembers,
  addCommitteeMember,
  removeCommitteeMember,
} from '@/lib/committee/committee-service';
import { logger } from '@/lib/logger';

const AddMemberSchema = z.object({
  user_id: z.string().uuid(),
  role: z.string().optional().default('member'),
});

const RemoveMemberSchema = z.object({
  user_id: z.string().uuid(),
});

/**
 * GET /api/committees/[id]/members
 * List committee members
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

    const members = await getCommitteeMembers(committeeId);

    return NextResponse.json({ members });
  } catch (error: any) {
    logger.error({ error: error.message }, 'Failed to list committee members');
    return NextResponse.json(
      { error: error.message || 'Failed to list committee members' },
      { status: error.status || 500 }
    );
  }
}

/**
 * POST /api/committees/[id]/members
 * Add member to committee (super_admin only)
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireRole(['super_admin']);

    const { id } = await params;
    const committeeId = parseInt(id, 10);

    if (isNaN(committeeId)) {
      return NextResponse.json(
        { error: 'Invalid committee ID' },
        { status: 400 }
      );
    }

    const body = await request.json();
    const parsed = AddMemberSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: parsed.error.issues },
        { status: 400 }
      );
    }

    const member = await addCommitteeMember(
      committeeId,
      parsed.data.user_id,
      parsed.data.role
    );

    return NextResponse.json({ member }, { status: 201 });
  } catch (error: any) {
    logger.error({ error: error.message }, 'Failed to add committee member');
    return NextResponse.json(
      { error: error.message || 'Failed to add committee member' },
      { status: error.status || 500 }
    );
  }
}

/**
 * DELETE /api/committees/[id]/members
 * Remove member from committee (super_admin only)
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireRole(['super_admin']);

    const { id } = await params;
    const committeeId = parseInt(id, 10);

    if (isNaN(committeeId)) {
      return NextResponse.json(
        { error: 'Invalid committee ID' },
        { status: 400 }
      );
    }

    const body = await request.json();
    const parsed = RemoveMemberSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: parsed.error.issues },
        { status: 400 }
      );
    }

    const member = await removeCommitteeMember(
      committeeId,
      parsed.data.user_id
    );

    return NextResponse.json({ member });
  } catch (error: any) {
    logger.error({ error: error.message }, 'Failed to remove committee member');
    return NextResponse.json(
      { error: error.message || 'Failed to remove committee member' },
      { status: error.status || 500 }
    );
  }
}
