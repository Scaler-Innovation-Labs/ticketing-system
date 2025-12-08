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

    const watcherUserId = parsed.data.user_id || dbUser.id;
    await addWatcher(ticketId, watcherUserId);

    return NextResponse.json({ success: true }, { status: 201 });
  } catch (error: any) {
    logger.error({ error: error.message }, 'Error adding watcher');
    return NextResponse.json(
      { error: error.message || 'Failed to add watcher' },
      { status: 500 }
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

    await removeWatcher(ticketId, dbUser.id);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    logger.error({ error: error.message }, 'Error removing watcher');
    return NextResponse.json(
      { error: error.message || 'Failed to remove watcher' },
      { status: 500 }
    );
  }
}
