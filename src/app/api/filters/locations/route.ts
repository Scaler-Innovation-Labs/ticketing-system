import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/helpers';
import { db } from '@/db';
import { hostels, class_sections, batches } from '@/db';
import { eq } from 'drizzle-orm';

/**
 * GET /api/filters/locations
 * Get all location-related filter options (hostels, batches, class sections)
 */
export async function GET() {
  try {
    await requireAuth();
    
    // Get all active hostels
    const activeHostels = await db
      .select({
        id: hostels.id,
        name: hostels.name,
        code: hostels.code,
      })
      .from(hostels)
      .where(eq(hostels.is_active, true))
      .orderBy(hostels.name);
    
    // Get all active batches
    const activeBatches = await db
      .select({
        id: batches.id,
        year: batches.year,
        name: batches.name,
      })
      .from(batches)
      .where(eq(batches.is_active, true))
      .orderBy(batches.year);
    
    // Get all active class sections
    const activeSections = await db
      .select({
        id: class_sections.id,
        name: class_sections.name,
        department: class_sections.department,
        batch_id: class_sections.batch_id,
      })
      .from(class_sections)
      .where(eq(class_sections.is_active, true))
      .orderBy(class_sections.name);
    
    return NextResponse.json({
      hostels: activeHostels,
      batches: activeBatches,
      class_sections: activeSections,
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes('Unauthorized')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
