import { db, users, domains, scopes, roles, admin_profiles } from './src/db';
import { eq, inArray } from 'drizzle-orm';

async function check() {
    console.log('--- Fetching Staff Members ---');

    const staffMembers = await db
        .select({
            id: users.id,
            full_name: users.full_name,
            email: users.email,
            role: roles.name,
            domain: domains.name,
            scope: scopes.name,
        })
        .from(users)
        .innerJoin(roles, eq(users.role_id, roles.id))
        .leftJoin(admin_profiles, eq(admin_profiles.user_id, users.id))
        .leftJoin(domains, eq(admin_profiles.primary_domain_id, domains.id))
        .leftJoin(scopes, eq(admin_profiles.primary_scope_id, scopes.id))
        .where(inArray(roles.name, ["admin", "super_admin", "committee"]));

    console.log(`Found ${staffMembers.length} staff members:`);
    staffMembers.forEach(s => {
        console.log(`- ${s.full_name} (${s.email}) | Role: ${s.role} | Domain: ${s.domain || 'None'} | Scope: ${s.scope || 'None'}`);
    });

    console.log('\n--- Checking All Users (for comparison) ---');
    const allUsers = await db
        .select({
            id: users.id,
            full_name: users.full_name,
            email: users.email,
            role: roles.name,
        })
        .from(users)
        .leftJoin(roles, eq(users.role_id, roles.id));

    console.log(`Total users in DB: ${allUsers.length}`);
    allUsers.forEach(u => {
        if (!staffMembers.find(s => s.id === u.id)) {
            console.log(`[MISSING FROM STAFF LIST] ${u.full_name} (${u.email}) | Role: ${u.role}`);
        }
    });

    process.exit(0);
}

check();
