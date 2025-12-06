/**
 * Admin - Assignment Rules Management - Individual
 * 
 * DELETE /api/admin/assignments/[id] - Delete assignment rule
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth/helpers';
import { deleteAssignmentRule } from '@/lib/assignment/assignment-service';
import { logger } from '@/lib/logger';

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireRole(['super_admin']);

    const { id } = await params;
    const assignmentId = parseInt(id, 10);
    if (isNaN(assignmentId)) {
      return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });
    }

    await deleteAssignmentRule(assignmentId);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    logger.error({ error: error.message }, 'Error deleting assignment rule');
    return NextResponse.json(
      { error: error.message || 'Failed to delete assignment rule' },
      { status: 500 }
    );
  }
}
