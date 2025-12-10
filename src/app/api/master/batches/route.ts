/**
 * Batches Master Data API
 * 
 * GET - List all active batches for dropdowns
 */

import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/helpers';
import { db } from '@/db';
import { batches } from '@/db';
import { eq, desc } from 'drizzle-orm';
import { logger } from '@/lib/logger';

/**
 * GET /api/master/batches
 * List all active batches (sorted by year descending)
 * Query params:
 *   - include: comma-separated batch IDs to include even if inactive
 */
export async function GET(request: Request) {
  try {
    await requireAuth();
    
    const { searchParams } = new URL(request.url);
    const includeIds = searchParams.get('include');
    
    const batchesList = await db
      .select({
        id: batches.id,
        year: batches.year,
        name: batches.name,
      })
      .from(batches)
      .where(eq(batches.is_active, true))
      .orderBy(desc(batches.year));

    // If specific batch IDs are requested, include them even if inactive
    if (includeIds) {
      const idsToInclude = includeIds.split(',').map(id => parseInt(id.trim(), 10)).filter(id => !isNaN(id));
      if (idsToInclude.length > 0) {
        const { inArray } = await import('drizzle-orm');
        const additionalBatches = await db
          .select({
            id: batches.id,
            year: batches.year,
            name: batches.name,
          })
          .from(batches)
          .where(inArray(batches.id, idsToInclude));
        
        // Merge and deduplicate
        const existingIds = new Set(batchesList.map(b => b.id));
        const newBatches = additionalBatches.filter(b => !existingIds.has(b.id));
        batchesList.push(...newBatches);
      }
    }

    return NextResponse.json({ batches: batchesList });
  } catch (error: any) {
    logger.error({ error: error.message }, 'Failed to fetch batches');
    return NextResponse.json(
      { error: 'Failed to fetch batches' },
      { status: 500 }
    );
  }
}
