
import 'dotenv/config';
import { db, users, roles } from '@/db';
import { eq } from 'drizzle-orm';

async function main() {
    console.log('🌱 Seeding Super Admin...');

    // 1. Get Super Admin Role ID
    const [role] = await db
        .select()
        .from(roles)
        .where(eq(roles.name, 'super_admin'))
        .limit(1);

    if (!role) {
        console.error('❌ Error: super_admin role not found!');
        process.exit(1);
    }

    console.log(`✅ Found super_admin role ID: ${role.id}`);

    const email = 'hipoorav@gmail.com';
    const fullName = 'Poorav Kumar Gupta';

    // 2. Check if user exists by email
    const [existingUser] = await db
        .select()
        .from(users)
        .where(eq(users.email, email))
        .limit(1);

    if (existingUser) {
        console.log(`ℹ️  User ${email} already exists. Updating role...`);

        await db
            .update(users)
            .set({
                role_id: role.id,
                full_name: fullName,
                updated_at: new Date(),
            })
            .where(eq(users.id, existingUser.id));

        console.log(`✅ User ${email} promoted to Super Admin!`);
    } else {
        console.log(`ℹ️  User ${email} not found. Creating new user...`);

        // Create new user with placeholder external_id
        // Note: When this user signs in with Clerk, if the external_id doesn't match,
        // a duplicate might be created depending on sync logic.
        // Ideally, we should know the Clerk ID beforehand.
        const externalId = `seed_superadmin_${Date.now()}`;

        await db.insert(users).values({
            email,
            full_name: fullName,
            external_id: externalId,
            role_id: role.id,
            is_active: true,
            phone: '+919876543210', // Random phone
            avatar_url: `https://ui-avatars.com/api/?name=${encodeURIComponent(fullName)}&background=random`,
        });

        console.log(`✅ Created new Super Admin user: ${email}`);
        console.log(`⚠️  Note: This user has a placeholder external_id: ${externalId}`);
        console.log(`   If you sign in with Clerk, you may need to update the external_id to match your Clerk ID.`);
    }

    process.exit(0);
}

main().catch((err) => {
    console.error('❌ Seeding failed:', err);
    process.exit(1);
});
