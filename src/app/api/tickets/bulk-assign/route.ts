import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireRole } from '@/lib/auth/helpers';
import { db } from '@/db';
import { tickets } from '@/db/schema-tickets';
import { inArray } from 'drizzle-orm';
import { logger } from '@/lib/logger';

const BulkAssignSchema = z.object({
  ticket_ids: z.array(z.number().int().positive()).min(1).max(100),
  assigned_to: z.string().uuid(),
});

/**
 * POST /api/tickets/bulk-assign
 * Bulk assign multiple tickets to a user
 */
export async function POST(request: Request) {
  try {
    const { dbUser } = await requireRole(['admin', 'super_admin']);
    
    const body = await request.json();
    const { ticket_ids, assigned_to } = BulkAssignSchema.parse(body);
    
    // Verify tickets exist
    const existingTickets = await db
      .select({ id: tickets.id })
      .from(tickets)
      .where(inArray(tickets.id, ticket_ids));
    
    if (existingTickets.length !== ticket_ids.length) {
      return NextResponse.json(
        { error: 'Some tickets not found' },
        { status: 404 }
      );
    }
    
    // Perform bulk assignment
    await db.transaction(async (tx) => {
      await tx
        .update(tickets)
        .set({
          assigned_to,
          updated_at: new Date(),
        })
        .where(inArray(tickets.id, ticket_ids));
      
      logger.info(
        { userId: dbUser.id, ticketIds: ticket_ids, assignedTo: assigned_to },
        'Bulk ticket assignment performed'
      );
    });
    
    return NextResponse.json({
      success: true,
      assigned_count: ticket_ids.length,
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes('Unauthorized')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation Error', details: error.issues },
        { status: 400 }
      );
    }
    logger.error({ error }, 'Bulk assignment failed');
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
