/**
 * Field Service
 * 
 * Manages dynamic form fields and their options
 * Separate from category service for better modularity
 */

import { db } from '@/db';
import { category_fields, field_options, subcategories } from '@/db';
import { eq, desc, inArray } from 'drizzle-orm';
import { logger } from '@/lib/logger';

export interface FieldData {
  subcategory_id: number;
  name: string;
  slug: string;
  field_type: string;
  required: boolean;
  placeholder?: string | null;
  validation?: any;
  display_order: number;
}

export interface FieldOptionData {
  label: string;
  value: string;
}

/**
 * Get field by ID with options
 */
export async function getFieldById(id: number) {
  try {
    const [field] = await db
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
        is_active: category_fields.is_active,
        created_at: category_fields.created_at,
      })
      .from(category_fields)
      .where(eq(category_fields.id, id))
      .limit(1);

    if (!field) {
      return null;
    }

    // Fetch options if select/multiselect
    const options = await db
      .select()
      .from(field_options)
      .where(eq(field_options.field_id, id))
      .orderBy(field_options.display_order);

    return { ...field, options };
  } catch (error) {
    logger.error({ error, id }, 'Error fetching field');
    throw error;
  }
}

/**
 * Update field
 */
export async function updateField(
  id: number,
  data: Partial<FieldData>
) {
  try {
    const [field] = await db
      .update(category_fields)
      .set(data)
      .where(eq(category_fields.id, id))
      .returning();

    if (!field) {
      throw new Error('Field not found');
    }

    logger.info({ id }, 'Field updated');
    return field;
  } catch (error) {
    logger.error({ error, id }, 'Error updating field');
    throw error;
  }
}

/**
 * Delete field (soft delete)
 */
export async function deleteField(id: number) {
  try {
    await db
      .update(category_fields)
      .set({ is_active: false })
      .where(eq(category_fields.id, id));

    logger.info({ id }, 'Field deleted');
  } catch (error) {
    logger.error({ error, id }, 'Error deleting field');
    throw error;
  }
}

/**
 * Update field options
 */
export async function updateFieldOptions(
  fieldId: number,
  options: FieldOptionData[]
) {
  try {
    await db.transaction(async (tx) => {
      // Delete existing options
      await tx
        .delete(field_options)
        .where(eq(field_options.field_id, fieldId));

      // Insert new options
      if (options.length > 0) {
        await tx.insert(field_options).values(
          options.map((opt, idx) => ({
            field_id: fieldId,
            label: opt.label,
            value: opt.value,
            display_order: idx,
          }))
        );
      }
    });

    logger.info({ fieldId, count: options.length }, 'Field options updated');
  } catch (error) {
    logger.error({ error, fieldId }, 'Error updating field options');
    throw error;
  }
}

/**
 * Get fields for multiple subcategories (batch fetch)
 */
export async function getFieldsBySubcategories(subcategoryIds: number[]) {
  try {
    if (subcategoryIds.length === 0) return [];

    const fields = await db
      .select()
      .from(category_fields)
      .where(inArray(category_fields.subcategory_id, subcategoryIds))
      .orderBy(category_fields.display_order);

    // Fetch all options for these fields
    const fieldIds = fields.map(f => f.id);
    const options = fieldIds.length > 0
      ? await db
          .select()
          .from(field_options)
          .where(inArray(field_options.field_id, fieldIds))
          .orderBy(field_options.display_order)
      : [];

    // Group options by field_id
    const optionsByField = options.reduce((acc, opt) => {
      if (!acc[opt.field_id]) acc[opt.field_id] = [];
      acc[opt.field_id].push(opt);
      return acc;
    }, {} as Record<number, typeof options>);

    return fields.map(field => ({
      ...field,
      options: optionsByField[field.id] || [],
    }));
  } catch (error) {
    logger.error({ error }, 'Error fetching fields by subcategories');
    throw error;
  }
}
