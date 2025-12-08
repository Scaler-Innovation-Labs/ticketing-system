import { db, committees } from './src/db';
import { eq } from 'drizzle-orm';

async function check() {
    const result = await db.select().from(committees).where(eq(committees.id, 2));
    console.log('Committee 2:', JSON.stringify(result, null, 2));

    const all = await db.select().from(committees);
    console.log('All Committees:', JSON.stringify(all.map(c => ({ id: c.id, name: c.name })), null, 2));

    process.exit(0);
}

check();
