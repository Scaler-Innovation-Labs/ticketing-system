/**
 * Clerk Webhook Handler
 * 
 * POST /api/webhooks/clerk - Sync users from Clerk
 */

import { NextRequest, NextResponse } from 'next/server';
import { db, users, roles } from '@/db';
import { eq } from 'drizzle-orm';
import { logger } from '@/lib/logger';

const webhookSecret = process.env.CLERK_WEBHOOK_SECRET;

export async function POST(request: NextRequest) {
  if (!webhookSecret) {
    logger.error({}, 'Missing CLERK_WEBHOOK_SECRET');
    return NextResponse.json(
      { error: 'Webhook configuration error' },
      { status: 500 }
    );
  }

  try {
    const payload = await request.json();
    const eventType = payload.type;
    
    logger.info({ eventType }, 'Clerk webhook received');

    // TODO: Add signature verification using svix package
    // For now, accepting all requests (insecure - fix in production)

    switch (eventType) {
      case 'user.created':
      case 'user.updated': {
        const { id, email_addresses, phone_numbers, first_name, last_name, image_url } = payload.data;

        const email = email_addresses?.[0]?.email_address;
        const phone = phone_numbers?.[0]?.phone_number;
        const full_name = [first_name, last_name].filter(Boolean).join(' ');

        if (!email) {
          logger.warn({ id }, 'User missing email');
          break;
        }

        // Get student role by default
        const [studentRole] = await db
          .select({ id: roles.id })
          .from(roles)
          .where(eq(roles.name, 'student'))
          .limit(1);

        // Upsert user
        await db
          .insert(users)
          .values({
            external_id: id,
            email,
            phone: phone || null,
            full_name: full_name || null,
            avatar_url: image_url || null,
            role_id: studentRole?.id || null,
            is_active: true,
          })
          .onConflictDoUpdate({
            target: users.external_id,
            set: {
              email,
              phone: phone || null,
              full_name: full_name || null,
              avatar_url: image_url || null,
              updated_at: new Date(),
            },
          });

        logger.info({ email }, 'User synced from Clerk');
        break;
      }

      case 'user.deleted': {
        const { id } = payload.data;
        
        await db
          .update(users)
          .set({ is_active: false, updated_at: new Date() })
          .where(eq(users.external_id, id));

        logger.info({ external_id: id }, 'User deactivated from Clerk');
        break;
      }

      default:
        logger.info({ eventType }, 'Unhandled webhook event');
    }

    return NextResponse.json({ received: true });
  } catch (error: any) {
    logger.error({ error: error.message }, 'Webhook processing error');
    return NextResponse.json(
      { error: 'Webhook processing failed' },
      { status: 400 }
    );
  }
}
