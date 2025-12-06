
import { db } from '@/db';
import { users, roles } from '@/db';
import { eq } from 'drizzle-orm';

async function verifyUserRole() {
    const email = 'byepoorav@gmail.com';

    const result = await db
        .select({
            email: users.email,
            role: roles.name,
            is_active: users.is_active
        })
        .from(users)
        .leftJoin(roles, eq(users.role_id, roles.id))
        .where(eq(users.email, email))
        .limit(1);

    if (result.length > 0) {
        console.log('User Details:', result[0]);
    } else {
        console.log('User not found');
    }
    process.exit(0);
}

verifyUserRole().catch(console.error);
