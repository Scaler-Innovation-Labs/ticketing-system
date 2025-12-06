/**
 * Class Sections Master Data API
 * 
 * GET - List all active class sections for dropdowns
 */

import { NextResponse } from 'next/server';
import { db } from '@/db';
import { class_sections } from '@/db';
import { eq, asc } from 'drizzle-orm';
import { logger } from '@/lib/logger';

/**
 * GET /api/master/class-sections
 * List all active class sections
 */
export async function GET() {
  try {
    const sections = await db
      .select({
        id: class_sections.id,
        name: class_sections.name,
      })
      .from(class_sections)
      .where(eq(class_sections.is_active, true))
      .orderBy(asc(class_sections.name));

    return NextResponse.json({ sections });
  } catch (error: any) {
    logger.error({ error: error.message }, 'Failed to fetch class sections');
    return NextResponse.json(
      { error: 'Failed to fetch class sections' },
      { status: 500 }
    );
  }
}
