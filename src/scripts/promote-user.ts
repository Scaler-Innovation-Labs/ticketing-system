
import { db } from '@/db';
import { users, roles } from '@/db';
import { eq } from 'drizzle-orm';

async function checkAndPromoteUser() {
    const email = 'byepoorav@gmail.com';

    console.log(`Checking user: ${email}`);

    const user = await db.query.users.findFirst({
        where: eq(users.email, email),
        with: {
            role: true,
        },
    });

    if (!user) {
        console.error('User not found!');
        process.exit(1);
    }

    console.log('Current User Details:', {
        id: user.id,
        email: user.email,
        role: user.role?.name,
        is_active: user.is_active,
    });

    if (user.role?.name === 'super_admin') {
        console.log('User is already a super_admin.');
        process.exit(0);
    }

    console.log('Promoting user to super_admin...');

    const superAdminRole = await db.query.roles.findFirst({
        where: eq(roles.name, 'super_admin'),
    });

    if (!superAdminRole) {
        console.error('Super admin role not found!');
        process.exit(1);
    }

    await db.update(users)
        .set({ role_id: superAdminRole.id })
        .where(eq(users.id, user.id));

    console.log('User promoted successfully!');
    process.exit(0);
}

checkAndPromoteUser().catch(console.error);
