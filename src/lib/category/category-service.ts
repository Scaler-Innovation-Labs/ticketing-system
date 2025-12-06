/**
 * Category Service
 * 
 * Handles category and subcategory operations
 */

import { db } from '@/db';
import { categories, subcategories, category_fields, field_options, domains, scopes } from '@/db/schema-tickets';
import { eq, and, desc, asc, inArray } from 'drizzle-orm';
import { logger } from '@/lib/logger';

/**
 * Get all active categories with subcategories
 */
export async function getActiveCategories(includeFields = false) {
  try {
    const cats = await db
      .select({
        id: categories.id,
        name: categories.name,
        slug: categories.slug,
        description: categories.description,
        icon: categories.icon,
        color: categories.color,
        sla_hours: categories.sla_hours,
        domain_id: categories.domain_id,
        scope_id: categories.scope_id,
        display_order: categories.display_order,
      })
      .from(categories)
      .where(eq(categories.is_active, true))
      .orderBy(asc(categories.display_order), desc(categories.created_at));

    if (!includeFields) {
      return cats;
    }

    // Fetch subcategories for all categories
    const subcats = await db
      .select()
      .from(subcategories)
      .where(
        and(
          inArray(subcategories.category_id, cats.map(c => c.id)),
          eq(subcategories.is_active, true)
        )
      )
      .orderBy(asc(subcategories.display_order));

    // Fetch fields for all subcategories
    const subcatIds = subcats.map(s => s.id);
    const fields = subcatIds.length > 0 ? await db
      .select()
      .from(category_fields)
      .where(
        and(
          inArray(category_fields.subcategory_id, subcatIds),
          eq(category_fields.is_active, true)
        )
      )
      .orderBy(asc(category_fields.display_order)) : [];

    // Fetch options for all fields
    const fieldIds = fields.map(f => f.id);
    const options = fieldIds.length > 0 ? await db
      .select()
      .from(field_options)
      .where(
        and(
          inArray(field_options.field_id, fieldIds),
          eq(field_options.is_active, true)
        )
      )
      .orderBy(asc(field_options.display_order)) : [];

    // Build nested structure
    return cats.map(cat => ({
      ...cat,
      subcategories: subcats
        .filter(s => s.category_id === cat.id)
        .map(sub => ({
          ...sub,
          fields: fields
            .filter(f => f.subcategory_id === sub.id)
            .map(field => ({
              ...field,
              options: options.filter(o => o.field_id === field.id),
            })),
        })),
    }));
  } catch (error) {
    logger.error({ error }, 'Error fetching active categories');
    throw error;
  }
}

/**
 * Get category schema (fields) for a specific category
 */
export async function getCategorySchema(categoryId: number) {
  try {
    const [category] = await db
      .select()
      .from(categories)
      .where(eq(categories.id, categoryId))
      .limit(1);

    if (!category) {
      return null;
    }

    const subcats = await db
      .select()
      .from(subcategories)
      .where(
        and(
          eq(subcategories.category_id, categoryId),
          eq(subcategories.is_active, true)
        )
      )
      .orderBy(asc(subcategories.display_order));

    const subcatIds = subcats.map(s => s.id);
    const fields = subcatIds.length > 0 ? await db
      .select()
      .from(category_fields)
      .where(
        and(
          inArray(category_fields.subcategory_id, subcatIds),
          eq(category_fields.is_active, true)
        )
      )
      .orderBy(asc(category_fields.display_order)) : [];

    const fieldIds = fields.map(f => f.id);
    const options = fieldIds.length > 0 ? await db
      .select()
      .from(field_options)
      .where(
        and(
          inArray(field_options.field_id, fieldIds),
          eq(field_options.is_active, true)
        )
      )
      .orderBy(asc(field_options.display_order)) : [];

    return {
      category,
      subcategories: subcats.map(sub => ({
        ...sub,
        fields: fields
          .filter(f => f.subcategory_id === sub.id)
          .map(field => ({
            ...field,
            options: options.filter(o => o.field_id === field.id),
          })),
      })),
    };
  } catch (error) {
    logger.error({ categoryId, error }, 'Error fetching category schema');
    throw error;
  }
}

/**
 * Create new category (admin only)
 */
export async function createCategory(data: {
  name: string;
  slug: string;
  description?: string;
  icon?: string;
  color?: string;
  domain_id?: number;
  scope_id?: number;
  scope_mode?: 'fixed' | 'dynamic' | 'none';
  default_admin_id?: string;
  sla_hours?: number;
  display_order?: number;
}) {
  try {
    const [category] = await db
      .insert(categories)
      .values(data)
      .returning();

    logger.info({ categoryId: category.id }, 'Category created');
    return category;
  } catch (error) {
    logger.error({ data, error }, 'Error creating category');
    throw error;
  }
}

/**
 * Update category (admin only)
 */
export async function updateCategory(categoryId: number, data: Partial<typeof categories.$inferInsert>) {
  try {
    const [category] = await db
      .update(categories)
      .set({ ...data, updated_at: new Date() })
      .where(eq(categories.id, categoryId))
      .returning();

    if (!category) {
      return null;
    }

    logger.info({ categoryId }, 'Category updated');
    return category;
  } catch (error) {
    logger.error({ categoryId, data, error }, 'Error updating category');
    throw error;
  }
}

/**
 * Soft delete category (admin only)
 */
export async function deleteCategory(categoryId: number) {
  try {
    const [category] = await db
      .update(categories)
      .set({ is_active: false, updated_at: new Date() })
      .where(eq(categories.id, categoryId))
      .returning();

    if (!category) {
      return null;
    }

    logger.info({ categoryId }, 'Category deleted');
    return category;
  } catch (error) {
    logger.error({ categoryId, error }, 'Error deleting category');
    throw error;
  }
}

/**
 * Create subcategory
 */
export async function createSubcategory(data: {
  category_id: number;
  name: string;
  slug: string;
  description?: string;
  assigned_admin_id?: string;
  sla_hours?: number;
  display_order?: number;
}) {
  try {
    const [subcategory] = await db
      .insert(subcategories)
      .values(data)
      .returning();

    logger.info({ subcategoryId: subcategory.id }, 'Subcategory created');
    return subcategory;
  } catch (error) {
    logger.error({ data, error }, 'Error creating subcategory');
    throw error;
  }
}

/**
 * Update subcategory
 */
export async function updateSubcategory(subcategoryId: number, data: Partial<typeof subcategories.$inferInsert>) {
  try {
    const [subcategory] = await db
      .update(subcategories)
      .set({ ...data, updated_at: new Date() })
      .where(eq(subcategories.id, subcategoryId))
      .returning();

    if (!subcategory) {
      return null;
    }

    logger.info({ subcategoryId }, 'Subcategory updated');
    return subcategory;
  } catch (error) {
    logger.error({ subcategoryId, data, error }, 'Error updating subcategory');
    throw error;
  }
}

/**
 * Delete subcategory
 */
export async function deleteSubcategory(subcategoryId: number) {
  try {
    const [subcategory] = await db
      .update(subcategories)
      .set({ is_active: false, updated_at: new Date() })
      .where(eq(subcategories.id, subcategoryId))
      .returning();

    if (!subcategory) {
      return null;
    }

    logger.info({ subcategoryId }, 'Subcategory deleted');
    return subcategory;
  } catch (error) {
    logger.error({ subcategoryId, error }, 'Error deleting subcategory');
    throw error;
  }
}
