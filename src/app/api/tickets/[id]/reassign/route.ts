/**
 * POST /api/tickets/[id]/reassign - Reassign ticket with reason tracking
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireRole } from '@/lib/auth/helpers';
import { db, tickets, ticket_activity, users } from '@/db';
import { eq } from 'drizzle-orm';
import { logger } from '@/lib/logger';
import { withTransaction } from '@/lib/db-transaction';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const ReassignSchema = z.object({
  assignedTo: z.union([z.string().uuid(), z.literal('unassigned')]),
  reason: z.string().max(1000).optional(),
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
    const isUnassigning = assignedTo === 'unassigned';

    // Verify assignee exists (unless unassigning)
    let assignee = null;
    if (!isUnassigning) {
      const [found] = await db
        .select()
        .from(users)
        .where(eq(users.id, assignedTo))
        .limit(1);

      if (!found) {
        return NextResponse.json({ error: 'Assignee not found' }, { status: 404 });
      }
      assignee = found;
    }

    // Update ticket
    await withTransaction(async (tx) => {
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
          assigned_to: isUnassigning ? null : assignedTo,
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
          to: isUnassigning ? null : assignedTo,
          to_name: assignee?.full_name || 'Unassigned',
          reason: reason || 'No reason provided',
        },
        visibility: 'admin_only',
      });
    });

    logger.info({ ticketId, assignedTo: isUnassigning ? null : assignedTo }, 'Ticket reassigned');

    return NextResponse.json({
      message: isUnassigning ? 'Ticket unassigned successfully' : 'Ticket reassigned successfully',
      assigned_to: isUnassigning ? null : assignedTo,
      assigned_to_name: assignee?.full_name || null,
    });
  } catch (error: any) {
    logger.error({ error: error.message || String(error), stack: error.stack }, 'Error reassigning ticket');
    
    if (error.message === 'Ticket not found') {
      return NextResponse.json({ error: 'Ticket not found' }, { status: 404 });
    }
    
    // Handle validation errors from withTransaction
    if (error.statusCode) {
      return NextResponse.json({ error: error.message || 'Request failed' }, { status: error.statusCode });
    }
    
    return NextResponse.json({ 
      error: error.message || 'Internal server error',
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    }, { status: 500 });
  }
}
