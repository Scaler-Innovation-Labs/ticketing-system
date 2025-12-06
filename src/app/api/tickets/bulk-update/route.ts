import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireRole } from '@/lib/auth/helpers';
import { db } from '@/db';
import { tickets, ticket_statuses } from '@/db/schema-tickets';
import { eq, inArray, and } from 'drizzle-orm';
import { logger } from '@/lib/logger';

const BulkUpdateSchema = z.object({
  ticket_ids: z.array(z.number().int().positive()).min(1).max(100),
  updates: z.object({
    status_id: z.number().int().positive().optional(),
    assigned_to: z.string().uuid().optional(),
    priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
  }),
});

/**
 * POST /api/tickets/bulk-update
 * Bulk update multiple tickets at once
 */
export async function POST(request: Request) {
  try {
    const { dbUser } = await requireRole(['admin', 'super_admin']);
    
    const body = await request.json();
    const { ticket_ids, updates } = BulkUpdateSchema.parse(body);
    
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
    
    // Perform bulk update
    const updateData: any = {
      updated_at: new Date(),
    };
    if (updates.status_id) updateData.status_id = updates.status_id;
    if (updates.assigned_to) updateData.assigned_to = updates.assigned_to;
    if (updates.priority) updateData.priority = updates.priority;
    
    await db.transaction(async (tx) => {
      await tx
        .update(tickets)
        .set(updateData)
        .where(inArray(tickets.id, ticket_ids));
      
      logger.info(
        { userId: dbUser.id, ticketIds: ticket_ids, updates },
        'Bulk ticket update performed'
      );
    });
    
    return NextResponse.json({
      success: true,
      updated_count: ticket_ids.length,
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
    logger.error({ error }, 'Bulk update failed');
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
