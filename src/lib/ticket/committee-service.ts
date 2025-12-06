/**
 * Committee Tagging Service
 * 
 * Tag tickets to committees for routing and assignment
 */

import { db, tickets, ticket_committee_tags, committees, ticket_activity } from '@/db';
import { eq, and, inArray } from 'drizzle-orm';
import { logger } from '@/lib/logger';
import { Errors } from '@/lib/errors';
import { withTransaction } from '@/lib/db-transaction';
import { getUserRole } from '@/lib/auth/roles';
import { USER_ROLES } from '@/conf/constants';

/**
 * Tag ticket to committee(s)
 * Only admins and super admins can tag
 */
export async function tagTicketToCommittee(
  ticketId: number,
  committeeIds: number[],
  taggedBy: string
) {
  return withTransaction(async (txn) => {
    // Check user is admin
    const role = await getUserRole(taggedBy);
    if (role === USER_ROLES.STUDENT) {
      throw Errors.forbidden('Only admins can tag tickets to committees');
    }

    // Verify ticket exists
    const [ticket] = await txn
      .select()
      .from(tickets)
      .where(eq(tickets.id, ticketId))
      .limit(1);

    if (!ticket) {
      throw Errors.notFound('Ticket', String(ticketId));
    }

    // Verify all committees exist
    const existingCommittees = await txn
      .select()
      .from(committees)
      .where(inArray(committees.id, committeeIds));

    if (existingCommittees.length !== committeeIds.length) {
      throw Errors.validation('One or more committees not found');
    }

    // Remove existing tags for this ticket
    await txn
      .delete(ticket_committee_tags)
      .where(eq(ticket_committee_tags.ticket_id, ticketId));

    // Add new tags
    const tags = await txn
      .insert(ticket_committee_tags)
      .values(
        committeeIds.map((committeeId) => ({
          ticket_id: ticketId,
          committee_id: committeeId,
          tagged_by: taggedBy,
        }))
      )
      .returning();

    // Log activity
    await txn.insert(ticket_activity).values({
      ticket_id: ticketId,
      user_id: taggedBy,
      action: 'committee_tagged',
      details: {
        committee_ids: committeeIds,
        committee_names: existingCommittees.map((c) => c.name),
      },
      visibility: 'admin_only',
    });

    // Update ticket timestamp
    await txn
      .update(tickets)
      .set({ updated_at: new Date() })
      .where(eq(tickets.id, ticketId));

    logger.info(
      {
        ticketId,
        committeeIds,
        taggedBy,
      },
      'Ticket tagged to committees'
    );

    return tags;
  });
}

/**
 * Remove committee tag from ticket
 */
export async function removeCommitteeTag(
  ticketId: number,
  committeeId: number,
  removedBy: string
) {
  return withTransaction(async (txn) => {
    // Check user is admin
    const role = await getUserRole(removedBy);
    if (role === USER_ROLES.STUDENT) {
      throw Errors.forbidden('Only admins can remove committee tags');
    }

    // Verify ticket exists
    const [ticket] = await txn
      .select()
      .from(tickets)
      .where(eq(tickets.id, ticketId))
      .limit(1);

    if (!ticket) {
      throw Errors.notFound('Ticket', String(ticketId));
    }

    // Delete tag
    const deleted = await txn
      .delete(ticket_committee_tags)
      .where(
        and(
          eq(ticket_committee_tags.ticket_id, ticketId),
          eq(ticket_committee_tags.committee_id, committeeId)
        )
      )
      .returning();

    if (deleted.length === 0) {
      throw Errors.notFound('Committee tag not found');
    }

    // Log activity
    await txn.insert(ticket_activity).values({
      ticket_id: ticketId,
      user_id: removedBy,
      action: 'committee_untagged',
      details: {
        committee_id: committeeId,
      },
      visibility: 'admin_only',
    });

    // Update ticket timestamp
    await txn
      .update(tickets)
      .set({ updated_at: new Date() })
      .where(eq(tickets.id, ticketId));

    logger.info(
      {
        ticketId,
        committeeId,
        removedBy,
      },
      'Committee tag removed from ticket'
    );

    return deleted[0];
  });
}

/**
 * Get committees tagged to a ticket
 */
export async function getTicketCommittees(ticketId: number) {
  const tags = await db
    .select({
      tag_id: ticket_committee_tags.id,
      committee_id: committees.id,
      committee_name: committees.name,
      committee_description: committees.description,
      contact_email: committees.contact_email,
      head_id: committees.head_id,
      tagged_at: ticket_committee_tags.created_at,
    })
    .from(ticket_committee_tags)
    .innerJoin(committees, eq(ticket_committee_tags.committee_id, committees.id))
    .where(eq(ticket_committee_tags.ticket_id, ticketId));

  return tags;
}

/**
 * Get all tickets tagged to a committee
 */
export async function getCommitteeTickets(committeeId: number) {
  const ticketIds = await db
    .select({
      ticket_id: ticket_committee_tags.ticket_id,
    })
    .from(ticket_committee_tags)
    .where(eq(ticket_committee_tags.committee_id, committeeId));

  return ticketIds.map((t) => t.ticket_id);
}
