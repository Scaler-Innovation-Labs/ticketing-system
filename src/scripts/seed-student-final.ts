
import 'dotenv/config';
import { db } from '../db';
import { users, students, batches, class_sections, hostels } from '../db/schema';
import { eq, and } from 'drizzle-orm';

async function seedStudentFinal() {
    console.log('Seeding student details (Final)...');

    const email = 'poorav.24bcs10080@sst.scaler.com';
    const targetBatchYear = 2028;
    const targetSectionName = 'Section B';
    const targetHostelName = 'Neeladri';
    const targetRollNo = '10080';

    // 1. Get User
    const [user] = await db.select().from(users).where(eq(users.email, email));
    if (!user) {
        console.error('User not found:', email);
        process.exit(1);
    }
    console.log('Found user:', user.full_name);

    // 2. Get Batch 2028
    let [batch] = await db.select().from(batches).where(eq(batches.year, targetBatchYear));
    if (!batch) {
        console.log(`Batch ${targetBatchYear} not found, creating...`);
        [batch] = await db.insert(batches).values({
            year: targetBatchYear,
            name: `Batch ${targetBatchYear}`,
            is_active: true
        }).returning();
    }
    console.log('Using Batch:', batch.year, 'ID:', batch.id);

    // 3. Get/Create Section B for Batch 2028
    let [section] = await db.select().from(class_sections)
        .where(and(
            eq(class_sections.name, targetSectionName),
            eq(class_sections.batch_id, batch.id)
        ));

    if (!section) {
        console.log(`Section ${targetSectionName} for Batch ${targetBatchYear} not found, creating...`);
        [section] = await db.insert(class_sections).values({
            name: targetSectionName,
            department: 'CSE',
            batch_id: batch.id,
            is_active: true
        }).returning();
    }
    console.log('Using Section:', section.name, 'ID:', section.id);

    // 4. Get Hostel Neeladri
    const [hostel] = await db.select().from(hostels).where(eq(hostels.name, targetHostelName));
    if (!hostel) {
        console.error('Hostel not found:', targetHostelName);
        process.exit(1);
    }
    console.log('Using Hostel:', hostel.name, 'ID:', hostel.id);

    // 5. Upsert Student Record
    // Check if exists
    const [existingStudent] = await db.select().from(students).where(eq(students.user_id, user.id));

    if (existingStudent) {
        console.log('Updating existing student record...');
        await db.update(students)
            .set({
                roll_no: targetRollNo,
                batch_id: batch.id,
                class_section_id: section.id,
                hostel_id: hostel.id,
                updated_at: new Date()
            })
            .where(eq(students.user_id, user.id));
    } else {
        console.log('Inserting new student record...');
        await db.insert(students).values({
            user_id: user.id,
            roll_no: targetRollNo,
            batch_id: batch.id,
            class_section_id: section.id,
            hostel_id: hostel.id,
            department: 'CSE', // Default
            updated_at: new Date()
        });
    }

    console.log('Successfully seeded student record!');
    process.exit(0);
}

seedStudentFinal();
