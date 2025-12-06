/**
 * Slack Thread Info API
 * 
 * GET - Get Slack thread information for a ticket
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth/helpers';
import { db } from '@/db';
import { tickets } from '@/db';
import { eq } from 'drizzle-orm';
import { logger } from '@/lib/logger';

/**
 * GET /api/slack/thread/[threadId]
 * Get ticket associated with Slack thread
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ threadId: string }> }
) {
  try {
    await requireRole(['admin', 'super_admin']);

    const { threadId } = await params;

    // Find ticket by Slack thread ID (stored in metadata)
    const ticketsWithThread = await db
      .select()
      .from(tickets)
      .where(eq(tickets.id, tickets.id)); // TODO: Query by metadata.slack_thread_id

    // For now, return empty result
    // TODO: Implement proper Slack thread tracking in metadata
    logger.info({ threadId }, '[Slack] Thread lookup');

    return NextResponse.json({
      thread_id: threadId,
      tickets: [],
      message: 'Thread lookup not yet implemented',
    });
  } catch (error: any) {
    logger.error({ error: error.message }, '[Slack] Thread lookup failed');
    return NextResponse.json(
      { error: error.message || 'Failed to lookup thread' },
      { status: error.status || 500 }
    );
  }
}
