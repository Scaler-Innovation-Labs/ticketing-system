/**
 * Super Admin - Reactivate Student
 * 
 * POST /api/superadmin/students/[id]/reactivate - Reactivate deactivated student
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth/helpers';
import { reactivateStudent } from '@/lib/student/student-service';
import { logger } from '@/lib/logger';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireRole(['admin', 'snr_admin', 'super_admin']);

    const { id } = await params;
    const studentId = parseInt(id, 10);
    if (isNaN(studentId)) {
      return NextResponse.json({ error: 'Invalid student ID' }, { status: 400 });
    }

    await reactivateStudent(studentId);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    logger.error({ error: error.message }, 'Error reactivating student');
    return NextResponse.json(
      { error: error.message || 'Failed to reactivate student' },
      { status: error.message.includes('not found') ? 404 : 500 }
    );
  }
}
