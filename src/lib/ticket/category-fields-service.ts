/**
 * Category Fields Service
 * 
 * Handles dynamic form fields validation for subcategories
 */

import { db, category_fields } from '@/db';
import { eq, and } from 'drizzle-orm';
import { logger } from '@/lib/logger';
import { Errors } from '@/lib/errors';

interface FieldValue {
  [key: string]: unknown;
}

interface ValidationRule {
  min?: number;
  max?: number;
  regex?: string;
  minLength?: number;
  maxLength?: number;
  allowedValues?: string[];
}

interface CategoryField {
  id: number;
  slug: string;
  name: string;
  field_type: string;
  required: boolean;
  placeholder: string | null;
  options: unknown;
  validation: unknown;
}

/**
 * Get active fields for a subcategory
 */
export async function getSubcategoryFields(
  subcategoryId: number
): Promise<CategoryField[]> {
  const fields = await db
    .select()
    .from(category_fields)
    .where(
      and(
        eq(category_fields.subcategory_id, subcategoryId),
        eq(category_fields.is_active, true)
      )
    )
    .orderBy(category_fields.display_order);

  return fields as CategoryField[];
}

/**
 * Validate field value based on type and rules
 */
function validateFieldValue(
  field: CategoryField,
  value: unknown
): { valid: boolean; error?: string } {
  const { field_type, required, validation } = field;

  // Check required
  if (required && (value === null || value === undefined || value === '')) {
    return { valid: false, error: `${field.name} is required` };
  }

  // If not required and empty, skip validation
  if (!value && !required) {
    return { valid: true };
  }

  const rules = (validation as ValidationRule) || {};

  // Validate by type
  switch (field_type) {
    case 'text':
    case 'textarea':
      if (typeof value !== 'string') {
        return { valid: false, error: `${field.name} must be a string` };
      }
      if (rules.minLength && value.length < rules.minLength) {
        return { valid: false, error: `${field.name} must be at least ${rules.minLength} characters` };
      }
      if (rules.maxLength && value.length > rules.maxLength) {
        return { valid: false, error: `${field.name} must be at most ${rules.maxLength} characters` };
      }
      if (rules.regex && !new RegExp(rules.regex).test(value)) {
        return { valid: false, error: `${field.name} format is invalid` };
      }
      break;

    case 'number':
      const num = typeof value === 'string' ? parseFloat(value) : value;
      if (typeof num !== 'number' || isNaN(num as number)) {
        return { valid: false, error: `${field.name} must be a number` };
      }
      if (rules.min !== undefined && (num as number) < rules.min) {
        return { valid: false, error: `${field.name} must be at least ${rules.min}` };
      }
      if (rules.max !== undefined && (num as number) > rules.max) {
        return { valid: false, error: `${field.name} must be at most ${rules.max}` };
      }
      break;

    case 'date':
      if (!(value instanceof Date) && isNaN(Date.parse(value as string))) {
        return { valid: false, error: `${field.name} must be a valid date` };
      }
      break;

    case 'select':
      const options = (field.options as { value: string }[]) || [];
      const allowedValues = options.map(o => o.value);
      if (!allowedValues.includes(value as string)) {
        return { valid: false, error: `${field.name} must be one of: ${allowedValues.join(', ')}` };
      }
      break;

    case 'multiselect':
      if (!Array.isArray(value)) {
        return { valid: false, error: `${field.name} must be an array` };
      }
      const multiselectOptions = (field.options as { value: string }[]) || [];
      const allowedMultiValues = multiselectOptions.map(o => o.value);
      const invalidValues = (value as string[]).filter(v => !allowedMultiValues.includes(v));
      if (invalidValues.length > 0) {
        return { valid: false, error: `${field.name} contains invalid values: ${invalidValues.join(', ')}` };
      }
      break;

    default:
      logger.warn({ fieldType: field_type }, 'Unknown field type');
  }

  return { valid: true };
}

/**
 * Validate ticket metadata against subcategory fields
 */
export async function validateTicketMetadata(
  subcategoryId: number,
  metadata: FieldValue
): Promise<{ valid: boolean; errors: string[] }> {
  const fields = await getSubcategoryFields(subcategoryId);
  const errors: string[] = [];

  // Validate each field
  for (const field of fields) {
    const value = metadata[field.slug];
    const result = validateFieldValue(field, value);
    
    if (!result.valid && result.error) {
      errors.push(result.error);
    }
  }

  // Check for unexpected fields
  const expectedSlugs = new Set(fields.map(f => f.slug));
  const providedSlugs = Object.keys(metadata);
  const unexpectedFields = providedSlugs.filter(slug => !expectedSlugs.has(slug));
  
  if (unexpectedFields.length > 0) {
    logger.warn(
      { subcategoryId, unexpectedFields },
      'Ticket metadata contains unexpected fields'
    );
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Get field schema for frontend form generation
 */
export async function getSubcategoryFieldSchema(
  subcategoryId: number
): Promise<CategoryField[]> {
  return getSubcategoryFields(subcategoryId);
}
