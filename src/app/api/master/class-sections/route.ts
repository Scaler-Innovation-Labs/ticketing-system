/**
 * Class Sections Master Data API
 * 
 * GET - List all active class sections for dropdowns
 */

import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/helpers';
import { db } from '@/db';
import { class_sections } from '@/db';
import { eq, asc } from 'drizzle-orm';
import { logger } from '@/lib/logger';

/**
 * GET /api/master/class-sections
 * List all active class sections
 * Query params:
 *   - include: comma-separated section IDs to include even if inactive
 */
export async function GET(request: Request) {
  try {
    await requireAuth();
    
    const { searchParams } = new URL(request.url);
    const includeIds = searchParams.get('include');
    
    const sectionsList = await db
      .select({
        id: class_sections.id,
        name: class_sections.name,
      })
      .from(class_sections)
      .where(eq(class_sections.is_active, true))
      .orderBy(asc(class_sections.name));

    // If specific section IDs are requested, include them even if inactive
    if (includeIds) {
      const { inArray } = await import('drizzle-orm');
      const idsToInclude = includeIds.split(',').map(id => parseInt(id.trim(), 10)).filter(id => !isNaN(id));
      if (idsToInclude.length > 0) {
        const additionalSections = await db
          .select({
            id: class_sections.id,
            name: class_sections.name,
          })
          .from(class_sections)
          .where(inArray(class_sections.id, idsToInclude));
        
        // Merge and deduplicate
        const existingIds = new Set(sectionsList.map(s => s.id));
        const newSections = additionalSections.filter(s => !existingIds.has(s.id));
        sectionsList.push(...newSections);
      }
    }

    return NextResponse.json({ sections: sectionsList });
  } catch (error: any) {
    logger.error({ error: error.message }, 'Failed to fetch class sections');
    return NextResponse.json(
      { error: 'Failed to fetch class sections' },
      { status: 500 }
    );
  }
}
