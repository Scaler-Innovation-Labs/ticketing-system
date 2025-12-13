/**
 * Lazy Loading Subcategories API
 * 
 * GET /api/tickets/categories/[categoryId]/subcategories
 * Get subcategories with fields for a specific category (lazy loading)
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/helpers';
import { db, subcategories, category_fields, field_options } from '@/db';
import { eq, and, inArray, asc } from 'drizzle-orm';
import { logger } from '@/lib/logger';
import { unstable_cache } from 'next/cache';
import { CACHE_TTL } from '@/conf/constants';

/**
 * GET /api/tickets/categories/[categoryId]/subcategories
 * Get subcategories with fields for a specific category
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ categoryId: string }> }
) {
  let categoryIdNum: number | null = null;
  
  try {
    await requireAuth();
    
    const { categoryId } = await params;
    categoryIdNum = parseInt(categoryId, 10);
    
    if (isNaN(categoryIdNum)) {
      return NextResponse.json(
        { error: 'Invalid category ID' },
        { status: 400 }
      );
    }

    // Use cached query for better performance
    // Create cache key with category ID
    const cacheKey = `subcategories-${categoryIdNum}`;
    const getCachedSubcategories = unstable_cache(
      async (catId: number) => {
        // Fetch subcategories for this category
        const subs = await db
          .select({
            id: subcategories.id,
            name: subcategories.name,
            slug: subcategories.slug,
            description: subcategories.description,
            category_id: subcategories.category_id,
            display_order: subcategories.display_order,
          })
          .from(subcategories)
          .where(
            and(
              eq(subcategories.category_id, catId),
              eq(subcategories.is_active, true)
            )
          )
          .orderBy(asc(subcategories.display_order));

        if (subs.length === 0) return [];

        // Fetch fields for these subcategories
        const subcatIds = subs.map(s => s.id);
        const fields = await db
          .select({
            id: category_fields.id,
            subcategory_id: category_fields.subcategory_id,
            name: category_fields.name,
            slug: category_fields.slug,
            field_type: category_fields.field_type,
            required: category_fields.required,
            placeholder: category_fields.placeholder,
            validation: category_fields.validation,
            display_order: category_fields.display_order,
          })
          .from(category_fields)
          .where(
            and(
              inArray(category_fields.subcategory_id, subcatIds),
              eq(category_fields.is_active, true)
            )
          )
          .orderBy(asc(category_fields.display_order));

        // Fetch field options
        const fieldIds = fields.map(f => f.id);
        const options = fieldIds.length > 0
          ? await db
              .select()
              .from(field_options)
              .where(inArray(field_options.field_id, fieldIds))
              .orderBy(asc(field_options.display_order))
          : [];

        // Build nested structure
        return subs.map(sub => ({
          id: sub.id,
          value: sub.slug || '',
          label: sub.name || '',
          name: sub.name || '',
          slug: sub.slug || '',
          description: sub.description || null,
          display_order: sub.display_order ?? 0,
          category_id: sub.category_id,
          fields: fields
            .filter(f => f.subcategory_id === sub.id)
            .map(field => ({
              id: field.id,
              name: field.name || '',
              slug: field.slug || '',
              type: field.field_type || 'text',
              required: field.required ?? false,
              placeholder: field.placeholder || null,
              help_text: null,
              validation_rules: field.validation || null,
              display_order: field.display_order || 0,
              options: options
                .filter(o => o.field_id === field.id)
                .map((opt, idx) => ({
                  id: opt.id || idx,
                  label: opt.label || opt.value || '',
                  value: opt.value || '',
                })),
            })),
        }));
      },
      [cacheKey],
      {
        revalidate: CACHE_TTL.CATEGORY_LIST / 1000, // Same as category hierarchy
        tags: ['subcategories', 'category-fields', `category-${categoryIdNum}`]
      }
    );

    const result = await getCachedSubcategories(categoryIdNum);

    return NextResponse.json(result);
  } catch (error: any) {
    if (error instanceof Error && error.message.includes('Unauthorized')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }
    logger.error({ error: error.message, categoryId: categoryIdNum ?? 'unknown' }, 'Failed to fetch subcategories');
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}

