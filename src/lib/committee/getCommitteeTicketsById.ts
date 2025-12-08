import { db, tickets, ticket_committee_tags, ticket_statuses, categories, users } from '@/db';
import { eq, desc, getTableColumns } from 'drizzle-orm';

export async function getCommitteeTicketsById(committeeId: number) {
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
        .innerJoin(ticket_committee_tags, eq(tickets.id, ticket_committee_tags.ticket_id))
        .leftJoin(ticket_statuses, eq(tickets.status_id, ticket_statuses.id))
        .leftJoin(categories, eq(tickets.category_id, categories.id))
        .leftJoin(users, eq(tickets.created_by, users.id))
        .where(eq(ticket_committee_tags.committee_id, committeeId))
        .orderBy(desc(tickets.created_at));

    return result.map(t => ({
        ...t,
        status: t.status_value,
    }));
}
