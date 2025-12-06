import { getTicketById } from "@/lib/ticket/ticket-service";
import { db, ticket_activity, students, hostels } from "@/db";
import { eq, desc } from "drizzle-orm";

export async function getCommitteeTicketData(ticketId: number) {
    const ticket = await getTicketById(ticketId);

    // Fetch comments (activity)
    const comments = await db.query.ticket_activity.findMany({
        where: eq(ticket_activity.ticket_id, ticketId),
        orderBy: [desc(ticket_activity.created_at)],
        with: {
            user: true
        }
    });

    // Fetch student info if creator is a student
    let studentData = null;
    if (ticket.creator?.id) {
        const student = await db.query.students.findFirst({
            where: eq(students.user_id, ticket.creator.id),
            with: {
                hostel: true
            }
        });
        if (student) {
            const studentWithHostel = student as any;
            studentData = {
                ...student,
                hostel_name: studentWithHostel.hostel?.name,
                room_no: student.room_no
            };
        }
    }

    // Transform comments to match expected structure
    const formattedComments = comments.map(c => {
        const details = c.details as any;
        const user = c.user as any;
        return {
            text: details?.comment || c.action, // Fallback if no comment
            author: user?.full_name || 'Unknown',
            created_at: c.created_at,
            type: c.action === 'comment' ? 'comment' : 'system',
            isInternal: details?.is_internal || false
        };
    });

    return {
        ticket: {
            ...ticket.ticket,
            status: ticket.status,
            category_name: ticket.category?.name,
            creator_full_name: ticket.creator?.full_name,
            creator_email: ticket.creator?.email,
            rating: null as number | null, // Placeholder
        },
        category: ticket.category,
        creator: ticket.creator,
        student: studentData,
        profileFields: [],
        dynamicFields: [] as { key: string; label: string; value: any; fieldType: string }[],
        comments: formattedComments
    };
}
