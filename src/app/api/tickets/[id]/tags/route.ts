/**
 * Ticket Tags
 * 
 * POST /api/tickets/[id]/tags - Add tags
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/helpers';
import { addTags, removeTag } from '@/lib/ticket/ticket-enhancement-service';
import { logger } from '@/lib/logger';
import { z } from 'zod';

const AddTagsSchema = z.object({
  tags: z.array(z.string().min(1).max(50)),
});

const RemoveTagSchema = z.object({
  tag: z.string().min(1).max(50),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await getCurrentUser();

    const { id: idStr } = await params;
    const ticketId = parseInt(idStr, 10);
    if (isNaN(ticketId)) {
      return NextResponse.json({ error: 'Invalid ticket ID' }, { status: 400 });
    }

    const body = await request.json();
    const parsed = AddTagsSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: parsed.error.issues },
        { status: 400 }
      );
    }

    await addTags(ticketId, parsed.data.tags);

    return NextResponse.json({ success: true }, { status: 201 });
  } catch (error: any) {
    logger.error({ error: error.message }, 'Error adding tags');
    return NextResponse.json(
      { error: error.message || 'Failed to add tags' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await getCurrentUser();

    const { id: idStr } = await params;
    const ticketId = parseInt(idStr, 10);
    if (isNaN(ticketId)) {
      return NextResponse.json({ error: 'Invalid ticket ID' }, { status: 400 });
    }

    const body = await request.json();
    const parsed = RemoveTagSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: parsed.error.issues },
        { status: 400 }
      );
    }

    await removeTag(ticketId, parsed.data.tag);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    logger.error({ error: error.message }, 'Error removing tag');
    return NextResponse.json(
      { error: error.message || 'Failed to remove tag' },
      { status: 500 }
    );
  }
}
