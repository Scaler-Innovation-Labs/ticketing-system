/**
 * Slack Interactions API
 * 
 * POST - Handle Slack button interactions and modal submissions
 * 
 * This endpoint receives callbacks from Slack when users interact with buttons
 * or submit modals in Slack messages.
 */

import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';

// Force Node.js runtime for Slack integrations
export const runtime = 'nodejs';

/**
 * POST /api/slack/interactions
 * Handle Slack interactive components (buttons, modals, etc.)
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const interaction = body;

    logger.info(
      { type: interaction.type, actions: interaction.actions },
      '[Slack] Received interaction'
    );

    // Handle different interaction types
    switch (interaction.type) {
      case 'block_actions': {
        const action = interaction.actions?.[0];
        if (!action) {
          return NextResponse.json({ text: 'OK' });
        }

        logger.info({ actionId: action.action_id }, '[Slack] Block action');

        // TODO: Implement button actions
        // - ticket_close: Close ticket from Slack
        // - ticket_tat: Set TAT from Slack
        // - ticket_comment: Add comment from Slack
        // - ticket_assign: Assign ticket from Slack

        return NextResponse.json({ text: 'OK' });
      }

      case 'view_submission': {
        // Handle modal submissions
        const metadata = JSON.parse(
          interaction.view.private_metadata || '{}'
        );

        logger.info({ metadata }, '[Slack] Modal submitted');

        // TODO: Implement modal handlers
        // - TAT modal: Set TAT for ticket
        // - Comment modal: Add comment to ticket
        // - Assignment modal: Assign ticket to admin

        return NextResponse.json({ response_action: 'clear' });
      }

      default:
        logger.warn(
          { type: interaction.type },
          '[Slack] Unknown interaction type'
        );
        return NextResponse.json({ text: 'OK' });
    }
  } catch (error: any) {
    logger.error({ error: error.message }, '[Slack] Interaction failed');
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
