/**
 * Notification Config Detail API
 * 
 * GET - Get notification configuration by ID
 * PATCH - Update notification configuration
 * DELETE - Delete notification configuration
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/db';
import { notification_config } from '@/db';
import { eq } from 'drizzle-orm';
import { requireRole } from '@/lib/auth/helpers';
import { logger } from '@/lib/logger';

const UpdateNotificationConfigSchema = z.object({
    enable_slack: z.boolean().optional(),
    enable_email: z.boolean().optional(),
    slack_channel: z.string().max(255).optional().nullable(),
    slack_cc_user_ids: z.array(z.string()).optional().nullable(),
    email_recipients: z.array(z.string().email()).optional().nullable(),
    priority: z.number().int().min(0).max(100).optional(),
    is_active: z.boolean().optional(),
});

/**
 * GET /api/superadmin/notification-config/[id]
 */
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        await requireRole(['super_admin']);

        const { id } = await params;
        const configId = parseInt(id, 10);

        if (isNaN(configId)) {
            return NextResponse.json({ error: 'Invalid config ID' }, { status: 400 });
        }

        const [config] = await db
            .select()
            .from(notification_config)
            .where(eq(notification_config.id, configId))
            .limit(1);

        if (!config) {
            return NextResponse.json({ error: 'Config not found' }, { status: 404 });
        }

        return NextResponse.json({ config });
    } catch (error: any) {
        logger.error({ error: error.message }, 'Error fetching notification config');
        return NextResponse.json(
            { error: error.message || 'Failed to fetch notification config' },
            { status: error.status || 500 }
        );
    }
}

/**
 * PATCH /api/superadmin/notification-config/[id]
 */
export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        await requireRole(['super_admin']);

        const { id } = await params;
        const configId = parseInt(id, 10);

        if (isNaN(configId)) {
            return NextResponse.json({ error: 'Invalid config ID' }, { status: 400 });
        }

        const body = await request.json();
        const parsed = UpdateNotificationConfigSchema.safeParse(body);

        if (!parsed.success) {
            return NextResponse.json(
                { error: 'Invalid input', details: parsed.error.issues },
                { status: 400 }
            );
        }

        const [config] = await db
            .update(notification_config)
            .set({
                ...parsed.data,
                updated_at: new Date(),
            })
            .where(eq(notification_config.id, configId))
            .returning();

        if (!config) {
            return NextResponse.json({ error: 'Config not found' }, { status: 404 });
        }

        logger.info({ configId }, 'Notification config updated');

        return NextResponse.json({ config });
    } catch (error: any) {
        logger.error({ error: error.message }, 'Error updating notification config');
        return NextResponse.json(
            { error: error.message || 'Failed to update notification config' },
            { status: error.status || 500 }
        );
    }
}

/**
 * DELETE /api/superadmin/notification-config/[id]
 */
export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        await requireRole(['super_admin']);

        const { id } = await params;
        const configId = parseInt(id, 10);

        if (isNaN(configId)) {
            return NextResponse.json({ error: 'Invalid config ID' }, { status: 400 });
        }

        const [deleted] = await db
            .delete(notification_config)
            .where(eq(notification_config.id, configId))
            .returning();

        if (!deleted) {
            return NextResponse.json({ error: 'Config not found' }, { status: 404 });
        }

        logger.info({ configId }, 'Notification config deleted');

        return NextResponse.json({ message: 'Config deleted successfully' });
    } catch (error: any) {
        logger.error({ error: error.message }, 'Error deleting notification config');
        return NextResponse.json(
            { error: error.message || 'Failed to delete notification config' },
            { status: error.status || 500 }
        );
    }
}
