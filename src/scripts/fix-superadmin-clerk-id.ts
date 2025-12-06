
import 'dotenv/config';
import { db, users } from '@/db';
import { eq } from 'drizzle-orm';

async function main() {
    console.log('🔧 Fixing Super Admin Clerk ID...');

    const email = 'hipoorav@gmail.com';
    const correctClerkId = 'user_36RBoMXYGDWoKMei8wVq96Y2GTx'; // Extracted from error logs

    // 1. Find the user by email
    const [user] = await db
        .select()
        .from(users)
        .where(eq(users.email, email))
        .limit(1);

    if (!user) {
        console.error(`❌ User ${email} not found! Did you run the seed script?`);
        process.exit(1);
    }

    console.log(`Found user: ${user.full_name} (ID: ${user.id})`);
    console.log(`Current External ID: ${user.external_id}`);
    console.log(`New External ID:     ${correctClerkId}`);

    // 2. Update the external_id
    await db
        .update(users)
        .set({
            external_id: correctClerkId,
            updated_at: new Date(),
        })
        .where(eq(users.id, user.id));

    console.log(`✅ Successfully updated external_id for ${email}`);
    console.log('You should now be able to log in without errors.');

    process.exit(0);
}

main().catch((err) => {
    console.error('❌ Fix failed:', err);
    process.exit(1);
});
