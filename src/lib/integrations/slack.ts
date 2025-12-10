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
    status: string;
    createdBy: string;
    assignedTo?: string;
    priority?: string;
    link: string;
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
    // Priority emoji and color
    const priorityEmoji: Record<string, string> = {
        low: '🟢',
        medium: '🟡',
        high: '🟠',
        urgent: '🔴',
    };
    
    const priorityColor: Record<string, string> = {
        low: '#36a64f',
        medium: '#ffa500',
        high: '#ff6b6b',
        urgent: '#dc3545',
    };

    const priority = (ticket.priority || 'medium').toLowerCase();
    const priorityIcon = priorityEmoji[priority] || '🟡';
    const statusEmoji = ticket.status === 'open' ? '🔵' : '📋';
    
    // Format description (truncate if too long)
    const maxDescLength = 300;
    const description = ticket.description.length > maxDescLength
        ? `${ticket.description.substring(0, maxDescLength)}...`
        : ticket.description;

    return [
        {
            type: 'header',
            text: {
                type: 'plain_text',
                text: `${priorityIcon} New Ticket: ${ticket.ticketNumber}`,
                emoji: true,
            },
        },
        {
            type: 'section',
            text: {
                type: 'mrkdwn',
                text: `*${ticket.title}*`,
            },
        },
        {
            type: 'section',
            text: {
                type: 'mrkdwn',
                text: `_${description}_`,
            },
        },
        {
            type: 'divider',
        },
        {
            type: 'section',
            fields: [
                {
                    type: 'mrkdwn',
                    text: `*📁 Category:*\n${ticket.category}`,
                },
                {
                    type: 'mrkdwn',
                    text: `*${statusEmoji} Status:*\n${ticket.status.charAt(0).toUpperCase() + ticket.status.slice(1)}`,
                },
                {
                    type: 'mrkdwn',
                    text: `*👤 Created By:*\n${ticket.createdBy}`,
                },
                {
                    type: 'mrkdwn',
                    text: `*🎯 Assigned To:*\n${ticket.assignedTo || '_Unassigned_'}`,
                },
            ],
        },
        {
            type: 'actions',
            elements: [
                {
                    type: 'button',
                    text: {
                        type: 'plain_text',
                        text: '👀 View Ticket',
                        emoji: true,
                    },
                    url: ticket.link,
                    action_id: 'view_ticket',
                    style: 'primary',
                },
                {
                    type: 'button',
                    text: {
                        type: 'plain_text',
                        text: '✅ Mark In Progress',
                        emoji: true,
                    },
                    style: 'primary',
                    action_id: 'ticket_in_progress',
                    value: `in_progress_${ticket.ticketId}`,
                },
                {
                    type: 'button',
                    text: {
                        type: 'plain_text',
                        text: '✔️ Mark Resolved',
                        emoji: true,
                    },
                    style: 'primary',
                    action_id: 'ticket_resolved',
                    value: `resolved_${ticket.ticketId}`,
                },
            ],
        },
        {
            type: 'context',
            elements: [
                {
                    type: 'mrkdwn',
                    text: `🆔 Ticket #${ticket.ticketId} • ${priorityIcon} Priority: ${priority.toUpperCase()} • ⏰ ${new Date().toLocaleString('en-US', { 
                        month: 'short', 
                        day: 'numeric', 
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                    })}`,
                },
            ],
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
