import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/helpers';
import { db } from '@/db';
import { hostels, class_sections, batches } from '@/db';
import { eq } from 'drizzle-orm';

/**
 * GET /api/filters/locations
 * Get all location-related filter options (hostels, batches, class sections)
 * Query params: category (optional), subcategory (optional)
 */
export async function GET(request: NextRequest) {
  try {
    await requireAuth();
    
    // Get query parameters (currently not used for filtering, but available for future use)
    const { searchParams } = new URL(request.url);
    const category = searchParams.get('category');
    const subcategory = searchParams.get('subcategory');
    
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
    
    // Combine all locations into a single array for the filter dropdown
    const locations: string[] = [
      ...activeHostels.map(h => h.name || h.code || `Hostel ${h.id}`),
      ...activeBatches.map(b => b.name || `Batch ${b.year}`),
      ...activeSections.map(s => s.name || `Section ${s.id}`),
    ].filter(Boolean);
    
    return NextResponse.json({
      locations,
      hostels: activeHostels,
      batches: activeBatches,
      class_sections: activeSections,
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes('Unauthorized')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }
    console.error('Error fetching locations:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
