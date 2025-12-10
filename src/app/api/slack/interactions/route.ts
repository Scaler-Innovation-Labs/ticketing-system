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
import { db, tickets, ticket_statuses, users, admin_profiles } from '@/db';
import { eq } from 'drizzle-orm';
import { updateTicketStatus } from '@/lib/ticket/ticket-status-service';

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

        // Handle ticket status updates
        if (action.action_id === 'ticket_in_progress' || action.action_id === 'ticket_resolved') {
          const value = action.value as string;
          const [actionType, ticketIdStr] = value.split('_');
          const ticketId = parseInt(ticketIdStr, 10);

          if (!ticketId || isNaN(ticketId)) {
            logger.warn({ value }, '[Slack] Invalid ticket ID in action value');
            return NextResponse.json({ text: 'Invalid ticket ID' });
          }

          // Get user from Slack user ID
          const slackUserId = interaction.user?.id;
          if (!slackUserId) {
            logger.warn('[Slack] No user ID in interaction');
            return NextResponse.json({ text: 'User not found' });
          }

          // Find user by Slack user ID (from admin_profiles)
          const [dbUser] = await db
            .select({
              id: users.id,
              full_name: users.full_name,
              email: users.email,
            })
            .from(users)
            .innerJoin(admin_profiles, eq(users.id, admin_profiles.user_id))
            .where(eq(admin_profiles.slack_user_id, slackUserId))
            .limit(1);

          if (!dbUser) {
            logger.warn({ slackUserId }, '[Slack] User not found in database');
            return NextResponse.json({ 
              text: 'User not found. Please ensure your Slack account is linked to your user profile.',
              response_type: 'ephemeral'
            });
          }

          try {
            // Get current ticket status
            const [ticket] = await db
              .select({
                id: tickets.id,
                status_id: tickets.status_id,
                status_value: ticket_statuses.value,
              })
              .from(tickets)
              .leftJoin(ticket_statuses, eq(tickets.status_id, ticket_statuses.id))
              .where(eq(tickets.id, ticketId))
              .limit(1);

            if (!ticket) {
              return NextResponse.json({ text: 'Ticket not found' });
            }

            // Determine new status
            const newStatus = action.action_id === 'ticket_resolved' ? 'resolved' : 'in_progress';

            // Update ticket status
            await updateTicketStatus(ticketId, dbUser.id, newStatus);

            logger.info(
              { ticketId, userId: dbUser.id, newStatus },
              '[Slack] Ticket status updated'
            );

            return NextResponse.json({
              text: `Ticket ${ticketId} marked as ${newStatus}`,
              response_type: 'ephemeral',
            });
          } catch (error: any) {
            logger.error(
              { error: error.message, ticketId },
              '[Slack] Failed to update ticket status'
            );
            return NextResponse.json({
              text: `Failed to update ticket: ${error.message}`,
              response_type: 'ephemeral',
            });
          }
        }

        // Handle view ticket action (just acknowledge)
        if (action.action_id === 'view_ticket') {
          return NextResponse.json({ text: 'OK' });
        }

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
