/**
 * GET /api/categories/[id]/schema - Get category form schema
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCategorySchema } from '@/lib/category/category-service';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const categoryId = Number(id);

    if (isNaN(categoryId)) {
      return NextResponse.json(
        { error: 'Invalid category ID' },
        { status: 400 }
      );
    }

    const schema = await getCategorySchema(categoryId);

    if (!schema) {
      return NextResponse.json(
        { error: 'Category not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(schema);
  } catch (error: any) {
    return NextResponse.json(
      { error: 'Failed to fetch category schema' },
      { status: 500 }
    );
  }
}
