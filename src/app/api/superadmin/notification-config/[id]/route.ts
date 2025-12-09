/**
 * Notification Config by ID API
 * 
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
import { Errors } from '@/lib/errors';

const UpdateNotificationConfigSchema = z.object({
    scope_id: z.number().int().positive().optional().nullable(),
    category_id: z.number().int().positive().optional().nullable(),
    subcategory_id: z.number().int().positive().optional().nullable(),
    enable_slack: z.boolean().optional(),
    enable_email: z.boolean().optional(),
    slack_channel: z.string().max(255).optional().nullable(),
    slack_cc_user_ids: z.array(z.string()).optional().nullable(),
    email_recipients: z.array(z.string().email()).optional().nullable(),
    priority: z.number().int().min(0).max(100).optional(),
    is_active: z.boolean().optional(),
});

type RouteContext = {
  params: Promise<{ id: string }>;
};

/**
 * PATCH /api/superadmin/notification-config/[id]
 * Update a notification configuration
 */
export async function PATCH(request: NextRequest, context: RouteContext) {
    try {
        await requireRole(['super_admin']);

        const { id } = await context.params;
        const configId = parseInt(id, 10);

        if (isNaN(configId)) {
            return NextResponse.json(
                { error: 'Invalid config ID' },
                { status: 400 }
            );
        }

        const body = await request.json();
        const parsed = UpdateNotificationConfigSchema.safeParse(body);

        if (!parsed.success) {
            return NextResponse.json(
                { error: 'Invalid input', details: parsed.error.issues },
                { status: 400 }
            );
        }

        // Check if config exists
        const [existingConfig] = await db
            .select()
            .from(notification_config)
            .where(eq(notification_config.id, configId))
            .limit(1);

        if (!existingConfig) {
            throw Errors.notFound('Notification config', String(configId));
        }

        const data = parsed.data;

        // Build update object with only provided fields
        const updates: Record<string, any> = {
            updated_at: new Date(),
        };

        if (data.scope_id !== undefined) {
            updates.scope_id = data.scope_id;
        }
        if (data.category_id !== undefined) {
            updates.category_id = data.category_id;
        }
        if (data.subcategory_id !== undefined) {
            updates.subcategory_id = data.subcategory_id;
        }
        if (data.enable_slack !== undefined) {
            updates.enable_slack = data.enable_slack;
        }
        if (data.enable_email !== undefined) {
            updates.enable_email = data.enable_email;
        }
        if (data.slack_channel !== undefined) {
            updates.slack_channel = data.slack_channel;
        }
        if (data.slack_cc_user_ids !== undefined) {
            updates.slack_cc_user_ids = data.slack_cc_user_ids;
        }
        if (data.email_recipients !== undefined) {
            updates.email_recipients = data.email_recipients;
        }
        if (data.is_active !== undefined) {
            updates.is_active = data.is_active;
        }

        // Calculate priority if not explicitly provided and IDs are being updated
        if (data.priority !== undefined) {
            updates.priority = data.priority;
        } else if (data.scope_id !== undefined || data.category_id !== undefined || data.subcategory_id !== undefined) {
            // Recalculate priority based on final state
            const finalScopeId = data.scope_id !== undefined ? data.scope_id : existingConfig.scope_id;
            const finalCategoryId = data.category_id !== undefined ? data.category_id : existingConfig.category_id;
            const finalSubcategoryId = data.subcategory_id !== undefined ? data.subcategory_id : existingConfig.subcategory_id;
            
            if (finalSubcategoryId) {
                updates.priority = 20;
            } else if (finalCategoryId) {
                updates.priority = 10;
            } else if (finalScopeId) {
                updates.priority = 5;
            } else {
                updates.priority = 0; // Global default
            }
        }

        const [updatedConfig] = await db
            .update(notification_config)
            .set(updates)
            .where(eq(notification_config.id, configId))
            .returning();

        logger.info({ configId: updatedConfig.id }, 'Notification config updated');

        return NextResponse.json({ config: updatedConfig });
    } catch (error: any) {
        logger.error({ error: error.message || error }, 'Error updating notification config');
        const status = error.status || error.code === 'NOT_FOUND' ? 404 : 500;
        return NextResponse.json(
            { error: error.message || 'Failed to update notification config' },
            { status }
        );
    }
}

/**
 * DELETE /api/superadmin/notification-config/[id]
 * Delete a notification configuration
 */
export async function DELETE(request: NextRequest, context: RouteContext) {
    try {
        await requireRole(['super_admin']);

        const { id } = await context.params;
        const configId = parseInt(id, 10);

        if (isNaN(configId)) {
            return NextResponse.json(
                { error: 'Invalid config ID' },
                { status: 400 }
            );
        }

        // Check if config exists
        const [existingConfig] = await db
            .select()
            .from(notification_config)
            .where(eq(notification_config.id, configId))
            .limit(1);

        if (!existingConfig) {
            throw Errors.notFound('Notification config', String(configId));
        }

        await db
            .delete(notification_config)
            .where(eq(notification_config.id, configId));

        logger.info({ configId }, 'Notification config deleted');

        return NextResponse.json({ message: 'Notification config deleted' });
    } catch (error: any) {
        logger.error({ error: error.message || error }, 'Error deleting notification config');
        const status = error.status || error.code === 'NOT_FOUND' ? 404 : 500;
        return NextResponse.json(
            { error: error.message || 'Failed to delete notification config' },
            { status }
        );
    }
}
