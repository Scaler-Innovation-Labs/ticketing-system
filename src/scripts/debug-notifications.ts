
import { db } from '@/db';
import { outbox } from '@/db/schema-queue';
import { isSlackConfigured, sendSlackMessage } from '@/lib/integrations/slack';
import { isEmailConfigured, sendEmail } from '@/lib/integrations/email';
import { eq } from 'drizzle-orm';

async function main() {
    console.log('--- Starting Notification Debug ---');

    // 1. Check Environment Variables
    console.log('\n1. Checking Configuration:');
    console.log('SLACK_BOT_TOKEN:', process.env.SLACK_BOT_TOKEN ? 'Present' : 'MISSING');
    console.log('SLACK_DEFAULT_CHANNEL:', process.env.SLACK_DEFAULT_CHANNEL || 'Defaulting to #tickets');
    console.log('SMTP_HOST:', process.env.SMTP_HOST || 'MISSING');
    console.log('SMTP_USER:', process.env.SMTP_USER || 'MISSING');
    console.log('SMTP_PASSWORD:', process.env.SMTP_PASSWORD ? 'Present' : 'MISSING');
    console.log('SMTP_PORT:', process.env.SMTP_PORT || '587 (default)');
    console.log('EMAIL_FROM:', process.env.EMAIL_FROM || 'Not set');

    // 2. Test Slack
    console.log('\n2. Testing Slack Connection:');
    if (isSlackConfigured()) {
        try {
            console.log('Attempting to send test message to default channel...');
            const res = await sendSlackMessage({
                channel: process.env.SLACK_DEFAULT_CHANNEL || '#tickets',
                text: '🔔 Test notification from Debug Script',
            });
            console.log('Slack Send Result:', res?.ok ? 'SUCCESS' : 'FAILED', res?.error);
        } catch (e: any) {
            console.error('Slack Send Error:', e.message);
        }
    } else {
        console.log('Slack is NOT configured.');
    }

    // 3. Test Email
    console.log('\n3. Testing Email Connection:');
    if (isEmailConfigured()) {
        try {
            // Send to EMAIL_FROM or a test email
            const to = process.env.EMAIL_FROM || 'test@example.com';
            console.log(`Attempting to send test email to ${to}...`);
            await sendEmail({
                to,
                subject: 'Test Notification Debug',
                text: 'This is a test email from the debug script.',
            });
            console.log('Email Send Result: SUCCESS');
        } catch (e: any) {
            console.error('Email Send Error:', e.message);
        }
    } else {
        console.log('Email is NOT configured.');
    }

    // 4. Check Outbox
    console.log('\n4. Checking Outbox Status:');
    try {
        const pending = await db.select().from(outbox).where(eq(outbox.status, 'pending'));
        console.log(`Pending Outbox Events: ${pending.length}`);
        if (pending.length > 0) {
            console.log('First 3 pending events:', pending.slice(0, 3).map(e => ({
                id: e.id,
                type: e.event_type,
                attempts: e.attempts,
                last_error: e.last_error
            })));
        }
    } catch (e: any) {
        console.error('Database Error:', e.message);
    }

    console.log('\n--- Debug Complete ---');
    process.exit(0);
}

main().catch(console.error);
