import { db, tickets, ticket_committee_tags, committee_members, categories, ticket_statuses, committees, users } from "@/db";
import { eq, inArray, desc, or } from "drizzle-orm";
import type { Ticket } from "@/db/types-only";

export async function getTaggedTickets(userId: string): Promise<Ticket[]> {
    // 0. Fetch user email for fallback matching
    const [user] = await db
        .select({ email: users.email })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

    // 1. Get user's committees via membership
    const userCommittees = await db
        .select({ committeeId: committee_members.committee_id })
        .from(committee_members)
        .where(eq(committee_members.user_id, userId));

    let committeeIds = userCommittees.map(c => c.committeeId);

    // 1b. Fallback: committees where user is head or contact_email matches
    const extraCommittees = await db
        .select({ id: committees.id })
        .from(committees)
        .where(
            or(
                eq(committees.head_id, userId),
                user?.email ? eq(committees.contact_email, user.email) : eq(committees.id, -1) // noop when no email
            )
        );

    committeeIds = Array.from(new Set([...committeeIds, ...extraCommittees.map(c => c.id)]));

    if (committeeIds.length === 0) {
        return [];
    }

    // 2. Get tickets tagged to these committees
    const taggedTickets = await db
        .select({
            id: tickets.id,
            ticket_number: tickets.ticket_number,
            title: tickets.title,
            description: tickets.description,
            status: ticket_statuses.value,
            priority: tickets.priority,
            category_name: categories.name,
            created_at: tickets.created_at,
            updated_at: tickets.updated_at,
            location: tickets.location,
            metadata: tickets.metadata,
            attachments: tickets.attachments,
            // Add other fields as needed to match Ticket type
        })
        .from(tickets)
        .innerJoin(ticket_committee_tags, eq(tickets.id, ticket_committee_tags.ticket_id))
        .leftJoin(categories, eq(tickets.category_id, categories.id))
        .leftJoin(ticket_statuses, eq(tickets.status_id, ticket_statuses.id))
        .where(inArray(ticket_committee_tags.committee_id, committeeIds))
        .orderBy(desc(tickets.created_at));

    // Cast to Ticket type (might need partial match)
    return taggedTickets as unknown as Ticket[];
}
