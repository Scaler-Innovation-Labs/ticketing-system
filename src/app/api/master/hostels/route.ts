/**
 * Hostels Master Data API
 * 
 * GET - List all active hostels for dropdowns
 */

import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/helpers';
import { db } from '@/db';
import { hostels } from '@/db';
import { eq, asc } from 'drizzle-orm';
import { logger } from '@/lib/logger';

/**
 * GET /api/master/hostels
 * List all active hostels
 */
export async function GET() {
  try {
    await requireAuth();
    const hostelsList = await db
      .select({
        id: hostels.id,
        name: hostels.name,
        code: hostels.code,
      })
      .from(hostels)
      .where(eq(hostels.is_active, true))
      .orderBy(asc(hostels.name));

    return NextResponse.json({ hostels: hostelsList });
  } catch (error: any) {
    logger.error({ error: error.message }, 'Failed to fetch hostels');
    return NextResponse.json(
      { error: 'Failed to fetch hostels' },
      { status: 500 }
    );
  }
}

