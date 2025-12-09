/**
 * Ticket Watchers
 * 
 * POST /api/tickets/[id]/watchers - Add watcher
 * DELETE /api/tickets/[id]/watchers - Remove watcher
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/helpers';
import { addWatcher, removeWatcher } from '@/lib/ticket/ticket-enhancement-service';
import { logger } from '@/lib/logger';
import { z } from 'zod';
import { getUserRole } from '@/lib/auth/roles';
import { USER_ROLES } from '@/conf/constants';
import { db, tickets } from '@/db';
import { eq } from 'drizzle-orm';
import { Errors } from '@/lib/errors';

const WatcherSchema = z.object({
  user_id: z.string().uuid().optional(), // If not provided, use current user
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { dbUser } = await getCurrentUser();

    const { id: idStr } = await params;
    const ticketId = parseInt(idStr, 10);
    if (isNaN(ticketId)) {
      return NextResponse.json({ error: 'Invalid ticket ID' }, { status: 400 });
    }

    const body = await request.json();
    const parsed = WatcherSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: parsed.error.issues },
        { status: 400 }
      );
    }

    // Check ticket ownership for students
    const role = await getUserRole(dbUser.id);
    if (role === USER_ROLES.STUDENT) {
      const [ticket] = await db
        .select({ created_by: tickets.created_by })
        .from(tickets)
        .where(eq(tickets.id, ticketId))
        .limit(1);

      if (!ticket) {
        return NextResponse.json({ error: 'Ticket not found' }, { status: 404 });
      }

      if (ticket.created_by !== dbUser.id) {
        throw Errors.forbidden('You can only watch your own tickets');
      }
    }

    const watcherUserId = parsed.data.user_id || dbUser.id;
    await addWatcher(ticketId, watcherUserId);

    return NextResponse.json({ success: true }, { status: 201 });
  } catch (error: any) {
    logger.error({ error: error.message || error }, 'Error adding watcher');
    const status = error?.statusCode || error?.status || 500;
    const message = error?.message || 'Failed to add watcher';
    return NextResponse.json(
      { error: message },
      { status }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { dbUser } = await getCurrentUser();

    const { id: idStr } = await params;
    const ticketId = parseInt(idStr, 10);
    if (isNaN(ticketId)) {
      return NextResponse.json({ error: 'Invalid ticket ID' }, { status: 400 });
    }

    // Check ticket ownership for students
    const role = await getUserRole(dbUser.id);
    if (role === USER_ROLES.STUDENT) {
      const [ticket] = await db
        .select({ created_by: tickets.created_by })
        .from(tickets)
        .where(eq(tickets.id, ticketId))
        .limit(1);

      if (!ticket) {
        return NextResponse.json({ error: 'Ticket not found' }, { status: 404 });
      }

      if (ticket.created_by !== dbUser.id) {
        throw Errors.forbidden('You can only unwatch your own tickets');
      }
    }

    await removeWatcher(ticketId, dbUser.id);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    logger.error({ error: error.message || error }, 'Error removing watcher');
    const status = error?.statusCode || error?.status || 500;
    const message = error?.message || 'Failed to remove watcher';
    return NextResponse.json(
      { error: message },
      { status }
    );
  }
}
