/**
 * Merge Tickets API
 * 
 * POST - Merge multiple tickets into one target ticket
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireRole } from '@/lib/auth/helpers';
import { mergeTickets } from '@/lib/ticket/ticket-enhancement-service';
import { db } from '@/db';
import { ticket_statuses } from '@/db';
import { eq } from 'drizzle-orm';
import { logger } from '@/lib/logger';

const MergeSchema = z.object({
  source_ticket_ids: z.array(z.number().int().positive()).min(1),
  reason: z.string().min(1),
});

/**
 * POST /api/tickets/[id]/merge
 * Merge source tickets into this target ticket (admin/super_admin only)
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { dbUser } = await requireRole(['admin', 'super_admin']);

    const { id } = await params;
    const targetTicketId = parseInt(id, 10);

    if (isNaN(targetTicketId)) {
      return NextResponse.json(
        { error: 'Invalid ticket ID' },
        { status: 400 }
      );
    }

    const body = await request.json();
    const parsed = MergeSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: parsed.error.issues },
        { status: 400 }
      );
    }

    // Validate target is not in source list
    if (parsed.data.source_ticket_ids.includes(targetTicketId)) {
      return NextResponse.json(
        { error: 'Cannot merge a ticket into itself' },
        { status: 400 }
      );
    }

    // Find merged status
    const [mergedStatus] = await db
      .select({ id: ticket_statuses.id })
      .from(ticket_statuses)
      .where(eq(ticket_statuses.value, 'merged'))
      .limit(1);

    if (!mergedStatus) {
      return NextResponse.json(
        { error: 'Merged status not configured' },
        { status: 500 }
      );
    }

    await mergeTickets({
      source_ticket_ids: parsed.data.source_ticket_ids,
      target_ticket_id: targetTicketId,
      merged_by: dbUser.id,
      reason: parsed.data.reason,
      merged_status_id: mergedStatus.id,
    });

    return NextResponse.json({
      success: true,
      message: 'Tickets merged successfully',
    });
  } catch (error: any) {
    logger.error({ error: error.message }, 'Failed to merge tickets');
    return NextResponse.json(
      { error: error.message || 'Failed to merge tickets' },
      { status: error.status || 500 }
    );
  }
}
