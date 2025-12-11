import { db, tickets, ticket_committee_tags, categories, ticket_statuses, committees, users } from "@/db";
import { eq, inArray, desc, or } from "drizzle-orm";
import type { Ticket } from "@/db/types-only";

export async function getTaggedTickets(userId: string): Promise<Ticket[]> {
    // 0. Fetch user email for fallback matching
    const [user] = await db
        .select({ email: users.email })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

    // 1. Get committees where user is head or contact_email matches
    // Each committee has only one member - the head (identified by head_id or contact_email)
    const userCommittees = await db
        .select({ id: committees.id })
        .from(committees)
        .where(
            or(
                eq(committees.head_id, userId),
                user?.email ? eq(committees.contact_email, user.email) : eq(committees.id, -1) // noop when no email
            )
        );

    const committeeIds = userCommittees.map(c => c.id);

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
            status_id: tickets.status_id,
            priority: tickets.priority,
            category_id: tickets.category_id,
            subcategory_id: tickets.subcategory_id,
            category_name: categories.name,
            created_by: tickets.created_by,
            assigned_to: tickets.assigned_to,
            created_at: tickets.created_at,
            updated_at: tickets.updated_at,
            location: tickets.location,
            metadata: tickets.metadata,
            attachments: tickets.attachments,
            creator_full_name: users.full_name,
            creator_email: users.email,
            // Add other fields as needed to match Ticket type
        })
        .from(tickets)
        .innerJoin(ticket_committee_tags, eq(tickets.id, ticket_committee_tags.ticket_id))
        .leftJoin(categories, eq(tickets.category_id, categories.id))
        .leftJoin(ticket_statuses, eq(tickets.status_id, ticket_statuses.id))
        .leftJoin(users, eq(tickets.created_by, users.id))
        .where(inArray(ticket_committee_tags.committee_id, committeeIds))
        .orderBy(desc(tickets.created_at));

    // Map fields to match TicketCard expectations
    return taggedTickets.map(ticket => ({
        ...ticket,
        creator_name: ticket.creator_full_name || null,
    })) as unknown as Ticket[];
}
