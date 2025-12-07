/**
 * Ticket Categories API
 * 
 * GET - Get categories with subcategories for ticket creation
 */

import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/helpers';
import { db } from '@/db';
import { categories, subcategories } from '@/db';
import { eq } from 'drizzle-orm';
import { logger } from '@/lib/logger';

/**
 * GET /api/tickets/categories
 * Get all active categories with subcategories
 */
export async function GET() {
  try {
    await requireAuth();
    // Fetch all active categories
    const categoryRows = await db
      .select({
        id: categories.id,
        name: categories.name,
        description: categories.description,
      })
      .from(categories)
      .where(eq(categories.is_active, true))
      .orderBy(categories.name);

    if (categoryRows.length === 0) {
      return NextResponse.json([]);
    }

    // Fetch all active subcategories
    const subcategoryRows = await db
      .select({
        id: subcategories.id,
        name: subcategories.name,
        category_id: subcategories.category_id,
        description: subcategories.description,
      })
      .from(subcategories)
      .where(eq(subcategories.is_active, true))
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
