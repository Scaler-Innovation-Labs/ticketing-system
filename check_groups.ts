import { db } from './src/db';
import { ticket_groups } from './src/db/schema-tickets';

async function main() {
  const groups = await db.select().from(ticket_groups);
  console.log('Groups in DB:', JSON.stringify(groups, null, 2));
  process.exit(0);
}

main().catch(console.error);
