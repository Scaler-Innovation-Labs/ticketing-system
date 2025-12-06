/**
 * Ticket Escalation Cron Job
 * 
 * GET /api/cron/escalate-tickets
 * Automatically escalate overdue tickets
 * 
 * Should be called periodically (e.g., every 30 minutes)
 */

import { NextRequest } from 'next/server';
import { handleApiError } from '@/lib/errors';
import { ApiResponse, verifyCronSecret } from '@/lib/auth/helpers';
import { runEscalation } from '@/lib/ticket/ticket-escalation-service';
import { logger } from '@/lib/logger';

/**
 * GET /api/cron/escalate-tickets
 * Run ticket escalation job
 * 
 * Authentication: Requires CRON_SECRET header
 */
export async function GET(req: NextRequest) {
  try {
    // Verify cron secret
    verifyCronSecret(req);

    logger.info('Starting escalation cron job');

    const result = await runEscalation();

    logger.info(
      { result },
      'Escalation cron job completed successfully'
    );

    return ApiResponse.success({
      message: 'Escalation completed',
      ...result,
    });
  } catch (error) {
    logger.error({ error }, 'Escalation cron job failed');
    return handleApiError(error);
  }
}
