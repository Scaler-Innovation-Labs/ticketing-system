/**
 * Ticket Groups Service
 * 
 * Group related tickets together for bulk operations
 */

import { db, tickets, ticket_groups, ticket_activity, ticket_statuses, categories, ticket_committee_tags, committees } from '@/db';
import { eq, inArray, and, sql, or, isNull } from 'drizzle-orm';
import { logger } from '@/lib/logger';
import { Errors } from '@/lib/errors';
import { withTransaction } from '@/lib/db-transaction';
import { getUserRole } from '@/lib/auth/roles';
import { USER_ROLES, TICKET_STATUS } from '@/conf/constants';
import { parseTAT } from './ticket-operations-service';
import { getStatusId } from './ticket-service';

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
export async function listTicketGroups(domainId?: number, userId?: string) {
  const groups = await db
    .select()
    .from(ticket_groups)
    .orderBy(ticket_groups.created_at);

  if (groups.length === 0) {
    return [];
  }

  const groupIds = groups.map((g) => g.id);

  // Build where condition: for snr_admin, show tickets assigned to them OR unassigned tickets in their domain
  let ticketsWhere;
  if (domainId && userId) {
    // For snr_admin: tickets assigned to them OR unassigned tickets in their domain (no scope check)
    ticketsWhere = and(
      inArray(tickets.group_id, groupIds),
      or(
        eq(tickets.assigned_to, userId),
        and(
          isNull(tickets.assigned_to),
          eq(categories.domain_id, domainId)
        )
      )
    );
  } else if (domainId) {
    // Domain-only filter (existing behavior)
    ticketsWhere = and(inArray(tickets.group_id, groupIds), eq(categories.domain_id, domainId));
  } else {
    // No filter (existing behavior)
    ticketsWhere = inArray(tickets.group_id, groupIds);
  }

  const groupTickets = await db
    .select({
      id: tickets.id,
      status: ticket_statuses.value,
      description: tickets.description,
      location: tickets.location,
      created_at: tickets.created_at,
      category_name: categories.name,
      resolution_due_at: tickets.resolution_due_at,
      metadata: tickets.metadata,
      group_id: tickets.group_id,
      category_domain_id: categories.domain_id,
    })
    .from(tickets)
    .leftJoin(ticket_statuses, eq(tickets.status_id, ticket_statuses.id))
    .leftJoin(categories, eq(tickets.category_id, categories.id))
    .where(ticketsWhere);

  // Map tickets to groups
  const groupsWithTickets = groups.map((group) => {
    const groupTicketsList = groupTickets.filter((t) => t.group_id === group.id);
    return {
      ...group,
      is_archived: !group.is_active,
      tickets: groupTicketsList,
      ticketCount: groupTicketsList.length,
    };
  });

  return domainId
    ? groupsWithTickets.filter((g) => g.ticketCount > 0)
    : groupsWithTickets;
}

/**
 * Update a ticket group
 */
