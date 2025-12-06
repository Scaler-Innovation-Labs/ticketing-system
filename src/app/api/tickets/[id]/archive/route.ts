/**
 * Archive Ticket API
 * 
 * POST - Archive a ticket (change to archived status)
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireRole } from '@/lib/auth/helpers';
import { archiveTicket } from '@/lib/ticket/ticket-enhancement-service';
import { db } from '@/db';
import { ticket_statuses } from '@/db';
import { eq } from 'drizzle-orm';
import { logger } from '@/lib/logger';

const ArchiveSchema = z.object({
  reason: z.string().optional(),
});

/**
 * POST /api/tickets/[id]/archive
 * Archive a ticket (admin/super_admin only)
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { dbUser } = await requireRole(['admin', 'super_admin']);

    const { id } = await params;
    const ticketId = parseInt(id, 10);

    if (isNaN(ticketId)) {
      return NextResponse.json(
        { error: 'Invalid ticket ID' },
        { status: 400 }
      );
    }

    const body = await request.json();
    const parsed = ArchiveSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: parsed.error.issues },
        { status: 400 }
      );
    }

    // Find archived status
    const [archivedStatus] = await db
      .select({ id: ticket_statuses.id })
      .from(ticket_statuses)
      .where(eq(ticket_statuses.value, 'archived'))
      .limit(1);

    if (!archivedStatus) {
      return NextResponse.json(
        { error: 'Archived status not configured' },
        { status: 500 }
      );
    }

    await archiveTicket(ticketId, dbUser.id, archivedStatus.id);

    return NextResponse.json({
      success: true,
      message: 'Ticket archived successfully',
    });
  } catch (error: any) {
    logger.error({ error: error.message }, 'Failed to archive ticket');
    return NextResponse.json(
      { error: error.message || 'Failed to archive ticket' },
      { status: error.status || 500 }
    );
  }
}
