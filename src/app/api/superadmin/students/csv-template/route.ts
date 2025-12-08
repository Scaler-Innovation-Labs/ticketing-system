/**
 * Super Admin - Download CSV Template
 * 
 * GET /api/superadmin/students/csv-template - Download CSV template for bulk upload
 * GET /api/superadmin/students/template - Alias for backward compatibility
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth/helpers';

export async function GET(request: NextRequest) {
  try {
    await requireRole(['super_admin']);

    // Use user-friendly column names that match the header mapping
    const csvContent = `full_name,email,mobile,roll_no,room_number,hostel,class_section,batch_year,department,blood_group,parent_name,parent_phone
John Doe,john.doe@example.com,9876543210,CS001,A101,Hostel A,A,2027,Computer Science,O+,Jane Doe,9876543211
Jane Smith,jane.smith@example.com,9876543211,CS002,B102,Hostel B,B,2027,Electrical Engineering,B+,John Smith,9876543212
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
