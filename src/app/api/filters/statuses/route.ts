import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/helpers';
import { db } from '@/db';
import { ticket_statuses } from '@/db/schema-tickets';
import { eq } from 'drizzle-orm';

/**
 * GET /api/filters/statuses
 * Get all available statuses for filtering
 */
export async function GET() {
  try {
    await requireAuth();
    
    const allStatuses = await db
      .select({
        id: ticket_statuses.id,
        value: ticket_statuses.value,
        label: ticket_statuses.label,
        color: ticket_statuses.color,
        progress_percent: ticket_statuses.progress_percent,
      })
      .from(ticket_statuses)
      .where(eq(ticket_statuses.is_active, true))
      .orderBy(ticket_statuses.display_order);
    
    return NextResponse.json(allStatuses);
  } catch (error) {
    if (error instanceof Error && error.message.includes('Unauthorized')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
