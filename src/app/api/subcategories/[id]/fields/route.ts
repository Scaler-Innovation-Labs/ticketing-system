/**
 * Subcategory Fields API
 * 
 * GET /api/subcategories/[id]/fields
 * Get dynamic form fields for a subcategory
 */

import { NextRequest } from 'next/server';
import { ApiResponse } from '@/lib/auth/helpers';
import { handleApiError, Errors } from '@/lib/errors';
import { getSubcategoryFieldSchema } from '@/lib/ticket/category-fields-service';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/subcategories/[id]/fields
 * Get form fields for subcategory
 */
export async function GET(
  req: NextRequest,
  context: RouteContext
) {
  try {
    const { id } = await context.params;
    const subcategoryId = parseInt(id, 10);

    if (isNaN(subcategoryId)) {
      throw Errors.validation('Invalid subcategory ID');
    }

    // Get fields schema
    const fields = await getSubcategoryFieldSchema(subcategoryId);

    return ApiResponse.success({ fields });
  } catch (error) {
    logger.error({ error }, 'Failed to get subcategory fields');
    return handleApiError(error);
  }
}
