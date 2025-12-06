/**
 * GET /api/categories/list - List all active categories
 */

import { NextResponse } from 'next/server';
import { getActiveCategories } from '@/lib/category/category-service';

export async function GET() {
  try {
    const categories = await getActiveCategories(false);
    
    return NextResponse.json({ categories });
  } catch (error: any) {
    return NextResponse.json(
      { error: 'Failed to fetch categories' },
      { status: 500 }
    );
  }
}
