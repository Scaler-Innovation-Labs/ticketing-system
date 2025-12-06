/**
 * Ticket Groups Service
 * 
 * Group related tickets together for bulk operations
 */

import { db, tickets, ticket_groups, ticket_activity } from '@/db';
import { eq, inArray } from 'drizzle-orm';
import { logger } from '@/lib/logger';
import { Errors } from '@/lib/errors';
import { withTransaction } from '@/lib/db-transaction';
import { getUserRole } from '@/lib/auth/roles';
import { USER_ROLES } from '@/conf/constants';

/**
 * Create a ticket group
 */
export async function createTicketGroup(
  name: string,
  description: string | undefined,
  createdBy: string,
  ticketIds?: number[]
) {
  return withTransaction(async (txn) => {
    // Check user is admin
    const role = await getUserRole(createdBy);
    if (role === USER_ROLES.STUDENT) {
      throw Errors.forbidden('Only admins can create ticket groups');
    }

    // Create group
    const [group] = await txn
      .insert(ticket_groups)
      .values({
        name,
        description: description || null,
        created_by: createdBy,
      })
      .returning();

    // Add tickets if provided
    if (ticketIds && ticketIds.length > 0) {
      // Deduplicate ticket IDs
      const uniqueTicketIds = [...new Set(ticketIds)];

      // Verify all tickets exist
      const existingTickets = await txn
        .select()
        .from(tickets)
        .where(inArray(tickets.id, uniqueTicketIds));

      if (existingTickets.length !== uniqueTicketIds.length) {
        throw Errors.validation('One or more tickets not found');
      }

      // Update tickets to belong to group
      await txn
        .update(tickets)
        .set({
          group_id: group.id,
          updated_at: new Date(),
        })
        .where(inArray(tickets.id, uniqueTicketIds));
    }

    logger.info(
      {
        groupId: group.id,
        name,
        createdBy,
        ticketCount: ticketIds?.length || 0,
      },
      'Ticket group created'
    );

    return group;
  });
}

/**
 * Add tickets to group
 */
export async function addTicketsToGroup(
  groupId: number,
  ticketIds: number[],
  userId: string
) {
  return withTransaction(async (txn) => {
    // Check user is admin
    const role = await getUserRole(userId);
    if (role === USER_ROLES.STUDENT) {
      throw Errors.forbidden('Only admins can manage ticket groups');
    }

    // Verify group exists
    const [group] = await txn
      .select()
      .from(ticket_groups)
      .where(eq(ticket_groups.id, groupId))
      .limit(1);

    if (!group) {
      throw Errors.notFound('Ticket group', String(groupId));
    }

    // Verify all tickets exist
    const existingTickets = await txn
      .select()
      .from(tickets)
      .where(inArray(tickets.id, ticketIds));

    if (existingTickets.length !== ticketIds.length) {
      throw Errors.validation('One or more tickets not found');
    }

    // Update tickets to belong to group
    const updated = await txn
      .update(tickets)
      .set({
        group_id: groupId,
        updated_at: new Date(),
      })
      .where(inArray(tickets.id, ticketIds))
      .returning();

    // Update group timestamp
    await txn
      .update(ticket_groups)
      .set({
        updated_at: new Date(),
      })
      .where(eq(ticket_groups.id, groupId));

    logger.info(
      {
        groupId,
        ticketIds,
        count: ticketIds.length,
        userId,
      },
      'Tickets added to group'
    );

    return updated;
  });
}

/**
 * Remove tickets from group
 */
export async function removeTicketsFromGroup(
  ticketIds: number[],
  userId: string
) {
  return withTransaction(async (txn) => {
    // Check user is admin
    const role = await getUserRole(userId);
    if (role === USER_ROLES.STUDENT) {
      throw Errors.forbidden('Only admins can manage ticket groups');
    }

    // Get current group IDs before removing
    const ticketsToUpdate = await txn
      .select()
      .from(tickets)
      .where(inArray(tickets.id, ticketIds));

    const groupIds = [
      ...new Set(ticketsToUpdate.map((t) => t.group_id).filter(Boolean)),
    ] as number[];

    // Remove tickets from group
    const updated = await txn
      .update(tickets)
      .set({
        group_id: null,
        updated_at: new Date(),
      })
      .where(inArray(tickets.id, ticketIds))
      .returning();

    // Update group timestamps
    for (const groupId of groupIds) {
      await txn
        .update(ticket_groups)
        .set({
          updated_at: new Date(),
        })
        .where(eq(ticket_groups.id, groupId));
    }

    logger.info(
      {
        ticketIds,
        count: ticketIds.length,
        userId,
      },
      'Tickets removed from groups'
    );

    return updated;
  });
}

/**
 * Get all tickets in a group
 */
export async function getGroupTickets(groupId: number) {
  const groupTickets = await db
    .select()
    .from(tickets)
    .where(eq(tickets.group_id, groupId));

  return groupTickets;
}

/**
 * Get group details
 */
export async function getTicketGroup(groupId: number) {
  const [group] = await db
    .select()
    .from(ticket_groups)
    .where(eq(ticket_groups.id, groupId))
    .limit(1);

  if (!group) {
    throw Errors.notFound('Ticket group', String(groupId));
  }

  return group;
}

/**
 * List all ticket groups
 */
export async function listTicketGroups() {
  const groups = await db
    .select()
    .from(ticket_groups)
    .orderBy(ticket_groups.created_at);

  return groups;
}

/**
 * Delete a ticket group
 */
export async function deleteTicketGroup(groupId: number, userId: string) {
  return withTransaction(async (txn) => {
    // Check user is admin
    const role = await getUserRole(userId);
    if (role === USER_ROLES.STUDENT) {
      throw Errors.forbidden('Only admins can delete ticket groups');
    }

    // Verify group exists
    const [group] = await txn
      .select()
      .from(ticket_groups)
      .where(eq(ticket_groups.id, groupId))
      .limit(1);

    if (!group) {
      throw Errors.notFound('Ticket group', String(groupId));
    }

    // Remove group reference from all tickets
    await txn
      .update(tickets)
      .set({
        group_id: null,
        updated_at: new Date(),
      })
      .where(eq(tickets.group_id, groupId));

    // Delete group
    await txn.delete(ticket_groups).where(eq(ticket_groups.id, groupId));

    logger.info(
      {
        groupId,
        userId,
      },
      'Ticket group deleted'
    );

    return group;
  });
}
