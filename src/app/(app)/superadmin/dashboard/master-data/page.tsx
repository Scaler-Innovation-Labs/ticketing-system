import { MasterDataManagement } from "@/components/admin/master-data";
import { db, class_sections, batches, hostels } from "@/db";
import { eq } from "drizzle-orm";

// Use ISR - revalidate every 5 minutes (master data changes infrequently)
export const revalidate = 300;

export default async function MasterDataPage() {
  // Fetch only active master data from DB in parallel
  const [sections, batchesList, hostelsList] = await Promise.all([
    db.select().from(class_sections).where(eq(class_sections.is_active, true)),
    db.select().from(batches).where(eq(batches.is_active, true)),
    db.select().from(hostels).where(eq(hostels.is_active, true)),
  ]);

  return (
    <MasterDataManagement
      initialSections={sections}
      initialBatches={batchesList}
      initialHostels={hostelsList}
    />
  );
}
