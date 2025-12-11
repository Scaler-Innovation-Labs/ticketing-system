import { db, tickets, ticket_statuses, categories, users } from '@/db';
import { eq, desc } from 'drizzle-orm';

/**
 * Get tickets created by the given user (committee member)
 */
export async function getCreatedTickets(userId: string) {
  if (!userId) return [];
  try {
    const rows = await db
      .select({
        id: tickets.id,
        title: tickets.title,
        description: tickets.description,
        status_id: tickets.status_id,
        status_value: ticket_statuses.value,
        category_id: tickets.category_id,
        category_name: categories.name,
        category_slug: categories.slug,
        created_at: tickets.created_at,
        updated_at: tickets.updated_at,
        creator_name: users.full_name,
        creator_email: users.email,
      } as const)
      .from(tickets)
      .leftJoin(ticket_statuses, eq(ticket_statuses.id, tickets.status_id))
      .leftJoin(categories, eq(categories.id, tickets.category_id))
      .leftJoin(users, eq(users.id, tickets.created_by))
      .where(eq(tickets.created_by, userId))
      .orderBy(desc(tickets.created_at));

    return rows.map((t) => ({
      ...t,
      status: t.status_value || null,
    }));
  } catch (error) {
    console.error("Failed to fetch created tickets", error);
    return [];
  }
}
