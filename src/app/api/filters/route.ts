/**
 * Ticket Filters Management
 * 
 * GET /api/filters - List user's saved filters
 * POST /api/filters - Create new filter
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/helpers';
import { listUserFilters, createFilter } from '@/lib/filter/filter-service';
import { logger } from '@/lib/logger';
import { z } from 'zod';

const CreateFilterSchema = z.object({
  name: z.string().min(1).max(100),
  filter_config: z.record(z.string(), z.any()),
  is_default: z.boolean().default(false),
});

export async function GET(request: NextRequest) {
  try {
    const { dbUser } = await getCurrentUser();

    const filters = await listUserFilters(dbUser.id);

    return NextResponse.json({ filters });
  } catch (error: any) {
    logger.error({ error: error.message }, 'Error listing filters');
    return NextResponse.json(
      { error: error.message || 'Failed to list filters' },
      { status: error.message.includes('Unauthorized') ? 401 : 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const { dbUser } = await getCurrentUser();

    const body = await request.json();
    const parsed = CreateFilterSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: parsed.error.issues },
        { status: 400 }
      );
    }

    const filterId = await createFilter({
      user_id: dbUser.id,
      name: parsed.data.name,
      filter_config: parsed.data.filter_config,
      is_default: parsed.data.is_default,
    });

    return NextResponse.json({ id: filterId }, { status: 201 });
  } catch (error: any) {
    logger.error({ error: error.message }, 'Error creating filter');
    return NextResponse.json(
      { error: error.message || 'Failed to create filter' },
      { status: 500 }
    );
  }
}
