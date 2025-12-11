/**
 * Slack Integration Service
 * 
 * Handles Slack notifications and interactions using @slack/web-api
 */

import { WebClient, ChatPostMessageResponse } from '@slack/web-api';
import { logger } from '@/lib/logger';

// ============================================
// Configuration
// ============================================

const slackToken = process.env.SLACK_BOT_TOKEN;
const slackClient = slackToken ? new WebClient(slackToken) : null;

// Default channel for fallback
const DEFAULT_CHANNEL = process.env.SLACK_DEFAULT_CHANNEL || '#tickets';

// ============================================
// Types
// ============================================

export interface SlackMessage {
    channel: string;
    text: string;
    blocks?: any[];
    thread_ts?: string;
    metadata?: {
        event_type: string;
        event_payload: Record<string, any>;
    };
}

export interface TicketSlackNotification {
    ticketId: number;
    ticketNumber: string;
    title: string;
    description: string;
    category: string;
    subcategory?: string;
    status: string;
    createdBy: string;
    assignedTo?: string;
    assignedToSlackUserId?: string;
    priority?: string;
    link: string;
    location?: string;
    metadata?: Record<string, any>; // Form field values
}

// ============================================
// Core Functions
// ============================================

/**
 * Check if Slack is configured
 */
export function isSlackConfigured(): boolean {
    return !!slackClient;
}

/**
 * Send a message to Slack
 */
export async function sendSlackMessage(
    message: SlackMessage
): Promise<ChatPostMessageResponse | null> {
    if (!slackClient) {
        logger.warn('Slack not configured, skipping message');
        return null;
    }

    try {
        const response = await slackClient.chat.postMessage({
            channel: message.channel,
            text: message.text,
            blocks: message.blocks,
            thread_ts: message.thread_ts,
            metadata: message.metadata,
            unfurl_links: false,
            unfurl_media: false,
        });

        logger.info(
            { channel: message.channel, ts: response.ts },
            'Slack message sent'
        );

        return response;
    } catch (error: any) {
        logger.error(
            { channel: message.channel, error: error.message },
            'Failed to send Slack message'
        );
        throw error;
    }
}

/**
 * Update an existing Slack message
 */
export async function updateSlackMessage(
    channel: string,
    ts: string,
    text: string,
    blocks?: any[]
): Promise<boolean> {
    if (!slackClient) {
        return false;
    }

    try {
        await slackClient.chat.update({
            channel,
            ts,
            text,
            blocks,
        });
        return true;
    } catch (error: any) {
        logger.error({ channel, ts, error: error.message }, 'Failed to update Slack message');
        return false;
    }
}

// ============================================
// Ticket Notification Templates
// ============================================

/**
 * Build Slack blocks for a new ticket notification
 */
export function buildNewTicketBlocks(ticket: TicketSlackNotification): any[] {
    const statusDisplay = ticket.status.replace('_', ' ');
    const categoryDisplay = ticket.subcategory ? `${ticket.category} → ${ticket.subcategory}` : ticket.category;
    const ticketNumberDisplay = ticket.ticketNumber.length > 20 ? `#${ticket.ticketId}` : ticket.ticketNumber;

    const meta = ticket.metadata && typeof ticket.metadata === 'object' ? ticket.metadata : {};
    const name = (meta as any).name || (meta as any).fullName || ticket.createdBy || 'Unknown';
    const phone = (meta as any).phone || '';
    const email = (meta as any).email || '';
    const hostel = (meta as any).hostel || (meta as any).hostel_name || '';
    const location = ticket.metadata?.location || ticket.metadata?.Location || ticket.metadata?.hostel || ticket.metadata?.Hostel || ticket.metadata?.hostel_name || ticket.metadata?.location_name || ticket.metadata?.LocationName || ticket.metadata?.hostelName || ticket.metadata?.hostelname || ticket.metadata?.hostel_name || ticket.metadata?.location || ticket.metadata?.Location || ticket.metadata?.hostel || ticket.metadata?.Hostel || ticket.metadata?.hostel_name || ticket.location || '—';

    const mention = ticket.assignedToSlackUserId ? `<@${ticket.assignedToSlackUserId}>` : (ticket.assignedTo || '');

    const contactLineParts = [
        `Name: ${name}`,
        phone ? `Phone: ${phone}` : null,
        email ? `Email: ${email}` : null,
        hostel ? `Hostel: ${hostel}` : null,
    ].filter(Boolean);
    const contactLine = contactLineParts.join(' | ');

    const actions = [
        {
            type: 'button',
            text: { type: 'plain_text', text: '👀 View Ticket', emoji: true },
            url: ticket.link,
            action_id: 'view_ticket',
            style: 'primary',
        },
    ];

    // Add quick-action buttons for admins to change status
    if (ticket.link) {
        const markInProgressUrl = `${ticket.link}?action=mark_in_progress`;
        const markResolvedUrl = `${ticket.link}?action=mark_resolved`;
        actions.push(
            {
                type: 'button',
                text: { type: 'plain_text', text: '🚀 Mark In Progress', emoji: true },
                url: markInProgressUrl,
                action_id: 'mark_in_progress',
                style: 'primary',
            },
            {
                type: 'button',
                text: { type: 'plain_text', text: '✅ Mark Resolved', emoji: true },
                url: markResolvedUrl,
                action_id: 'mark_resolved',
                style: 'secondary',
            }
        );
    }

    return [
        {
            type: 'header',
            text: {
                type: 'plain_text',
                text: 'New Ticket Raised',
                emoji: true,
            },
        },
        {
            type: 'section',
            text: {
                type: 'mrkdwn',
                text: `*Ticket ID:* ${ticketNumberDisplay}\n*Category:* ${categoryDisplay}\n*Location:* ${location}\n*User:* ${name}\n*Contact:* ${contactLine}\n*Description:* ${ticket.description}\n*Status:* ${statusDisplay}`,
            },
        },
        {
            type: 'context',
            elements: [
                {
                    type: 'mrkdwn',
                    text: mention ? `CC: ${mention}` : '',
                },
            ].filter(el => (el as any).text),
        },
        {
            type: 'actions',
            elements: actions,
        },
    ];
}

