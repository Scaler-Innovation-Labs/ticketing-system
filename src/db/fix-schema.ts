
import * as dotenv from 'dotenv';
import postgres from 'postgres';

// Load environment variables
dotenv.config({ path: '.env' });
dotenv.config({ path: '.env.local' });

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
    console.error('❌ DATABASE_URL is not set');
    process.exit(1);
}

const sql = postgres(databaseUrl);

async function fix() {
    console.log('🔧 Fixing schema...');
    try {
        await sql`ALTER TABLE ticket_statuses ADD COLUMN IF NOT EXISTS is_final boolean DEFAULT false NOT NULL;`;
        console.log('✅ Added is_final column to ticket_statuses');
    } catch (error) {
        console.error('❌ Failed to add column:', error);
    }
    process.exit(0);
}

fix();
