import { MasterDataManagement } from "@/components/admin/master-data";
import { db, class_sections, batches, hostels } from "@/db";

// Use ISR - revalidate every 5 minutes (master data changes infrequently)
export const revalidate = 300;

export default async function MasterDataPage() {
  // Fetch all master data from DB in parallel
  const [sections, batchesList, hostelsList] = await Promise.all([
    db.select().from(class_sections),
    db.select().from(batches),
    db.select().from(hostels),
  ]);

  return (
    <MasterDataManagement
      initialSections={sections}
      initialBatches={batchesList}
      initialHostels={hostelsList}
    />
  );
}
