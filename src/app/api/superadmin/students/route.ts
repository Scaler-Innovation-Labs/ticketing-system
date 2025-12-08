/**
 * Super Admin Student Management
 * 
 * GET /api/superadmin/students - List all students
 * POST /api/superadmin/students - Create new student
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth/helpers';
import { listStudents, createStudent } from '@/lib/student/student-service';
import { logger } from '@/lib/logger';
import { z } from 'zod';

const CreateStudentSchema = z.object({
  full_name: z.string().min(1).max(255),
  email: z.string().email(),
  mobile: z.string().min(10).max(15),
  roll_no: z.string().optional(),
  room_number: z.string().optional(),
  hostel_id: z.number().int().positive().optional(),
  class_section_id: z.number().int().positive().optional(),
  batch_id: z.number().int().positive().optional(),
  department: z.string().max(100).optional(),
  blood_group: z.string().max(10).optional(),
  parent_name: z.string().max(255).optional(),
  parent_phone: z.string().max(15).optional(),
});

export async function GET(request: NextRequest) {
  try {
    await requireRole(['admin', 'snr_admin', 'super_admin']);

    const searchParams = request.nextUrl.searchParams;
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '50', 10);
    const search = searchParams.get('search') || undefined;
    const hostel = searchParams.get('hostel') || undefined;
    const batch_year = searchParams.get('batch_year')
      ? parseInt(searchParams.get('batch_year')!, 10)
      : undefined;

    const result = await listStudents({ page, limit, search, hostel, batch_year });

    return NextResponse.json(result);
  } catch (error: any) {
    logger.error({ error: error.message }, 'Error listing students');
    return NextResponse.json(
      { error: error.message || 'Failed to list students' },
      { status: error.message.includes('Unauthorized') ? 401 : 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireRole(['admin', 'snr_admin', 'super_admin']);

    const body = await request.json();
    const parsed = CreateStudentSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: parsed.error.issues },
        { status: 400 }
      );
    }

    const studentData = {
      ...parsed.data,
      phone: parsed.data.mobile,
      room_no: parsed.data.room_number,
    };

    const studentId = await createStudent(studentData);

    return NextResponse.json({ id: studentId }, { status: 201, headers: { 'content-type': 'application/json' } });
  } catch (error: any) {
    logger.error({ error: error.message }, 'Error creating student');
    return NextResponse.json(
      { error: error.message || 'Failed to create student' },
      { status: error.message.includes('Unauthorized') ? 401 : 500 }
    );
  }
}
