/**
 * Student Management Service
 * 
 * Handles all student CRUD operations for super admin
 */

import { db, users, students, hostels, batches, class_sections, roles } from '@/db';
import { eq, and, or, ilike, sql, desc } from 'drizzle-orm';
import { logger } from '@/lib/logger';

export interface StudentData {
  full_name: string;
  email: string;
  phone: string;
  roll_no?: string | null;
  room_no?: string | null;
  hostel_id?: number | null;
  class_section_id?: number | null;
  batch_id?: number | null;
  department?: string | null;
  blood_group?: string | null;
  parent_name?: string | null;
  parent_phone?: string | null;
}

/**
 * List all students with filters
 */
export async function listStudents(params: {
  page?: number;
  limit?: number;
  search?: string;
  hostel?: string;
  batch_year?: number;
}) {
  try {
    const page = params.page || 1;
    const limit = params.limit || 50;
    const offset = (page - 1) * limit;

    const whereConditions: any[] = [];

    if (params.search) {
      whereConditions.push(
        or(
          ilike(users.full_name, `%${params.search}%`),
          ilike(users.email, `%${params.search}%`),
          ilike(students.roll_no, `%${params.search}%`)
        )
      );
    }

    if (params.hostel) {
      whereConditions.push(ilike(hostels.name, params.hostel));
    }

    if (params.batch_year) {
      whereConditions.push(eq(batches.year, params.batch_year));
    }

    const studentsData = await db
      .select({
        student_id: students.id,
        user_id: users.id,
        email: users.email,
        full_name: users.full_name,
        phone: users.phone,
        roll_no: students.roll_no,
        room_no: students.room_no,
        hostel: hostels.name,
        hostel_id: students.hostel_id,
        class_section: class_sections.name,
        class_section_id: students.class_section_id,
        batch_year: batches.year,
        batch_id: students.batch_id,
        department: students.department,
        blood_group: students.blood_group,
        parent_name: students.parent_name,
        parent_phone: students.parent_phone,
        is_active: users.is_active,
        created_at: students.created_at,
        updated_at: students.updated_at,
      })
      .from(students)
      .innerJoin(users, eq(students.user_id, users.id))
      .leftJoin(hostels, eq(students.hostel_id, hostels.id))
      .leftJoin(class_sections, eq(students.class_section_id, class_sections.id))
      .leftJoin(batches, eq(students.batch_id, batches.id))
      .where(whereConditions.length > 0 ? and(...whereConditions) : undefined)
      .orderBy(desc(students.created_at))
      .limit(limit)
      .offset(offset);

    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(students)
      .innerJoin(users, eq(students.user_id, users.id))
      .leftJoin(hostels, eq(students.hostel_id, hostels.id))
      .leftJoin(batches, eq(students.batch_id, batches.id))
      .where(whereConditions.length > 0 ? and(...whereConditions) : undefined);

    return {
      students: studentsData,
      pagination: {
        page,
        limit,
        total: count,
        totalPages: Math.ceil(count / limit),
      },
    };
  } catch (error) {
    logger.error({ error }, 'Error listing students');
    throw error;
  }
}

/**
 * Create a new student
 */
export async function createStudent(data: StudentData) {
  try {
    let studentId: number;

    await db.transaction(async (tx) => {
      // Get student role ID
      const [studentRole] = await tx
        .select({ id: roles.id })
        .from(roles)
        .where(eq(roles.name, 'student'))
        .limit(1);

      if (!studentRole) {
        throw new Error('Student role not found');
      }

      // Create user
      const [user] = await tx
        .insert(users)
        .values({
          external_id: `manual_${Date.now()}_${Math.random()}`, // Temporary until Clerk sync
          email: data.email,
          phone: data.phone,
          full_name: data.full_name,
          role_id: studentRole.id,
          is_active: true,
        })
        .returning();

      // Create student profile
      const [student] = await tx
        .insert(students)
        .values({
          user_id: user.id,
          roll_no: data.roll_no || null,
          room_no: data.room_no || null,
          hostel_id: data.hostel_id || null,
          class_section_id: data.class_section_id || null,
          batch_id: data.batch_id || null,
          department: data.department || null,
          blood_group: data.blood_group || null,
          parent_name: data.parent_name || null,
          parent_phone: data.parent_phone || null,
        })
        .returning();

      studentId = student.id;
    });

    logger.info({ email: data.email }, 'Student created');
    return studentId!;
  } catch (error) {
    logger.error({ error, email: data.email }, 'Error creating student');
    throw error;
  }
}

