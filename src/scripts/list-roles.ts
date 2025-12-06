
import { db } from '@/db';
import { roles } from '@/db';

async function listRoles() {
    const allRoles = await db.select().from(roles);
    console.log('Available Roles:', allRoles);
    process.exit(0);
}

listRoles().catch(console.error);
