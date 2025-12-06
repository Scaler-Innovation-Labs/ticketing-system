/**
 * Super Admin - Download CSV Template
 * 
 * GET /api/superadmin/students/csv-template - Download CSV template for bulk upload
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth/helpers';

export async function GET(request: NextRequest) {
  try {
    await requireRole(['super_admin']);

    const csvContent = `full_name,email,phone,roll_no,room_no,hostel_id,class_section_id,batch_id,department,blood_group,parent_name,parent_phone
John Doe,john@example.com,9876543210,CS001,A101,1,1,1,Computer Science,O+,Jane Doe,9876543211
`;

    return new NextResponse(csvContent, {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': 'attachment; filename="student_upload_template.csv"',
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Failed to generate template' },
      { status: error.message.includes('Unauthorized') ? 401 : 500 }
    );
  }
}
