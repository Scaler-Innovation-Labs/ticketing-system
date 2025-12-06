/**
 * Hostels Dropdown API
 * 
 * GET - List all active hostels for dropdowns
 */

import { NextResponse } from 'next/server';
import { db } from '@/db';
import { hostels } from '@/db';
import { eq, asc } from 'drizzle-orm';
import { logger } from '@/lib/logger';

/**
 * GET /api/hostels
 * List all active hostels
 */
export async function GET() {
  try {
    const rows = await db
      .select({
        id: hostels.id,
        name: hostels.name,
        is_active: hostels.is_active,
        created_at: hostels.created_at,
      })
      .from(hostels)
      .where(eq(hostels.is_active, true))
      .orderBy(asc(hostels.name));

    return NextResponse.json(rows);
  } catch (error: any) {
    logger.error({ error: error.message }, 'Failed to fetch hostels');
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}