/**
 * Build Slack blocks for status update notification
 */
export function buildStatusUpdateBlocks(
    ticketNumber: string,
    oldStatus: string,
    newStatus: string,
    updatedBy: string,
    link: string
): any[] {
    const statusEmoji: Record<string, string> = {
        open: '🔵',
        in_progress: '🟡',
        resolved: '🟢',
        closed: '⚫',
        reopened: '🔴',
    };

    return [
        {
            type: 'section',
            text: {
                type: 'mrkdwn',
                text: `${statusEmoji[newStatus] || '📋'} Ticket *${ticketNumber}* status changed: _${oldStatus}_ → *${newStatus}*`,
            },
        },
        {
            type: 'context',
            elements: [
                {
                    type: 'mrkdwn',
                    text: `Updated by ${updatedBy} | <${link}|View Ticket>`,
                },
            ],
        },
    ];
}

// ============================================
// High-Level Notification Functions
// ============================================

/**
 * Send notification for new ticket
 */
export async function notifyNewTicket(
    ticket: TicketSlackNotification,
    channel?: string
): Promise<string | null> {
    const targetChannel = channel || DEFAULT_CHANNEL;

    const response = await sendSlackMessage({
        channel: targetChannel,
        text: `New ticket ${ticket.ticketNumber}: ${ticket.title}`,
        blocks: buildNewTicketBlocks(ticket),
        metadata: {
            event_type: 'ticket_created',
            event_payload: { ticketId: ticket.ticketId },
        },
    });

    return response?.ts || null;
}

/**
 * Send notification for ticket status update
 */
export async function notifyStatusUpdate(
    ticketNumber: string,
    oldStatus: string,
    newStatus: string,
    updatedBy: string,
    link: string,
    channel?: string,
    threadTs?: string
): Promise<void> {
    const targetChannel = channel || DEFAULT_CHANNEL;

    await sendSlackMessage({
        channel: targetChannel,
        text: `Ticket ${ticketNumber} status: ${oldStatus} → ${newStatus}`,
        blocks: buildStatusUpdateBlocks(ticketNumber, oldStatus, newStatus, updatedBy, link),
        thread_ts: threadTs,
    });
}

/**
 * Send notification for ticket assignment
 */
export async function notifyAssignment(
    ticketNumber: string,
    assignedTo: string,
    assignedBy: string,
    link: string,
    channel?: string,
    threadTs?: string
): Promise<void> {
    const targetChannel = channel || DEFAULT_CHANNEL;

    await sendSlackMessage({
        channel: targetChannel,
        text: `Ticket ${ticketNumber} assigned to ${assignedTo}`,
        blocks: [
            {
                type: 'section',
                text: {
                    type: 'mrkdwn',
                    text: `👤 Ticket *${ticketNumber}* has been assigned to *${assignedTo}* by ${assignedBy}`,
                },
            },
            {
                type: 'context',
                elements: [
                    {
                        type: 'mrkdwn',
                        text: `<${link}|View Ticket>`,
                    },
                ],
            },
        ],
        thread_ts: threadTs,
    });
}
