/**
 * Profile Service
 * 
 * Handles user profile operations including get and update for students and admins.
 */

import { db } from '@/db';
import { users, students, admin_profiles, hostels, class_sections, batches } from '@/db';
import { eq, and } from 'drizzle-orm';
import { Errors } from '@/lib/errors';
import { logger } from '@/lib/logger';

// ============================================
// Types
// ============================================

export interface StudentProfile {
  id: string;
  email: string;
  phone: string | null;
  full_name: string | null;
  avatar_url: string | null;
  roll_no: string | null;
  room_no: string | null;
  hostel_name: string | null;
  hostel_id: number | null;
  class_section_name: string | null;
  class_section_id: number | null;
  batch_year: number | null;
  batch_id: number | null;
  department: string | null;
  blood_group: string | null;
  parent_name: string | null;
  parent_phone: string | null;
}

export interface AdminProfile {
  id: string;
  email: string;
  phone: string | null;
  full_name: string | null;
  avatar_url: string | null;
  designation: string | null;
  department: string | null;
  employee_id: string | null;
  specialization: string | null;
}

export interface UpdateStudentProfileInput {
  phone?: string;
  full_name?: string;
  room_no?: string;
  hostel_id?: number;
  class_section_id?: number;
  blood_group?: string;
  parent_name?: string;
  parent_phone?: string;
}

export interface UpdateAdminProfileInput {
  phone?: string;
  full_name?: string;
  designation?: string;
  department?: string;
  employee_id?: string;
  specialization?: string;
}

// ============================================
// Student Profile Functions
// ============================================

/**
 * Get student profile by user ID
 */
export async function getStudentProfile(userId: string): Promise<StudentProfile | null> {
  const result = await db
    .select({
      id: users.id,
      email: users.email,
      phone: users.phone,
      full_name: users.full_name,
      avatar_url: users.avatar_url,
      roll_no: students.roll_no,
      room_no: students.room_no,
      hostel_id: students.hostel_id,
      hostel_name: hostels.name,
      class_section_id: students.class_section_id,
      class_section_name: class_sections.name,
      batch_id: students.batch_id,
      batch_year: batches.year,
      department: students.department,
      blood_group: students.blood_group,
      parent_name: students.parent_name,
      parent_phone: students.parent_phone,
    })
    .from(users)
    .innerJoin(students, eq(students.user_id, users.id))
    .leftJoin(hostels, eq(students.hostel_id, hostels.id))
    .leftJoin(class_sections, eq(students.class_section_id, class_sections.id))
    .leftJoin(batches, eq(students.batch_id, batches.id))
    .where(eq(users.id, userId))
    .limit(1);

  if (!result.length) {
    return null;
  }

  return result[0];
}

/**
 * Update student profile
 */
export async function updateStudentProfile(
  userId: string,
  data: UpdateStudentProfileInput
): Promise<void> {
  // Update user fields
  if (data.phone !== undefined || data.full_name !== undefined) {
    const userUpdate: Record<string, any> = {
      updated_at: new Date(),
    };
    if (data.full_name !== undefined) userUpdate.full_name = data.full_name;
    if (data.phone !== undefined) userUpdate.phone = data.phone;

    await db
      .update(users)
      .set(userUpdate)
      .where(eq(users.id, userId));
  }

  // Update student fields
  const studentFields = ['room_no', 'hostel_id', 'class_section_id', 'blood_group', 'parent_name', 'parent_phone'];
  const hasStudentUpdate = studentFields.some(f => (data as any)[f] !== undefined);

  if (hasStudentUpdate) {
    const studentUpdate: Record<string, any> = {};
    if (data.room_no !== undefined) studentUpdate.room_no = data.room_no;
    if (data.hostel_id !== undefined) studentUpdate.hostel_id = data.hostel_id;
    if (data.class_section_id !== undefined) studentUpdate.class_section_id = data.class_section_id;
    if (data.blood_group !== undefined) studentUpdate.blood_group = data.blood_group;
    if (data.parent_name !== undefined) studentUpdate.parent_name = data.parent_name;
    if (data.parent_phone !== undefined) studentUpdate.parent_phone = data.parent_phone;

    await db
      .update(students)
      .set(studentUpdate)
      .where(eq(students.user_id, userId));
  }

  logger.info({ userId, fields: Object.keys(data) }, 'Updated student profile');
}

// ============================================
// Admin Profile Functions
// ============================================

/**
 * Get admin profile by user ID
 */
export async function getAdminProfile(userId: string): Promise<AdminProfile | null> {
  const result = await db
    .select({
      id: users.id,
      email: users.email,
      phone: users.phone,
      full_name: users.full_name,
      avatar_url: users.avatar_url,
      designation: admin_profiles.designation,
      department: admin_profiles.department,
      employee_id: admin_profiles.employee_id,
      specialization: admin_profiles.specialization,
    })
    .from(users)
    .innerJoin(admin_profiles, eq(admin_profiles.user_id, users.id))
    .where(eq(users.id, userId))
    .limit(1);

  if (!result.length) {
    return null;
  }

  return result[0];
}

/**
 * Update admin profile
 */
export async function updateAdminProfile(
  userId: string,
  data: UpdateAdminProfileInput
): Promise<void> {
  // Update user fields
  if (data.phone !== undefined || data.full_name !== undefined) {
    const userUpdate: Record<string, any> = {
      updated_at: new Date(),
    };
    if (data.full_name !== undefined) userUpdate.full_name = data.full_name;
    if (data.phone !== undefined) userUpdate.phone = data.phone;

    await db
      .update(users)
      .set(userUpdate)
      .where(eq(users.id, userId));
  }

  // Update admin fields
  const adminFields = ['designation', 'department', 'employee_id', 'specialization'];
  const hasAdminUpdate = adminFields.some(f => (data as any)[f] !== undefined);

  if (hasAdminUpdate) {
    const adminUpdate: Record<string, any> = {
      updated_at: new Date(),
    };
    if (data.designation !== undefined) adminUpdate.designation = data.designation;
    if (data.department !== undefined) adminUpdate.department = data.department;
    if (data.employee_id !== undefined) adminUpdate.employee_id = data.employee_id;
    if (data.specialization !== undefined) adminUpdate.specialization = data.specialization;

    await db
      .update(admin_profiles)
      .set(adminUpdate)
      .where(eq(admin_profiles.user_id, userId));
  }

  logger.info({ userId, fields: Object.keys(data) }, 'Updated admin profile');
}

// ============================================
// Full Profile (for API spec compliance)
// ============================================

export interface FullProfile {
  user: {
    id: string;
    email: string;
    phone: string | null;
    full_name: string | null;
    avatar_url: string | null;
    role: string | null;
    created_at: Date;
  };
  student_profile: StudentProfile | null;
  admin_profile: AdminProfile | null;
}

/**
 * Get user's full profile for API spec compliance
 */
export async function getFullProfile(userId: string): Promise<FullProfile> {
  const studentProfile = await getStudentProfile(userId);
  const adminProfile = await getAdminProfile(userId);

  // Get base user
  const userResult = await db
    .select()
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!userResult.length) {
    throw Errors.notFound('User', userId);
  }

  const user = userResult[0];

  return {
    user: {
      id: user.id,
      email: user.email,
      phone: user.phone,
      full_name: user.full_name,
      avatar_url: user.avatar_url,
      role: null, // Will be fetched separately if needed
      created_at: user.created_at,
    },
    student_profile: studentProfile,
    admin_profile: adminProfile,
  };
}
