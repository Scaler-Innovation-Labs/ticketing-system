/**
 * POST /api/tickets/[id]/reassign - Reassign ticket with reason tracking
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireRole } from '@/lib/auth/helpers';
import { db, tickets, ticket_activity, users } from '@/db';
import { eq } from 'drizzle-orm';
import { logger } from '@/lib/logger';

const ReassignSchema = z.object({
  assignedTo: z.string().uuid(),
  reason: z.string().min(1).max(1000),
});

export async function POST(
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
    const parsed = ReassignSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request data', details: parsed.error.format() },
        { status: 400 }
      );
    }

    const { assignedTo, reason } = parsed.data;

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
        .select()
        .from(tickets)
        .where(eq(tickets.id, ticketId))
        .limit(1);

      if (!ticket) {
        throw new Error('Ticket not found');
      }

      const previousAssignee = ticket.assigned_to;

      await tx
        .update(tickets)
        .set({
          assigned_to: assignedTo,
          updated_at: new Date(),
        })
        .where(eq(tickets.id, ticketId));

      // Log activity
      await tx.insert(ticket_activity).values({
        ticket_id: ticketId,
        user_id: dbUser.id,
        action: 'reassigned',
        details: {
          from: previousAssignee,
          to: assignedTo,
          to_name: assignee.full_name,
          reason,
        },
        visibility: 'internal_note',
      });
    });

    logger.info({ ticketId, assignedTo }, 'Ticket reassigned');

    return NextResponse.json({
      message: 'Ticket reassigned successfully',
      assigned_to: assignedTo,
      assigned_to_name: assignee.full_name,
    });
  } catch (error: any) {
    if (error.message === 'Ticket not found') {
      return NextResponse.json({ error: 'Ticket not found' }, { status: 404 });
    }
    logger.error({ error: error.message }, 'Error reassigning ticket');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
