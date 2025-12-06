
import 'dotenv/config';
import { db } from '../db';
import { users, students, batches, class_sections, hostels } from '../db/schema';
import { eq } from 'drizzle-orm';

async function verifyStudent() {
    console.log('Verifying student data...');

    const email = 'poorav.24bcs10080@sst.scaler.com';


    const allUsers = await db.select().from(users).where(eq(users.email, email));
    console.log('All Users with email:', allUsers);

    const allStudents = await db.select().from(students);
    console.log('All Students:', allStudents);

    process.exit(0);
}

verifyStudent();