/**
 * Update student profile
 */
export async function updateStudent(studentId: number, data: Partial<StudentData>) {
  try {
    await db.transaction(async (tx) => {
      // Get student's user_id
      const [student] = await tx
        .select({ user_id: students.user_id })
        .from(students)
        .where(eq(students.id, studentId))
        .limit(1);

      if (!student) {
        throw new Error('Student not found');
      }

      // Update user table
      const userUpdates: any = {};
      if (data.full_name !== undefined) userUpdates.full_name = data.full_name;
      if (data.email !== undefined) userUpdates.email = data.email;
      if (data.phone !== undefined) userUpdates.phone = data.phone;

      if (Object.keys(userUpdates).length > 0) {
        userUpdates.updated_at = new Date();
        await tx
          .update(users)
          .set(userUpdates)
          .where(eq(users.id, student.user_id));
      }

      // Update student table
      const studentUpdates: any = {};
      if (data.roll_no !== undefined) studentUpdates.roll_no = data.roll_no;
      if (data.room_no !== undefined) studentUpdates.room_no = data.room_no;
      if (data.hostel_id !== undefined) studentUpdates.hostel_id = data.hostel_id;
      if (data.class_section_id !== undefined) studentUpdates.class_section_id = data.class_section_id;
      if (data.batch_id !== undefined) studentUpdates.batch_id = data.batch_id;
      if (data.department !== undefined) studentUpdates.department = data.department;
      if (data.blood_group !== undefined) studentUpdates.blood_group = data.blood_group;
      if (data.parent_name !== undefined) studentUpdates.parent_name = data.parent_name;
      if (data.parent_phone !== undefined) studentUpdates.parent_phone = data.parent_phone;

      if (Object.keys(studentUpdates).length > 0) {
        studentUpdates.updated_at = new Date();
        await tx
          .update(students)
          .set(studentUpdates)
          .where(eq(students.id, studentId));
      }
    });

    logger.info({ studentId }, 'Student updated');
  } catch (error) {
    logger.error({ error, studentId }, 'Error updating student');
    throw error;
  }
}

/**
 * Deactivate student
 */
export async function deactivateStudent(studentId: number) {
  try {
    await db.transaction(async (tx) => {
      const [student] = await tx
        .select({ user_id: students.user_id })
        .from(students)
        .where(eq(students.id, studentId))
        .limit(1);

      if (!student) {
        throw new Error('Student not found');
      }

      await tx
        .update(users)
        .set({ is_active: false, updated_at: new Date() })
        .where(eq(users.id, student.user_id));
    });

    logger.info({ studentId }, 'Student deactivated');
  } catch (error) {
    logger.error({ error, studentId }, 'Error deactivating student');
    throw error;
  }
}

/**
 * Reactivate student
 */
export async function reactivateStudent(studentId: number) {
  try {
    await db.transaction(async (tx) => {
      const [student] = await tx
        .select({ user_id: students.user_id })
        .from(students)
        .where(eq(students.id, studentId))
        .limit(1);

      if (!student) {
        throw new Error('Student not found');
      }

      await tx
        .update(users)
        .set({ is_active: true, updated_at: new Date() })
        .where(eq(users.id, student.user_id));
    });

    logger.info({ studentId }, 'Student reactivated');
  } catch (error) {
    logger.error({ error, studentId }, 'Error reactivating student');
    throw error;
  }
}
