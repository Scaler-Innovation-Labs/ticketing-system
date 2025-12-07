/**
 * Database Seed Script (Standalone)
 * 
 * Populates required initial data for the ticketing system.
 * Run with: pnpm run db:seed
 */

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

async function seed() {
    console.log('🌱 Starting database seed...\n');

    // ============================================
    // 1. Seed Roles (Required)
    // ============================================
    console.log('📦 Seeding roles...');

    const roleData = [
        { name: 'super_admin', description: 'Full system access - can manage all users, domains, and settings' },
        { name: 'snr_admin', description: 'Senior Admin - can view all tickets, manage committees and categories' },
        { name: 'admin', description: 'Admin - can manage assigned tickets and categories' },
        { name: 'committee', description: 'Committee member - can view and manage committee-tagged tickets' },
        { name: 'student', description: 'Student - can create and track their own tickets' },
    ];

    for (const role of roleData) {
        await sql`
      INSERT INTO roles (name, description)
      VALUES (${role.name}, ${role.description})
      ON CONFLICT (name) DO NOTHING
    `;
    }
    console.log('  ✅ Roles seeded (5 roles)\n');

    // ============================================
    // 2. Seed Ticket Statuses (Required)
    // ============================================
    console.log('📦 Seeding ticket statuses...');

    const statusData = [
        { value: 'open', label: 'Open', description: 'Ticket has been created and is awaiting acknowledgement', color: '#3B82F6', progress_percent: 0, display_order: 1, is_final: false },
        { value: 'acknowledged', label: 'Acknowledged', description: 'Admin has acknowledged the ticket', color: '#8B5CF6', progress_percent: 20, display_order: 2, is_final: false },
        { value: 'in_progress', label: 'In Progress', description: 'Work is being done on the ticket', color: '#F59E0B', progress_percent: 50, display_order: 3, is_final: false },
        { value: 'resolved', label: 'Resolved', description: 'Ticket has been resolved, awaiting student confirmation', color: '#10B981', progress_percent: 90, display_order: 4, is_final: true },
        { value: 'closed', label: 'Closed', description: 'Ticket is closed and archived', color: '#6B7280', progress_percent: 100, display_order: 5, is_final: true },
        { value: 'reopened', label: 'Reopened', description: 'Ticket was reopened by student', color: '#EF4444', progress_percent: 10, display_order: 6, is_final: false },
        { value: 'cancelled', label: 'Cancelled', description: 'Ticket was cancelled', color: '#9CA3AF', progress_percent: 100, display_order: 7, is_final: true },
    ];

    for (const status of statusData) {
        await sql`
      INSERT INTO ticket_statuses (value, label, description, color, progress_percent, display_order, is_final)
      VALUES (${status.value}, ${status.label}, ${status.description}, ${status.color}, ${status.progress_percent}, ${status.display_order}, ${status.is_final})
      ON CONFLICT (value) DO UPDATE SET
        label = EXCLUDED.label,
        description = EXCLUDED.description,
        color = EXCLUDED.color,
        progress_percent = EXCLUDED.progress_percent,
        display_order = EXCLUDED.display_order,
        is_final = EXCLUDED.is_final
    `;
    }
    console.log('  ✅ Ticket statuses seeded (7 statuses)\n');

    // ============================================
    // 3. Seed Default Domain (Required)
    // ============================================
    console.log('📦 Seeding default domain...');

    await sql`
    INSERT INTO domains (name, slug, description, scope_mode, is_active)
    VALUES ('General', 'general', 'General tickets and requests', 'none', true)
    ON CONFLICT (slug) DO NOTHING
  `;
    console.log('  ✅ Default domain seeded\n');

    // ============================================
    // 4. Seed Hostels (Sample data)
    // ============================================
    console.log('📦 Seeding sample hostels...');

    const hostelData = [
        { name: 'Boys Hostel A', code: 'BHA' },
        { name: 'Boys Hostel B', code: 'BHB' },
        { name: 'Girls Hostel A', code: 'GHA' },
        { name: 'Girls Hostel B', code: 'GHB' },
    ];

    for (const hostel of hostelData) {
        await sql`
      INSERT INTO hostels (name, code)
      VALUES (${hostel.name}, ${hostel.code})
      ON CONFLICT (code) DO NOTHING
    `;
    }
    console.log('  ✅ Hostels seeded (4 hostels)\n');

    // ============================================
    // 5. Seed Batches (Sample data)
    // ============================================
    console.log('📦 Seeding sample batches...');

    const currentYear = new Date().getFullYear();
    for (let i = 0; i < 4; i++) {
        const year = currentYear - i;
        await sql`
      INSERT INTO batches (year, name)
      VALUES (${year}, ${`Batch ${year}`})
      ON CONFLICT (year) DO NOTHING
    `;
    }
    console.log('  ✅ Batches seeded (4 batches)\n');

    // ============================================
    // 6. Seed Default Categories
    // ============================================
    console.log('📦 Seeding default categories...');

    // Get the general domain ID
    const [domain] = await sql`SELECT id FROM domains WHERE slug = 'general' LIMIT 1`;

    if (domain) {
        const categoryData = [
            { name: 'IT Support', slug: 'it-support', description: 'Technical and IT related issues', icon: '🖥️', color: '#3B82F6', display_order: 1 },
            { name: 'Hostel', slug: 'hostel', description: 'Hostel related complaints and requests', icon: '🏠', color: '#10B981', display_order: 2 },
            { name: 'Academic', slug: 'academic', description: 'Academic related queries', icon: '📚', color: '#8B5CF6', display_order: 3 },
            { name: 'Infrastructure', slug: 'infrastructure', description: 'Campus infrastructure issues', icon: '🏗️', color: '#F59E0B', display_order: 4 },
            { name: 'Other', slug: 'other', description: 'Other general requests', icon: '📝', color: '#6B7280', display_order: 5 },
        ];

        for (const category of categoryData) {
            await sql`
        INSERT INTO categories (name, slug, description, icon, color, domain_id, display_order)
        VALUES (${category.name}, ${category.slug}, ${category.description}, ${category.icon}, ${category.color}, ${domain.id}, ${category.display_order})
        ON CONFLICT (slug) DO NOTHING
      `;
        }
        console.log('  ✅ Categories seeded (5 categories)\n');
    }

    console.log('✨ Database seeding complete!\n');
    console.log('Next steps:');
    console.log('  1. Run `pnpm run dev` to start the development server');
    console.log('  2. Sign up with Clerk - first user can be promoted to super_admin');
    console.log('  3. Configure notification integrations (Slack, Email) in .env\n');
}

// Run seed
seed()
    .then(async () => {
        console.log('Seed completed successfully');
        await sql.end();
        process.exit(0);
    })
    .catch(async (error) => {
        console.error('Seed failed:', error);
        await sql.end();
        process.exit(1);
    });
