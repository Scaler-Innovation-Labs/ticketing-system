import { db, tickets, committee_members, ticket_statuses, categories, users } from '@/db';
import { eq, desc, getTableColumns, inArray } from 'drizzle-orm';

/**
 * Get tickets created by members of a specific committee
 */
export async function getCommitteeCreatedTickets(committeeId: number) {
    // First, get all user IDs who are members of this committee
    const committeeMemberIds = await db
        .select({ user_id: committee_members.user_id })
        .from(committee_members)
        .where(eq(committee_members.committee_id, committeeId));

    const userIds = committeeMemberIds.map(m => m.user_id);

    if (userIds.length === 0) {
        return [];
    }

    // Get tickets created by these users
    const result = await db
        .select({
            ...getTableColumns(tickets),
            status_value: ticket_statuses.value,
            status_label: ticket_statuses.label,
            status_color: ticket_statuses.color,
            category_name: categories.name,
            creator_name: users.full_name,
            creator_email: users.email,
        })
        .from(tickets)
        .leftJoin(ticket_statuses, eq(tickets.status_id, ticket_statuses.id))
        .leftJoin(categories, eq(tickets.category_id, categories.id))
        .leftJoin(users, eq(tickets.created_by, users.id))
        .where(inArray(tickets.created_by, userIds))
        .orderBy(desc(tickets.created_at));

    return result.map(t => ({
        ...t,
        status: t.status_value,
    }));
}