export async function updateTicketGroup(
  groupId: number,
  userId: string,
  updates: {
    name?: string;
    description?: string | null;
    groupTAT?: string;
    committee_id?: number | null;
  }
) {
  return withTransaction(async (txn) => {
    // Check user is admin
    const role = await getUserRole(userId);
    if (role === USER_ROLES.STUDENT) {
      throw Errors.forbidden('Only admins can update ticket groups');
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

    // Update group fields if provided
    const groupUpdates: any = {
      updated_at: new Date(),
    };

    if (updates.name !== undefined) {
      groupUpdates.name = updates.name;
    }

    if (updates.description !== undefined) {
      groupUpdates.description = updates.description;
    }

    if (Object.keys(groupUpdates).length > 1) {
      // Only update if there are actual changes
      await txn
        .update(ticket_groups)
        .set(groupUpdates)
        .where(eq(ticket_groups.id, groupId));
    }

    // Get all tickets in the group
    const groupTickets = await txn
      .select({ id: tickets.id })
      .from(tickets)
      .where(eq(tickets.group_id, groupId));

    const ticketIds = groupTickets.map(t => t.id);

    // Handle groupTAT - set TAT for all tickets in group
    if (updates.groupTAT !== undefined && ticketIds.length > 0) {
      const hours = parseTAT(updates.groupTAT);
      const now = new Date();
      const deadline = new Date(now.getTime() + hours * 60 * 60 * 1000);
      const userName = 'Admin';

      const metadataUpdates = {
        tatSetAt: now.toISOString(),
        tatSetBy: userName,
        tatDate: deadline.toISOString(),
      };

      const inProgressId = await getStatusId(TICKET_STATUS.IN_PROGRESS);

      // Update all tickets in the group
      await txn
        .update(tickets)
        .set({
          resolution_due_at: deadline,
          updated_at: now,
          metadata: sql`COALESCE(metadata, '{}'::jsonb) || ${JSON.stringify(metadataUpdates)}::jsonb`,
          status_id: inProgressId, // Mark all as in progress when TAT is set
        })
        .where(inArray(tickets.id, ticketIds));

      // Log activity for each ticket
      await txn.insert(ticket_activity).values(
        ticketIds.map((ticketId) => ({
          ticket_id: ticketId,
          user_id: userId,
          action: 'tat_set',
          details: {
            tat_string: updates.groupTAT,
            hours,
            deadline,
            status_changed: true,
            group_tat: true,
          },
          visibility: 'admin_only',
        }))
      );
    }

    // Handle committee assignment - tag all tickets in group to committee
    if (updates.committee_id !== undefined && ticketIds.length > 0) {
      if (updates.committee_id === null) {
        // Remove committee tags from all tickets
        await txn
          .delete(ticket_committee_tags)
          .where(inArray(ticket_committee_tags.ticket_id, ticketIds));
      } else {
        // Verify committee exists
        const [committee] = await txn
          .select()
          .from(committees)
          .where(eq(committees.id, updates.committee_id))
          .limit(1);

        if (!committee) {
          throw Errors.notFound('Committee', String(updates.committee_id));
        }

        // Tag all tickets to the committee
        // First remove existing tags
        await txn
          .delete(ticket_committee_tags)
          .where(inArray(ticket_committee_tags.ticket_id, ticketIds));

        // Add new tags for all tickets
        if (ticketIds.length > 0) {
          await txn
            .insert(ticket_committee_tags)
            .values(
              ticketIds.map((ticketId) => ({
                ticket_id: ticketId,
                committee_id: updates.committee_id!,
                tagged_by: userId,
              }))
            );

          // Log activity for each ticket
          await txn.insert(ticket_activity).values(
            ticketIds.map((ticketId) => ({
              ticket_id: ticketId,
              user_id: userId,
              action: 'committee_tagged',
              details: {
                committee_id: updates.committee_id,
                committee_name: committee.name,
                group_tagged: true,
              },
              visibility: 'admin_only',
            }))
          );
        }
      }
    }

    logger.info(
      {
        groupId,
        userId,
        updates,
        ticketCount: ticketIds.length,
      },
      'Ticket group updated'
    );

    // Return updated group
    const [updatedGroup] = await txn
      .select()
      .from(ticket_groups)
      .where(eq(ticket_groups.id, groupId))
      .limit(1);

    return updatedGroup;
  });
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

/**
 * Archive a ticket group (set is_active to false)
 */
export async function archiveTicketGroup(groupId: number, userId: string) {
  return withTransaction(async (txn) => {
    // Check user is admin
    const role = await getUserRole(userId);
    if (role === USER_ROLES.STUDENT) {
      throw Errors.forbidden('Only admins can archive ticket groups');
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

    // Archive group (set is_active to false)
    const [archivedGroup] = await txn
      .update(ticket_groups)
      .set({
        is_active: false,
        updated_at: new Date(),
      })
      .where(eq(ticket_groups.id, groupId))
      .returning();

    logger.info(
      {
        groupId,
        userId,
      },
      'Ticket group archived'
    );

    return archivedGroup;
  });
}
