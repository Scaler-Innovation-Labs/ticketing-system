import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/helpers';
import { db } from '@/db';
import { categories, subcategories } from '@/db/schema-tickets';
import { eq } from 'drizzle-orm';

/**
 * GET /api/filters/categories
 * Get all categories with subcategories for filtering
 */
export async function GET() {
  try {
    await requireAuth();
    
    // Get all active categories
    const allCategories = await db
      .select({
        id: categories.id,
        name: categories.name,
        slug: categories.slug,
        icon: categories.icon,
        color: categories.color,
      })
      .from(categories)
      .where(eq(categories.is_active, true))
      .orderBy(categories.name);
    
    // Get all active subcategories
    const allSubcategories = await db
      .select({
        id: subcategories.id,
        name: subcategories.name,
        slug: subcategories.slug,
        category_id: subcategories.category_id,
      })
      .from(subcategories)
      .where(eq(subcategories.is_active, true))
      .orderBy(subcategories.name);
    
    // Build hierarchy
    const categoriesWithSubs = allCategories.map(cat => ({
      ...cat,
      subcategories: allSubcategories.filter(sub => sub.category_id === cat.id),
    }));
    
    return NextResponse.json(categoriesWithSubs);
  } catch (error) {
    if (error instanceof Error && error.message.includes('Unauthorized')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
