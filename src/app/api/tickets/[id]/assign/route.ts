/**
 * PATCH /api/tickets/[id]/assign - Assign ticket to admin
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireRole } from '@/lib/auth/helpers';
import { db, tickets, ticket_activity, users } from '@/db';
import { eq } from 'drizzle-orm';
import { logger } from '@/lib/logger';

const AssignSchema = z.object({
  assignedTo: z.string().uuid(),
  comment: z.string().max(1000).optional(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { dbUser } = await requireRole(['admin', 'super_admin']);
    const { id } = await params;
    const ticketId = Number(id);

    if (isNaN(ticketId)) {
      return NextResponse.json({ error: 'Invalid ticket ID' }, { status: 400 });
    }

    const body = await request.json();
    const parsed = AssignSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request data', details: parsed.error.format() },
        { status: 400 }
      );
    }

    const { assignedTo, comment } = parsed.data;

    // Verify assignee exists
    const [assignee] = await db
      .select()
      .from(users)
      .where(eq(users.id, assignedTo))
      .limit(1);

    if (!assignee) {
      return NextResponse.json({ error: 'Assignee not found' }, { status: 404 });
    }

    // Update ticket
    await db.transaction(async (tx) => {
      const [ticket] = await tx
        .update(tickets)
        .set({
          assigned_to: assignedTo,
          updated_at: new Date(),
        })
        .where(eq(tickets.id, ticketId))
        .returning();

      if (!ticket) {
        throw new Error('Ticket not found');
      }

      // Log activity
      await tx.insert(ticket_activity).values({
        ticket_id: ticketId,
        user_id: dbUser.id,
        action: 'assigned',
        details: {
          assigned_to: assignedTo,
          assigned_to_name: assignee.full_name,
          comment,
        },
        visibility: 'student_visible',
      });
    });

    logger.info({ ticketId, assignedTo }, 'Ticket assigned');

    return NextResponse.json({
      message: 'Ticket assigned successfully',
      assigned_to: assignedTo,
      assigned_to_name: assignee.full_name,
    });
  } catch (error: any) {
    if (error.message === 'Ticket not found') {
      return NextResponse.json({ error: 'Ticket not found' }, { status: 404 });
    }
    logger.error({ error: error.message }, 'Error assigning ticket');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
