/**
 * Script to seed a specific user as super_admin
 * Run with: npx tsx src/scripts/seed-super-admin.ts
 */

import { db } from '@/db';
import { users, roles } from '@/db';
import { eq } from 'drizzle-orm';

const USER_DATA = {
    external_id: 'user_36bccpPTPiDVPCdorb22iHHiYUY',
    email: 'n.vedvarshit@gmail.com',
    full_name: 'Veda Varshit',
};

async function seedSuperAdmin() {
    console.log(`🔧 Seeding super admin: ${USER_DATA.email}`);

    // Get super_admin role
    const [superAdminRole] = await db
        .select()
        .from(roles)
        .where(eq(roles.name, 'super_admin'))
        .limit(1);

    if (!superAdminRole) {
        console.error('❌ super_admin role not found! Run npm run db:seed first.');
        process.exit(1);
    }

    console.log(`  Found super_admin role: ${superAdminRole.id}`);

    // Check if user exists by email (primary check)
    const [existingUser] = await db
        .select()
        .from(users)
        .where(eq(users.email, USER_DATA.email))
        .limit(1);

    if (existingUser) {
        console.log('  User already exists, updating role and external_id...');
        await db
            .update(users)
            .set({
                role_id: superAdminRole.id,
                external_id: USER_DATA.external_id, // Update Clerk ID
                full_name: USER_DATA.full_name,
            })
            .where(eq(users.id, existingUser.id));
        console.log('✅ User updated to super_admin!');
    } else {
        console.log('  Creating new user...');
        await db.insert(users).values({
            auth_provider: 'clerk',
            external_id: USER_DATA.external_id,
            email: USER_DATA.email,
            full_name: USER_DATA.full_name,
            role_id: superAdminRole.id,
            is_active: true,
        });
        console.log('✅ User created as super_admin!');
    }

    process.exit(0);
}

seedSuperAdmin().catch((e) => {
    console.error('❌ Error:', e);
    process.exit(1);
});
