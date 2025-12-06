/**
 * User Sync Service
 * 
 * Syncs users from Clerk to our local database.
 * - Creates/updates user records
 * - Handles role assignment
 * - Maintains data consistency
 */

import { db, users, type DbTransaction } from '@/db';
import { eq } from 'drizzle-orm';
import { logger } from '@/lib/logger';
import { Errors } from '@/lib/errors';

export interface ClerkUser {
  id: string;
  externalId: string;
  emailAddresses: Array<{ emailAddress: string }>;
  phoneNumbers?: Array<{ phoneNumber: string }>;
  firstName?: string | null;
  lastName?: string | null;
  imageUrl?: string;
}

/**
 * Sync a Clerk user to our database
 * 
 * Creates or updates user record based on Clerk data.
 * Uses upsert pattern for idempotency.
 */
export async function syncUser(
  clerkUser: ClerkUser,
  txn: DbTransaction | typeof db = db
): Promise<string> {
  const email = clerkUser.emailAddresses[0]?.emailAddress;

  if (!email) {
    throw Errors.validation('User must have an email address');
  }

  const fullName = [clerkUser.firstName, clerkUser.lastName]
    .filter(Boolean)
    .join(' ') || null;

  const phone = clerkUser.phoneNumbers?.[0]?.phoneNumber || null;

  try {
    // Check if user exists by external_id (Clerk ID)
    const [existingUser] = await txn
      .select()
      .from(users)
      .where(eq(users.external_id, clerkUser.id))
      .limit(1);

    if (existingUser) {
      // Update existing user
      const [user] = await txn
        .update(users)
        .set({
          email,
          phone,
          full_name: fullName,
          avatar_url: clerkUser.imageUrl,
          updated_at: new Date(),
        })
        .where(eq(users.id, existingUser.id))
        .returning();

      logger.info({
        userId: user.id,
        email: user.email,
      }, 'User synced');

      return user.id;
    } else {
      // Check if user exists by email (to handle manual creation or pre-seeding)
      const [existingEmailUser] = await txn
        .select()
        .from(users)
        .where(eq(users.email, email))
        .limit(1);

      if (existingEmailUser) {
        // Link existing user to Clerk ID
        const [user] = await txn
          .update(users)
          .set({
            external_id: clerkUser.id, // Link to Clerk
            phone: phone || existingEmailUser.phone, // Update phone if provided
            full_name: fullName || existingEmailUser.full_name,
            avatar_url: clerkUser.imageUrl || existingEmailUser.avatar_url,
            auth_provider: 'clerk', // Ensure provider is set
            updated_at: new Date(),
          })
          .where(eq(users.id, existingEmailUser.id))
          .returning();

        logger.info({
          userId: user.id,
          email: user.email,
          oldExternalId: existingEmailUser.external_id,
          newExternalId: clerkUser.id,
        }, 'User linked to Clerk account');

        return user.id;
      }

      // Create new user
      const [user] = await txn
        .insert(users)
        .values({
          external_id: clerkUser.id,
          email,
          phone,
          full_name: fullName,
          avatar_url: clerkUser.imageUrl,
          is_active: true,
        })
        .returning();

      logger.info({
        userId: user.id,
        email: user.email,
      }, 'User created');

      return user.id;
    }
  } catch (error) {
    logger.error({
      clerkUserId: clerkUser.id,
      error,
    }, 'Failed to sync user');
    throw error;
  }
}

/**
 * Get or create user from Clerk ID
 * 
 * Fetches user from database, syncing from Clerk if needed.
 * Use this when you have a Clerk ID and need the local user record.
 */
export async function getOrCreateUser(
  clerkUserId: string,
  clerkUser?: ClerkUser
): Promise<typeof users.$inferSelect> {
  // Try to find existing user by external_id (Clerk ID)
  const [existingUser] = await db
    .select()
    .from(users)
    .where(eq(users.external_id, clerkUserId))
    .limit(1);

  if (existingUser) {
    return existingUser;
  }

  // User not found - sync from Clerk
  if (!clerkUser) {
    throw Errors.notFound('User', clerkUserId);
  }

  const userId = await syncUser(clerkUser);

  // Fetch the newly created user
  const [newUser] = await db
    .select()
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!newUser) {
    throw Errors.internal('Failed to create user');
  }

  return newUser;
}

/**
 * Deactivate user (soft delete)
 * 
 * Called when user is deleted in Clerk.
 */
export async function deactivateUser(
  clerkUserId: string,
  txn: DbTransaction | typeof db = db
): Promise<void> {
  await txn
    .update(users)
    .set({
      is_active: false,
      updated_at: new Date(),
    })
    .where(eq(users.external_id, clerkUserId));

  logger.info({ clerkUserId }, 'User deactivated');
}
