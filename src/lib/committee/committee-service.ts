/**
 * Committee Management Service
 * 
 * Handles committee CRUD operations and member management
 */

import { db } from '@/db';
import { committees, committee_members, users, roles } from '@/db';
import { eq, and, inArray } from 'drizzle-orm';
import { logger } from '@/lib/logger';

export interface CreateCommitteeInput {
  name: string;
  description?: string | null;
  contact_email?: string | null;
  head_id?: string | null;
}

export interface UpdateCommitteeInput {
  name?: string;
  description?: string | null;
  contact_email?: string | null;
  head_id?: string | null;
}

/**
 * List all committees
 */
export async function listCommittees(activeOnly: boolean = false) {
  try {
    const query = db
      .select({
        id: committees.id,
        name: committees.name,
        description: committees.description,
        contact_email: committees.contact_email,
        head_id: committees.head_id,
        is_active: committees.is_active,
        created_at: committees.created_at,
        updated_at: committees.updated_at,
      })
      .from(committees);

    if (activeOnly) {
      query.where(eq(committees.is_active, true));
    }

    const result = await query.orderBy(committees.name);
    return result;
  } catch (error) {
    logger.error({ error }, 'Failed to list committees');
    throw error;
  }
}

/**
 * Get committee by ID
 */
export async function getCommitteeById(committeeId: number) {
  try {
    const [committee] = await db
      .select({
        id: committees.id,
        name: committees.name,
        description: committees.description,
        contact_email: committees.contact_email,
        head_id: committees.head_id,
        is_active: committees.is_active,
        created_at: committees.created_at,
        updated_at: committees.updated_at,
      })
      .from(committees)
      .where(eq(committees.id, committeeId))
      .limit(1);

    return committee || null;
  } catch (error) {
    logger.error({ error, committeeId }, 'Failed to get committee');
    throw error;
  }
}

/**
 * Create a new committee
 */
export async function createCommittee(input: CreateCommitteeInput) {
  try {
    // Check for duplicate name
    const [existing] = await db
      .select({ id: committees.id })
      .from(committees)
      .where(eq(committees.name, input.name.trim()))
      .limit(1);

    if (existing) {
      throw new Error('A committee with this name already exists');
    }

    let headId = input.head_id;

    // If contact_email is provided but head_id is not, create or find user and assign committee role
    if (input.contact_email && !headId) {
      const email = input.contact_email.trim().toLowerCase();
      
      // Check if user exists
      let [existingUser] = await db
        .select({ id: users.id, role_id: users.role_id })
        .from(users)
        .where(eq(users.email, email))
        .limit(1);

      // Get committee role
      const [committeeRole] = await db
        .select({ id: roles.id })
        .from(roles)
        .where(eq(roles.name, 'committee'))
        .limit(1);

      if (!committeeRole) {
        throw new Error('Committee role not found in database');
      }

      if (existingUser) {
        // User exists - update their role to committee if not already
        if (existingUser.role_id !== committeeRole.id) {
          await db
            .update(users)
            .set({
              role_id: committeeRole.id,
              is_active: true,
              updated_at: new Date(),
            })
            .where(eq(users.id, existingUser.id));
        }
        headId = existingUser.id;
      } else {
        // Create new user with committee role
        const [newUser] = await db
          .insert(users)
          .values({
            email: email,
            external_id: `pending_${Date.now()}_${Math.random().toString(36).substring(7)}`,
            auth_provider: 'clerk',
            role_id: committeeRole.id,
            is_active: true,
          })
          .returning();
        
        headId = newUser.id;
        logger.info({ userId: newUser.id, email }, 'Created new user for committee head');
      }
    }

    // If head_id provided, verify user exists
    if (headId) {
      const [headUser] = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.id, headId))
        .limit(1);

      if (!headUser) {
        throw new Error('Head user not found');
      }
    }

    const [committee] = await db
      .insert(committees)
      .values({
        name: input.name.trim(),
        description: input.description?.trim() || null,
        contact_email: input.contact_email?.trim().toLowerCase() || null,
        head_id: headId,
        is_active: true,
      })
      .returning();

    logger.info({ committeeId: committee.id, name: committee.name, headId }, 'Committee created');
    return committee;
  } catch (error) {
    logger.error({ error, input }, 'Failed to create committee');
    throw error;
  }
}

/**
 * Update a committee
 */
