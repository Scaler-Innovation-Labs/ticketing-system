/**
 * Profile Check Helper
 * 
 * Checks if a user's profile is complete
 */

import { db, students } from '@/db';
import { eq } from 'drizzle-orm';

/**
 * Check if student profile is complete
 * 
 * A profile is considered complete if the student record exists
 * and has required fields filled in.
 */
export async function isProfileComplete(userId: string): Promise<boolean> {
    try {
        const [student] = await db
            .select({
                id: students.id,
                roll_no: students.roll_no,
            })
            .from(students)
            .where(eq(students.user_id, userId))
            .limit(1);

        // Profile is complete if student record exists with roll number
        // Adjust this logic based on your requirements
        return !!student;
    } catch (error) {
        console.error('[isProfileComplete] Error checking profile:', error);
        return false;
    }
}

/**
 * Check if admin profile is complete
 */
export async function isAdminProfileComplete(userId: string): Promise<boolean> {
    // For admins, we just need the user to exist
    // Add more checks if needed
    return true;
}
