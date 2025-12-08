import { db, categories, subcategories } from './src/db';
import { eq } from 'drizzle-orm';

async function check() {
    console.log('--- Checking Categories ---');
    const allCats = await db.select().from(categories);
    console.log(`Found ${allCats.length} categories.`);

    if (allCats.length === 0) {
        console.log('No categories found. Cannot test subcategories.');
        process.exit(0);
    }

    const cat = allCats[0];
    console.log(`Testing with Category: ${cat.name} (ID: ${cat.id})`);

    console.log('--- Creating Subcategory ---');
    const slug = `test-sub-${Date.now()}`;
    try {
        const [newSub] = await db.insert(subcategories).values({
            category_id: cat.id,
            name: `Test Sub ${Date.now()}`,
            slug: slug,
            description: 'Test Description',
            is_active: true
        }).returning();
        console.log('Subcategory created:', newSub);
    } catch (e) {
        console.error('Failed to create subcategory:', e);
    }

    console.log('--- Listing Subcategories ---');
    const subs = await db.select().from(subcategories).where(eq(subcategories.category_id, cat.id));
    console.log(`Found ${subs.length} subcategories for category ${cat.id}:`);
    subs.forEach(s => console.log(`- ${s.name} (${s.slug})`));

    process.exit(0);
}

check();
