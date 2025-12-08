
import { db } from '@/db';
import { users, roles } from '@/db';
import { eq } from 'drizzle-orm';

async function checkAndPromoteUser() {
    const email = 'byepoorav@gmail.com';

    console.log(`Checking user: ${email}`);

    // Use join query instead of relation query
    const [userWithRole] = await db
        .select({
            id: users.id,
            email: users.email,
            is_active: users.is_active,
            roleName: roles.name,
        })
        .from(users)
        .leftJoin(roles, eq(users.role_id, roles.id))
        .where(eq(users.email, email))
        .limit(1);

    if (!userWithRole) {
        console.error('User not found!');
        process.exit(1);
    }

    console.log('Current User Details:', {
        id: userWithRole.id,
        email: userWithRole.email,
        role: userWithRole.roleName,
        is_active: userWithRole.is_active,
    });

    if (userWithRole.roleName === 'super_admin') {
        console.log('User is already a super_admin.');
        process.exit(0);
    }

    console.log('Promoting user to super_admin...');

    const [superAdminRole] = await db
        .select()
        .from(roles)
        .where(eq(roles.name, 'super_admin'))
        .limit(1);

    if (!superAdminRole) {
        console.error('Super admin role not found!');
        process.exit(1);
    }

    await db.update(users)
        .set({ role_id: superAdminRole.id })
        .where(eq(users.id, userWithRole.id));

    console.log('User promoted successfully!');
    process.exit(0);
}

checkAndPromoteUser().catch(console.error);
