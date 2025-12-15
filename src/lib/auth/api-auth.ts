/**
 * API Authentication Helpers
 * 
 * Re-exports authentication functions for use in layouts and components.
 * This is a convenience module that combines auth utilities.
 */

import { auth, currentUser } from '@clerk/nextjs/server';
import { db, users } from '@/db';
import { eq } from 'drizzle-orm';
import { getUserRole as getRoleFromDB, getUserRoleFromDB } from './roles';
import { syncUser, type ClerkUser } from './user-sync';

// Re-export for convenience
export { getUserRole, getUserRoleFromDB } from './roles';

/**
 * Ensure user exists in database
 * 
 * Syncs user from Clerk to local database if they don't exist.
 * Call this in layouts to ensure user record exists before any DB operations.
 */
export async function ensureUser(clerkUserId: string): Promise<string> {
    try {
        // Check if user exists in our database by external_id
        const [existingUser] = await db
            .select({ id: users.id })
            .from(users)
            .where(eq(users.external_id, clerkUserId))
            .limit(1);

        if (existingUser) {
            return existingUser.id;
        }
    } catch (e) {
        // If the lookup failed, we'll still try to sync below
        console.error('ensureUser lookup failed, attempting sync:', e);
    }

    // User doesn't exist - fetch from Clerk and sync
    const clerkUser = await currentUser();

    if (!clerkUser) {
        throw new Error('No Clerk user found');
    }

    // Map Clerk user to our format
    const userData: ClerkUser = {
        id: clerkUser.id,
        externalId: clerkUser.id,
        emailAddresses: clerkUser.emailAddresses.map(e => ({
            emailAddress: e.emailAddress,
        })),
        phoneNumbers: clerkUser.phoneNumbers?.map(p => ({
            phoneNumber: p.phoneNumber,
        })),
        firstName: clerkUser.firstName,
        lastName: clerkUser.lastName,
        imageUrl: clerkUser.imageUrl,
    };

    // Sync user to database
    // syncUser handles external_id changes by finding user by email and updating external_id
    try {
        const userId = await syncUser(userData);
        
        // OPTIMIZATION: Wait a bit for DB write to propagate before returning
        // This helps prevent race conditions when external_id changes
        await new Promise(resolve => setTimeout(resolve, 50));
        
        return userId;
    } catch (e) {
        console.error('ensureUser sync failed:', e);
        // As a last resort, return the Clerk ID so callers don't crash
        return clerkUser.id;
    }
}

/**
 * Get authenticated user's ID from database
 * 
 * Returns the database user ID for the current Clerk user.
 * Throws if not authenticated.
 */
export async function getDbUserId(): Promise<string> {
    const { userId: clerkUserId } = await auth();

    if (!clerkUserId) {
        throw new Error('Not authenticated');
    }

    const [user] = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.external_id, clerkUserId))
        .limit(1);

    if (!user) {
        // Auto-sync if user doesn't exist
        return await ensureUser(clerkUserId);
    }

    return user.id;
}

/**
 * Get current user's database record
 * 
 * Returns full user record from database.
 */
export async function getDbUser() {
    const { userId: clerkUserId } = await auth();

    if (!clerkUserId) {
        throw new Error('Not authenticated');
    }

    const [user] = await db
        .select()
        .from(users)
        .where(eq(users.external_id, clerkUserId))
        .limit(1);

    if (!user) {
        // Auto-sync if user doesn't exist
        const newUserId = await ensureUser(clerkUserId);
        const [newUser] = await db
            .select()
            .from(users)
            .where(eq(users.id, newUserId))
            .limit(1);
        return newUser;
    }

    return user;
}
