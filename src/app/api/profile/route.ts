/**
 * GET /api/profile - Get current user profile
 * PATCH /api/profile - Update current user profile
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { 
  getStudentProfile, 
  getAdminProfile, 
  updateStudentProfile,
  updateAdminProfile 
} from '@/lib/profile/profile-service';
import { getCurrentUser } from '@/lib/auth/helpers';
import { logger } from '@/lib/logger';

const UpdateStudentProfileSchema = z.object({
  phone: z.string().min(10).max(20).optional(),
  full_name: z.string().min(1).max(255).optional(),
  room_no: z.string().max(20).optional(),
  hostel_id: z.number().int().positive().optional(),
  class_section_id: z.number().int().positive().optional(),
  blood_group: z.string().max(5).optional(),
  parent_name: z.string().max(255).optional(),
  parent_phone: z.string().max(20).optional(),
});

const UpdateAdminProfileSchema = z.object({
  phone: z.string().min(10).max(20).optional(),
  full_name: z.string().min(1).max(255).optional(),
  designation: z.string().max(100).optional(),
  department: z.string().max(100).optional(),
  employee_id: z.string().max(50).optional(),
  specialization: z.string().optional(),
});

export async function GET() {
  try {
    const { dbUser, role } = await getCurrentUser();

    if (role === 'student') {
      const profile = await getStudentProfile(dbUser.id);
      if (!profile) {
        return NextResponse.json({ error: 'Student profile not found' }, { status: 404 });
      }

      return NextResponse.json({
        type: 'student',
        id: profile.id,
        full_name: profile.full_name,
        email: profile.email,
        phone: profile.phone,
        avatar_url: profile.avatar_url,
        roll_no: profile.roll_no,
        room_no: profile.room_no,
        hostel: profile.hostel_name,
        hostel_id: profile.hostel_id,
        class_section: profile.class_section_name,
        class_section_id: profile.class_section_id,
        batch_year: profile.batch_year,
        batch_id: profile.batch_id,
        department: profile.department,
        blood_group: profile.blood_group,
        parent_name: profile.parent_name,
        parent_phone: profile.parent_phone,
      });
    } else {
      const profile = await getAdminProfile(dbUser.id);
      if (!profile) {
        return NextResponse.json({ error: 'Admin profile not found' }, { status: 404 });
      }

      return NextResponse.json({
        type: 'admin',
        id: profile.id,
        full_name: profile.full_name,
        email: profile.email,
        phone: profile.phone,
        avatar_url: profile.avatar_url,
        designation: profile.designation,
        department: profile.department,
        employee_id: profile.employee_id,
        specialization: profile.specialization,
      });
    }
  } catch (error: any) {
    logger.error({ error: error.message }, 'Error fetching profile');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const { dbUser, role } = await getCurrentUser();
    const body = await request.json();

    if (role === 'student') {
      const parsed = UpdateStudentProfileSchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json({ 
          error: 'Invalid request data',
          details: parsed.error.format()
        }, { status: 400 });
      }

      await updateStudentProfile(dbUser.id, parsed.data);

      return NextResponse.json({
        message: 'Profile updated successfully',
      });
    } else {
      const parsed = UpdateAdminProfileSchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json({ 
          error: 'Invalid request data',
          details: parsed.error.format()
        }, { status: 400 });
      }

      await updateAdminProfile(dbUser.id, parsed.data);

      return NextResponse.json({
        message: 'Profile updated successfully',
      });
    }
  } catch (error: any) {
    logger.error({ error: error.message }, 'Error updating profile');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
