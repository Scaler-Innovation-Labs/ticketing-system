/**
 * Batches Master Data API
 * 
 * GET - List all active batches for dropdowns
 */

import { NextResponse } from 'next/server';
import { db } from '@/db';
import { batches } from '@/db';
import { eq, desc } from 'drizzle-orm';
import { logger } from '@/lib/logger';

/**
 * GET /api/master/batches
 * List all active batches (sorted by year descending)
 */
export async function GET() {
  try {
    const batchesList = await db
      .select({
        id: batches.id,
        year: batches.year,
        name: batches.name,
      })
      .from(batches)
      .where(eq(batches.is_active, true))
      .orderBy(desc(batches.year));

    return NextResponse.json({ batches: batchesList });
  } catch (error: any) {
    logger.error({ error: error.message }, 'Failed to fetch batches');
    return NextResponse.json(
      { error: 'Failed to fetch batches' },
      { status: 500 }
    );
  }
}
