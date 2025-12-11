/**
 * Notification Service
 * 
 * Orchestrates notifications across multiple channels (Slack, Email, In-App)
 * Uses the notification_config table to determine routing
 */

import { db } from '@/db';
import { notification_config, notification_channels, ticket_integrations, users, tickets } from '@/db';
import { eq, and, desc, isNull } from 'drizzle-orm';
import { logger } from '@/lib/logger';
import {
    isSlackConfigured,
    notifyNewTicket as slackNotifyNewTicket,
    notifyStatusUpdate as slackNotifyStatusUpdate,
    notifyAssignment as slackNotifyAssignment,
    TicketSlackNotification,
} from '@/lib/integrations/slack';
import {
    isEmailConfigured,
    notifyNewTicketEmail,
    notifyStatusUpdateEmail,
    notifyAssignmentEmail,
    TicketEmailData,
} from '@/lib/integrations/email';

// ============================================
// Types
// ============================================

export interface NotificationContext {
    ticketId: number;
    ticketNumber: string;
    title: string;
    description: string;
    category: string;
    categoryId?: number;
    subcategoryId?: number;
    scopeId?: number;
    status: string;
    priority?: string;
    createdBy: string;
    createdByEmail: string;
    assignedTo?: string;
    assignedToEmail?: string;
    link: string;
}

export interface NotificationResult {
    slack: { sent: boolean; threadId?: string };
    email: { sent: boolean; messageId?: string };
}

// ============================================
// Channel Resolution
// ============================================

/**
 * Get notification configuration for a ticket based on scope/category hierarchy
 * Priority: Subcategory (20) > Category (10) > Scope (5) > Global Default (0)
 */
async function getNotificationConfig(
    scopeId?: number,
    categoryId?: number,
    subcategoryId?: number
) {
    // Priority 1: Subcategory config (priority = 20)
    if (subcategoryId) {
        const [subcategoryConfig] = await db
            .select()
            .from(notification_config)
            .where(
                and(
                    eq(notification_config.subcategory_id, subcategoryId),
                    eq(notification_config.is_active, true)
                )
            )
            .limit(1);
        
        if (subcategoryConfig) {
            return subcategoryConfig;
        }
    }

    // Priority 2: Category config (priority = 10)
    if (categoryId) {
        const [categoryConfig] = await db
            .select()
            .from(notification_config)
            .where(
                and(
                    eq(notification_config.category_id, categoryId),
                    isNull(notification_config.subcategory_id), // Category-level only
                    eq(notification_config.is_active, true)
                )
            )
            .limit(1);
        
        if (categoryConfig) {
            return categoryConfig;
        }
    }

    // Priority 3: Scope config (priority = 5)
    if (scopeId) {
        const [scopeConfig] = await db
            .select()
            .from(notification_config)
            .where(
                and(
                    eq(notification_config.scope_id, scopeId),
                    isNull(notification_config.category_id), // Scope-level only (no category)
                    isNull(notification_config.subcategory_id),
                    eq(notification_config.is_active, true)
                )
            )
            .limit(1);
        
        if (scopeConfig) {
            return scopeConfig;
        }
    }

    // Priority 4: Global default (priority = 0)
    const [globalConfig] = await db
        .select()
        .from(notification_config)
        .where(
            and(
                isNull(notification_config.scope_id),
                isNull(notification_config.category_id),
                isNull(notification_config.subcategory_id),
                eq(notification_config.is_active, true)
            )
        )
        .limit(1);

    return globalConfig || null;
}

/**
 * Get Slack channel for a ticket using notification_config priority hierarchy
 */
async function getSlackChannel(
    ticketId: number,
    categoryId?: number,
    scopeId?: number,
    subcategoryId?: number
): Promise<string | null> {
    // Check if ticket has a specific channel (from ticket_integrations)
    const [integration] = await db
        .select()
        .from(ticket_integrations)
        .where(eq(ticket_integrations.ticket_id, ticketId))
        .limit(1);

    if (integration?.slack_channel_id) {
        return integration.slack_channel_id;
    }

    // Use notification_config with priority hierarchy
    const config = await getNotificationConfig(scopeId, categoryId, subcategoryId);
    
    if (config?.slack_channel) {
        return config.slack_channel;
    }

    return null; // Use default channel
}

/**
 * Save Slack thread ID for a ticket
 */
async function saveSlackThread(ticketId: number, threadId: string, channelId: string): Promise<void> {
    try {
        await db
            .insert(ticket_integrations)
            .values({
                ticket_id: ticketId,
                slack_thread_id: threadId,
                slack_channel_id: channelId,
            })
            .onConflictDoUpdate({
                target: ticket_integrations.ticket_id,
                set: {
                    slack_thread_id: threadId,
                    slack_channel_id: channelId,
                    updated_at: new Date(),
                },
            });
    } catch (error: any) {
        logger.error({ ticketId, error: error.message }, 'Failed to save Slack thread');
    }
}

// ============================================
// Notification Functions
// ============================================

/**
 * Send notifications for a new ticket
 */
