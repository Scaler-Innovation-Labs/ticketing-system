import { db, tickets, ticket_statuses, categories, users, ticket_activity, students, hostels } from "@/db";
import { eq, desc } from "drizzle-orm";

export async function getCommitteeTicketData(ticketId: number) {
    // Minimal, non-relational fetch to avoid relation resolver issues
    const [ticketRow] = await db
      .select({
        id: tickets.id,
        title: tickets.title,
        description: tickets.description,
        location: tickets.location,
        created_by: tickets.created_by,
        category_id: tickets.category_id,
        status_id: tickets.status_id,
        metadata: tickets.metadata,
        created_at: tickets.created_at,
        updated_at: tickets.updated_at,
        resolution_due_at: tickets.resolution_due_at,
        acknowledgement_due_at: tickets.acknowledgement_due_at,
        escalation_level: tickets.escalation_level,
        status_value: ticket_statuses.value,
        status_label: ticket_statuses.label,
        status_color: ticket_statuses.color,
        category_name: categories.name,
        creator_full_name: users.full_name,
        creator_email: users.email,
      })
      .from(tickets)
      .leftJoin(ticket_statuses, eq(tickets.status_id, ticket_statuses.id))
      .leftJoin(categories, eq(tickets.category_id, categories.id))
      .leftJoin(users, eq(tickets.created_by, users.id))
      .where(eq(tickets.id, ticketId))
      .limit(1);

    if (!ticketRow) {
      return null;
    }

    // Fetch comments (activity) with explicit join to avoid relation mapping issues
    const comments = await db
      .select({
        id: ticket_activity.id,
        action: ticket_activity.action,
        details: ticket_activity.details,
        created_at: ticket_activity.created_at,
        user_full_name: users.full_name,
      })
      .from(ticket_activity)
      .leftJoin(users, eq(ticket_activity.user_id, users.id))
      .where(eq(ticket_activity.ticket_id, ticketId))
      .orderBy(desc(ticket_activity.created_at));

    // Fetch student info if creator is a student
    let studentData = null;
    if (ticketRow.created_by) {
      const [student] = await db
        .select({
          id: students.id,
          user_id: students.user_id,
          hostel_id: students.hostel_id,
          room_no: students.room_no,
          hostel_name: hostels.name,
        })
        .from(students)
        .leftJoin(hostels, eq(hostels.id, students.hostel_id))
        .where(eq(students.user_id, ticketRow.created_by))
        .limit(1);
      if (student) {
        studentData = student;
      }
    }

    // Transform comments to match expected structure
    const formattedComments = comments.map(c => {
      const details = c.details as any;
      return {
        text: details?.comment || c.action, // Fallback if no comment
        author: c.user_full_name || 'Unknown',
        created_at: c.created_at,
        type: c.action === 'comment' ? 'comment' : 'system',
        isInternal: details?.is_internal || false
      };
    });

    // Fallbacks for status if join is missing
    const statusValue = ticketRow.status_value || "open";
    const statusLabel = ticketRow.status_label || statusValue;
    const statusColor = ticketRow.status_color || "blue";
    const statusLabelCapitalized =
      statusLabel.charAt(0).toUpperCase() + statusLabel.slice(1).replace(/_/g, " ");

    return {
      ticket: {
        id: ticketRow.id,
        title: ticketRow.title,
        description: ticketRow.description,
        location: ticketRow.location,
        created_by: ticketRow.created_by,
        category_id: ticketRow.category_id,
        status_id: ticketRow.status_id,
        metadata: ticketRow.metadata,
        created_at: ticketRow.created_at,
        updated_at: ticketRow.updated_at,
        resolution_due_at: ticketRow.resolution_due_at,
        acknowledgement_due_at: ticketRow.acknowledgement_due_at,
        escalation_level: ticketRow.escalation_level,
        status: {
          id: ticketRow.status_id || null,
          value: statusValue,
          label: statusLabelCapitalized,
          color: statusColor,
        },
        rating: null as number | null, // Placeholder
      },
      category: ticketRow.category_id
        ? {
            id: ticketRow.category_id,
            name: ticketRow.category_name,
          }
        : null,
      creator: ticketRow.created_by
        ? {
            id: ticketRow.created_by,
            email: ticketRow.creator_email,
            full_name: ticketRow.creator_full_name,
          }
        : null,
      student: studentData,
      profileFields: [],
      dynamicFields: [] as { key: string; label: string; value: any; fieldType: string }[],
      comments: formattedComments,
    };
}
