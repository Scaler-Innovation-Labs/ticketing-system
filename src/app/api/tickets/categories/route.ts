/**
 * Ticket Categories API
 * 
 * GET - Get categories with subcategories for ticket creation
 */

import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/helpers';
import { getCachedCategories } from '@/lib/cache/cached-queries';
import { logger } from '@/lib/logger';

/**
 * GET /api/tickets/categories
 * Get all active categories with subcategories
 */
export async function GET() {
  try {
    await requireAuth();
    
    // Use cached categories for better performance
    const categoryRows = await getCachedCategories();

    if (categoryRows.length === 0) {
      return NextResponse.json([]);
    }

    // Fetch subcategories (could be cached too, but keeping simple for now)
    const { db } = await import('@/db');
    const { subcategories } = await import('@/db');
    const { eq, inArray, and } = await import('drizzle-orm');
    
    const subcategoryRows = await db
      .select({
        id: subcategories.id,
        name: subcategories.name,
        category_id: subcategories.category_id,
        description: subcategories.description,
      })
      .from(subcategories)
      .where(
        and(
          eq(subcategories.is_active, true),
          inArray(subcategories.category_id, categoryRows.map(c => c.id))
        )
      )
      .orderBy(subcategories.name);

    // Organize into hierarchical structure
    const result = categoryRows.map((cat) => {
      const subs = subcategoryRows.filter(
        (s) => s.category_id === cat.id
      );

      return {
        id: cat.id,
        name: cat.name,
        description: cat.description,
        subcategories: subs.map((s) => ({
          id: s.id,
          name: s.name,
          description: s.description,
        })),
      };
    });

    return NextResponse.json(result);
  } catch (error: any) {
    logger.error({ error: error.message }, 'Failed to fetch categories');
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}
