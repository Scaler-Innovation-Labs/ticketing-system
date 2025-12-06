/**
 * Super Admin - Bulk Upload Students
 * 
 * POST /api/superadmin/students/bulk-upload - Upload CSV to create multiple students
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth/helpers';
import { createStudent } from '@/lib/student/student-service';
import { logger } from '@/lib/logger';
import { z } from 'zod';

const BulkUploadSchema = z.object({
  students: z.array(
    z.object({
      full_name: z.string().min(1).max(255),
      email: z.string().email(),
      phone: z.string().min(10).max(15),
      roll_no: z.string().optional(),
      room_no: z.string().optional(),
      hostel_id: z.number().int().positive().optional(),
      class_section_id: z.number().int().positive().optional(),
      batch_id: z.number().int().positive().optional(),
      department: z.string().max(100).optional(),
      blood_group: z.string().max(10).optional(),
      parent_name: z.string().max(255).optional(),
      parent_phone: z.string().max(15).optional(),
    })
  ),
});

export async function POST(request: NextRequest) {
  try {
    await requireRole(['super_admin']);

    const body = await request.json();
    const parsed = BulkUploadSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: parsed.error.issues },
        { status: 400 }
      );
    }

    const results = {
      success: [] as number[],
      failed: [] as { email: string; error: string }[],
    };

    for (const studentData of parsed.data.students) {
      try {
        const studentId = await createStudent(studentData);
        results.success.push(studentId);
      } catch (error: any) {
        results.failed.push({
          email: studentData.email,
          error: error.message || 'Unknown error',
        });
      }
    }

    logger.info(
      { success: results.success.length, failed: results.failed.length },
      'Bulk upload completed'
    );

    return NextResponse.json(results, { status: 201 });
  } catch (error: any) {
    logger.error({ error: error.message }, 'Error in bulk upload');
    return NextResponse.json(
      { error: error.message || 'Bulk upload failed' },
      { status: error.message.includes('Unauthorized') ? 401 : 500 }
    );
  }
}