export async function updateCommittee(
  committeeId: number,
  input: UpdateCommitteeInput
) {
  try {
    // Verify committee exists
    const existing = await getCommitteeById(committeeId);
    if (!existing) {
      throw new Error('Committee not found');
    }

    // Check for name conflicts if name is being updated
    if (input.name && input.name !== existing.name) {
      const [duplicate] = await db
        .select({ id: committees.id })
        .from(committees)
        .where(eq(committees.name, input.name.trim()))
        .limit(1);

      if (duplicate && duplicate.id !== committeeId) {
        throw new Error('A committee with this name already exists');
      }
    }

    let headId: string | null | undefined = input.head_id;

    // If contact_email is being updated and head_id is not explicitly set, create or find user
    if (input.contact_email !== undefined && input.head_id === undefined) {
      const email = input.contact_email?.trim().toLowerCase();
      
      if (email) {
        // Check if user exists
        let [existingUser] = await db
          .select({ id: users.id, role_id: users.role_id })
          .from(users)
          .where(eq(users.email, email))
          .limit(1);

        // Get committee role
        const [committeeRole] = await db
          .select({ id: roles.id })
          .from(roles)
          .where(eq(roles.name, 'committee'))
          .limit(1);

        if (!committeeRole) {
          throw new Error('Committee role not found in database');
        }

        if (existingUser) {
          // User exists - update their role to committee if not already
          if (existingUser.role_id !== committeeRole.id) {
            await db
              .update(users)
              .set({
                role_id: committeeRole.id,
                is_active: true,
                updated_at: new Date(),
              })
              .where(eq(users.id, existingUser.id));
          }
          headId = existingUser.id;
        } else {
          // Create new user with committee role
          const [newUser] = await db
            .insert(users)
            .values({
              email: email,
              external_id: `pending_${Date.now()}_${Math.random().toString(36).substring(7)}`,
              auth_provider: 'clerk',
              role_id: committeeRole.id,
              is_active: true,
            })
            .returning();
          
          headId = newUser.id;
          logger.info({ userId: newUser.id, email }, 'Created new user for committee head');
        }
      } else {
        // If contact_email is being cleared, keep existing head_id
        headId = existing.head_id;
      }
    } else if (input.head_id === undefined) {
      // If head_id is not being updated, keep existing
      headId = existing.head_id;
    }

    // If head_id is set, verify user exists
    if (headId !== undefined && headId !== null) {
      const [headUser] = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.id, headId))
        .limit(1);

      if (!headUser) {
        throw new Error('Head user not found');
      }
    }

    const updateData: any = {
      updated_at: new Date(),
    };

    if (input.name !== undefined) {
      updateData.name = input.name.trim();
    }
    if (input.description !== undefined) {
      updateData.description = input.description?.trim() || null;
    }
    if (input.contact_email !== undefined) {
      updateData.contact_email = input.contact_email?.trim().toLowerCase() || null;
    }
    if (headId !== undefined) {
      updateData.head_id = headId;
    }

    const [updated] = await db
      .update(committees)
      .set(updateData)
      .where(eq(committees.id, committeeId))
      .returning();

    logger.info({ committeeId, updates: input }, 'Committee updated');
    return updated;
  } catch (error) {
    logger.error({ error, committeeId, input }, 'Failed to update committee');
    throw error;
  }
}

/**
 * Delete (deactivate) a committee
 */
export async function deleteCommittee(committeeId: number) {
  try {
    const [deleted] = await db
      .update(committees)
      .set({
        is_active: false,
        updated_at: new Date(),
      })
      .where(eq(committees.id, committeeId))
      .returning();

    if (!deleted) {
      throw new Error('Committee not found');
    }

    logger.info({ committeeId }, 'Committee deactivated');
    return deleted;
  } catch (error) {
    logger.error({ error, committeeId }, 'Failed to delete committee');
    throw error;
  }
}

/**
 * Get committee members
 */
export async function getCommitteeMembers(committeeId: number) {
  try {
    const members = await db
      .select({
        id: committee_members.id,
        committee_id: committee_members.committee_id,
        user_id: committee_members.user_id,
        role: committee_members.role,
        joined_at: committee_members.joined_at,
        user_name: users.full_name,
        user_email: users.email,
      })
      .from(committee_members)
      .innerJoin(users, eq(committee_members.user_id, users.id))
      .where(eq(committee_members.committee_id, committeeId))
      .orderBy(committee_members.joined_at);

    return members;
  } catch (error) {
    logger.error({ error, committeeId }, 'Failed to get committee members');
    throw error;
  }
}

/**
 * Add member to committee
 */
export async function addCommitteeMember(
  committeeId: number,
  userId: string,
  role: string = 'member'
) {
  try {
    return await db.transaction(async (tx) => {
      // Verify committee exists
      const [committee] = await tx
        .select({ id: committees.id })
        .from(committees)
        .where(eq(committees.id, committeeId))
        .limit(1);

      if (!committee) {
        throw new Error('Committee not found');
      }

      // Verify user exists
      const [user] = await tx
        .select({ id: users.id })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      if (!user) {
        throw new Error('User not found');
      }

      // Check if already a member
      const [existing] = await tx
        .select({ id: committee_members.id })
        .from(committee_members)
        .where(
          and(
            eq(committee_members.committee_id, committeeId),
            eq(committee_members.user_id, userId)
          )
        )
        .limit(1);

      if (existing) {
        throw new Error('User is already a member of this committee');
      }

      // Add member
      const [member] = await tx
        .insert(committee_members)
        .values({
          committee_id: committeeId,
          user_id: userId,
          role,
        })
        .returning();

      logger.info(
        { committeeId, userId, role },
        'Member added to committee'
      );

      return member;
    });
  } catch (error) {
    logger.error({ error, committeeId, userId }, 'Failed to add committee member');
    throw error;
  }
}

/**
 * Remove member from committee
 */
export async function removeCommitteeMember(
  committeeId: number,
  userId: string
) {
  try {
    const [removed] = await db
      .delete(committee_members)
      .where(
        and(
          eq(committee_members.committee_id, committeeId),
          eq(committee_members.user_id, userId)
        )
      )
      .returning();

    if (!removed) {
      throw new Error('Committee member not found');
    }

    logger.info({ committeeId, userId }, 'Member removed from committee');
    return removed;
  } catch (error) {
    logger.error({ error, committeeId, userId }, 'Failed to remove committee member');
    throw error;
  }
}
