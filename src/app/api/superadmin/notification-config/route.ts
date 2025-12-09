/**
 * Notification Config API
 * 
 * GET - List notification configurations
 * POST - Create notification configuration
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/db';
import { notification_config, scopes, categories, subcategories } from '@/db';
import { eq, desc } from 'drizzle-orm';
import { requireRole } from '@/lib/auth/helpers';
import { logger } from '@/lib/logger';

const CreateNotificationConfigSchema = z.object({
    scope_id: z.number().int().positive().nullable().optional(),
    category_id: z.number().int().positive().nullable().optional(),
    subcategory_id: z.number().int().positive().nullable().optional(),
    enable_slack: z.boolean().default(true),
    enable_email: z.boolean().default(true),
    slack_channel: z.string().max(255).nullable().optional(),
    slack_cc_user_ids: z.array(z.string()).nullable().optional(),
    email_recipients: z.array(z.string().email()).nullable().optional(),
    priority: z.number().int().min(0).max(100).optional(),
});

/**
 * GET /api/superadmin/notification-config
 * List all notification configurations
 */
export async function GET() {
    try {
        await requireRole(['super_admin']);

        const configs = await db
            .select({
                id: notification_config.id,
                scope_id: notification_config.scope_id,
                scope_name: scopes.name,
                category_id: notification_config.category_id,
                category_name: categories.name,
                subcategory_id: notification_config.subcategory_id,
                subcategory_name: subcategories.name,
                enable_slack: notification_config.enable_slack,
                enable_email: notification_config.enable_email,
                slack_channel: notification_config.slack_channel,
                slack_cc_user_ids: notification_config.slack_cc_user_ids,
                email_recipients: notification_config.email_recipients,
                priority: notification_config.priority,
                is_active: notification_config.is_active,
                created_at: notification_config.created_at,
            })
            .from(notification_config)
            .leftJoin(scopes, eq(notification_config.scope_id, scopes.id))
            .leftJoin(categories, eq(notification_config.category_id, categories.id))
            .leftJoin(subcategories, eq(notification_config.subcategory_id, subcategories.id))
            .orderBy(desc(notification_config.priority), notification_config.created_at);

        return NextResponse.json({ configs });
    } catch (error: any) {
        logger.error({ error: error.message }, 'Error fetching notification configs');
        return NextResponse.json(
            { error: error.message || 'Failed to fetch notification configs' },
            { status: error.status || 500 }
        );
    }
}

/**
 * POST /api/superadmin/notification-config
 * Create a notification configuration
 */
export async function POST(request: NextRequest) {
    try {
        await requireRole(['super_admin']);

        const body = await request.json();
        const parsed = CreateNotificationConfigSchema.safeParse(body);

        if (!parsed.success) {
            return NextResponse.json(
                { error: 'Invalid input', details: parsed.error.issues },
                { status: 400 }
            );
        }

        const data = parsed.data;

        // Calculate priority based on specificity:
        // Subcategory (20) > Category (10) > Scope (5) > Global Default (0)
        let calculatedPriority = data.priority ?? 0;
        if (calculatedPriority === 0) {
            if (data.subcategory_id) {
                calculatedPriority = 20;
            } else if (data.category_id) {
                calculatedPriority = 10;
            } else if (data.scope_id) {
                calculatedPriority = 5;
            } else {
                calculatedPriority = 0; // Global default
            }
        }

        const [config] = await db
            .insert(notification_config)
            .values({
                scope_id: data.scope_id ?? null,
                category_id: data.category_id ?? null,
                subcategory_id: data.subcategory_id ?? null,
                enable_slack: data.enable_slack,
                enable_email: data.enable_email,
                slack_channel: data.slack_channel ?? null,
                slack_cc_user_ids: data.slack_cc_user_ids ?? null,
                email_recipients: data.email_recipients ?? null,
                priority: calculatedPriority,
                is_active: true,
            })
            .returning();

        logger.info({ configId: config.id }, 'Notification config created');

        return NextResponse.json({ config }, { status: 201 });
    } catch (error: any) {
        logger.error({ error: error.message }, 'Error creating notification config');
        return NextResponse.json(
            { error: error.message || 'Failed to create notification config' },
            { status: error.status || 500 }
        );
    }
}
