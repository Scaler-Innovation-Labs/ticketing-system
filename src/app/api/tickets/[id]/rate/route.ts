/**
 * Ticket Rating API
 * 
 * POST - Rate a ticket (different from feedback, focuses on service quality rating)
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth/helpers';
import { db } from '@/db';
import { tickets, ticket_activity } from '@/db';
import { eq, sql } from 'drizzle-orm';
import { logger } from '@/lib/logger';

const RateSchema = z.object({
  rating: z.number().int().min(1).max(5),
  comment: z.string().optional(),
});

/**
 * POST /api/tickets/[id]/rate
 * Rate a ticket (1-5 stars)
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { dbUser } = await getCurrentUser();

    const { id } = await params;
    const ticketId = parseInt(id, 10);

    if (isNaN(ticketId)) {
      return NextResponse.json(
        { error: 'Invalid ticket ID' },
        { status: 400 }
      );
    }

    const body = await request.json();
    const parsed = RateSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: parsed.error.issues },
        { status: 400 }
      );
    }

    // Verify ticket exists
    const [ticket] = await db
      .select({ id: tickets.id, created_by: tickets.created_by })
      .from(tickets)
      .where(eq(tickets.id, ticketId))
      .limit(1);

    if (!ticket) {
      return NextResponse.json(
        { error: 'Ticket not found' },
        { status: 404 }
      );
    }

    // Only ticket creator can rate
    if (ticket.created_by !== dbUser.id) {
      return NextResponse.json(
        { error: 'Only ticket creator can rate the ticket' },
        { status: 403 }
      );
    }

    await db.transaction(async (tx) => {
      // Update ticket metadata with rating
      await tx
        .update(tickets)
        .set({
          metadata: sql`COALESCE(metadata, '{}'::jsonb) || ${JSON.stringify({
            rating: parsed.data.rating,
            rating_comment: parsed.data.comment,
            rated_at: new Date().toISOString(),
          })}::jsonb`,
          updated_at: new Date(),
        })
        .where(eq(tickets.id, ticketId));

      // Log activity
      await tx.insert(ticket_activity).values({
        ticket_id: ticketId,
        user_id: dbUser.id,
        action: 'rated',
        details: parsed.data,
        visibility: 'public',
      });
    });

    logger.info({ ticketId, rating: parsed.data.rating }, 'Ticket rated');

    // Revalidate the ticket page
    const { revalidatePath } = await import('next/cache');
    revalidatePath(`/student/dashboard/ticket/${ticketId}`);
    revalidatePath(`/superadmin/dashboard/ticket/${ticketId}`);

    return NextResponse.json({
      success: true,
      message: 'Rating submitted successfully',
    });
  } catch (error: any) {
    logger.error({ error: error.message }, 'Failed to rate ticket');
    return NextResponse.json(
      { error: error.message || 'Failed to rate ticket' },
      { status: error.status || 500 }
    );
  }
}