export async function notifyTicketCreated(
    context: NotificationContext
): Promise<NotificationResult> {
    const result: NotificationResult = {
        slack: { sent: false },
        email: { sent: false },
    };

    const config = await getNotificationConfig(
        context.scopeId,
        context.categoryId,
        context.subcategoryId
    );

    // Slack notification
    if (isSlackConfigured() && (config?.enable_slack !== false)) {
        try {
            const channel = await getSlackChannel(
                context.ticketId,
                context.categoryId,
                context.scopeId,
                context.subcategoryId
            );

            const slackData: TicketSlackNotification = {
                ticketId: context.ticketId,
                ticketNumber: context.ticketNumber,
                title: context.title,
                description: context.description,
                category: context.category,
                status: context.status,
                priority: context.priority,
                createdBy: context.createdBy,
                assignedTo: context.assignedTo,
                link: context.link,
            };

            const threadId = await slackNotifyNewTicket(slackData, channel || undefined);

            if (threadId && channel) {
                await saveSlackThread(context.ticketId, threadId, channel);
            }

            result.slack = { sent: true, threadId: threadId || undefined };
        } catch (error: any) {
            logger.error({ error: error.message, ticketId: context.ticketId }, 'Slack notification failed');
        }
    }

    // Email notification
    if (isEmailConfigured() && (config?.enable_email !== false)) {
        try {
            const recipients: string[] = [];

            // Add ticket creator (student who created the ticket)
            if (context.createdByEmail) {
                recipients.push(context.createdByEmail);
            }

            // Add configured email recipients
            if (config?.email_recipients && Array.isArray(config.email_recipients)) {
                recipients.push(...config.email_recipients);
            }

            if (recipients.length > 0) {
                const emailData: TicketEmailData = {
                    ticketId: context.ticketId,
                    ticketNumber: context.ticketNumber,
                    title: context.title,
                    description: context.description,
                    category: context.category,
                    status: context.status,
                    createdBy: context.createdBy,
                    assignedTo: context.assignedTo,
                    link: context.link,
                };

                const messageId = await notifyNewTicketEmail(emailData, recipients);
                result.email = { sent: true, messageId: messageId || undefined };
            }
        } catch (error: any) {
            logger.error({ error: error.message, ticketId: context.ticketId }, 'Email notification failed');
        }
    }

    logger.info(
        { ticketId: context.ticketId, slack: result.slack.sent, email: result.email.sent },
        'Ticket created notifications sent'
    );

    return result;
}

/**
 * Send notifications for ticket status update
 */
export async function notifyStatusUpdated(
    ticketId: number,
    ticketNumber: string,
    title: string,
    oldStatus: string,
    newStatus: string,
    updatedBy: string,
    link: string,
    studentEmail?: string
): Promise<NotificationResult> {
    const result: NotificationResult = {
        slack: { sent: false },
        email: { sent: false },
    };

    // Get existing thread/channel
    const [integration] = await db
        .select()
        .from(ticket_integrations)
        .where(eq(ticket_integrations.ticket_id, ticketId))
        .limit(1);

    // Slack notification
    if (isSlackConfigured()) {
        try {
            await slackNotifyStatusUpdate(
                ticketNumber,
                oldStatus,
                newStatus,
                updatedBy,
                link,
                integration?.slack_channel_id || undefined,
                integration?.slack_thread_id || undefined
            );
            result.slack = { sent: true };
        } catch (error: any) {
            logger.error({ error: error.message, ticketId }, 'Slack status update failed');
        }
    }

    // Email to student
    if (isEmailConfigured() && studentEmail) {
        try {
            const messageId = await notifyStatusUpdateEmail(
                ticketNumber,
                title,
                oldStatus,
                newStatus,
                updatedBy,
                link,
                [studentEmail]
            );
            result.email = { sent: true, messageId: messageId || undefined };
        } catch (error: any) {
            logger.error({ error: error.message, ticketId }, 'Email status update failed');
        }
    }

    return result;
}

/**
 * Send notifications for ticket assignment
 */
export async function notifyTicketAssigned(
    ticketId: number,
    ticketNumber: string,
    title: string,
    assignedTo: string,
    assignedToEmail: string,
    assignedBy: string,
    link: string
): Promise<NotificationResult> {
    const result: NotificationResult = {
        slack: { sent: false },
        email: { sent: false },
    };

    // Get existing thread/channel
    const [integration] = await db
        .select()
        .from(ticket_integrations)
        .where(eq(ticket_integrations.ticket_id, ticketId))
        .limit(1);

    // Slack notification
    if (isSlackConfigured()) {
        try {
            await slackNotifyAssignment(
                ticketNumber,
                assignedTo,
                assignedBy,
                link,
                integration?.slack_channel_id || undefined,
                integration?.slack_thread_id || undefined
            );
            result.slack = { sent: true };
        } catch (error: any) {
            logger.error({ error: error.message, ticketId }, 'Slack assignment notification failed');
        }
    }

    // Email to assigned admin
    if (isEmailConfigured() && assignedToEmail) {
        try {
            const messageId = await notifyAssignmentEmail(
                ticketNumber,
                title,
                assignedTo,
                assignedBy,
                link,
                assignedToEmail
            );
            result.email = { sent: true, messageId: messageId || undefined };
        } catch (error: any) {
            logger.error({ error: error.message, ticketId }, 'Email assignment notification failed');
        }
    }

    return result;
}
