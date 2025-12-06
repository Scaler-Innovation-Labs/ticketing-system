/**
 * Super Admin Student Management - Individual Student
 * 
 * PATCH /api/superadmin/students/[id] - Update student
 * DELETE /api/superadmin/students/[id] - Deactivate student
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth/helpers';
import { updateStudent, deactivateStudent } from '@/lib/student/student-service';
import { logger } from '@/lib/logger';
import { z } from 'zod';

const UpdateStudentSchema = z.object({
  full_name: z.string().min(1).max(255).optional(),
  email: z.string().email().optional(),
  phone: z.string().min(10).max(15).optional(),
  roll_no: z.string().optional(),
  room_no: z.string().optional(),
  hostel_id: z.number().int().positive().nullable().optional(),
  class_section_id: z.number().int().positive().nullable().optional(),
  batch_id: z.number().int().positive().nullable().optional(),
  department: z.string().max(100).nullable().optional(),
  blood_group: z.string().max(10).nullable().optional(),
  parent_name: z.string().max(255).nullable().optional(),
  parent_phone: z.string().max(15).nullable().optional(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await requireRole(['super_admin']);

    const studentId = parseInt(params.id, 10);
    if (isNaN(studentId)) {
      return NextResponse.json({ error: 'Invalid student ID' }, { status: 400 });
    }

    const body = await request.json();
    const parsed = UpdateStudentSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: parsed.error.issues },
        { status: 400 }
      );
    }

    await updateStudent(studentId, parsed.data);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    logger.error({ error: error.message }, 'Error updating student');
    return NextResponse.json(
      { error: error.message || 'Failed to update student' },
      { status: error.message.includes('not found') ? 404 : 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await requireRole(['super_admin']);

    const studentId = parseInt(params.id, 10);
    if (isNaN(studentId)) {
      return NextResponse.json({ error: 'Invalid student ID' }, { status: 400 });
    }

    await deactivateStudent(studentId);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    logger.error({ error: error.message }, 'Error deactivating student');
    return NextResponse.json(
      { error: error.message || 'Failed to deactivate student' },
      { status: error.message.includes('not found') ? 404 : 500 }
    );
  }
}
