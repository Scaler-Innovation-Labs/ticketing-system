import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { db, students, hostels, class_sections, batches } from "@/db";
import { eq, asc } from "drizzle-orm";
import { getCachedUser } from "@/lib/cache/cached-queries";
import { getCategoriesHierarchy } from "@/lib/category/getCategoriesHierarchy";
import TicketForm from "@/components/features/tickets/forms/TicketForm/TicketForm";

/**
 * Student New Ticket Page
 * Note: Auth is handled by student/layout.tsx
 */
export default async function NewTicketPage() {
  // Layout ensures userId exists and user is created via getOrCreateUser
  const { userId } = await auth();
  if (!userId) throw new Error("Unauthorized"); // TypeScript type guard - layout ensures this never happens

  // Use cached function for better performance (request-scoped deduplication)
  const dbUser = await getCachedUser(userId);
  if (!dbUser) {
    redirect("/student/profile");
    return;
  }

  // Optimize: Load only categories first (lightweight), subcategories will load on-demand
  // This significantly reduces initial page load time
  const [
    studentDataResult,
    hostelsList,
    categoryHierarchy,
  ] = await Promise.all([
    // Fetch only needed student fields with class section name (optimized: select specific fields)
    db
      .select({
        student_id: students.id,
        hostel_id: students.hostel_id,
        room_no: students.room_no,
        class_section_name: class_sections.name,
        batch_year: batches.year,
      })
      .from(students)
      .leftJoin(class_sections, eq(students.class_section_id, class_sections.id))
      .leftJoin(batches, eq(students.batch_id, batches.id))
      .where(eq(students.user_id, dbUser.id))
      .limit(1),

    // Fetch only id and name for hostels (optimized: reduce payload size)
    db
      .select({
        id: hostels.id,
        name: hostels.name,
      })
      .from(hostels)
      .where(eq(hostels.is_active, true))
      .orderBy(asc(hostels.name)),

    // Fetch full category hierarchy (cached for 4 hours)
    // Note: For even better performance, consider loading only categories initially
    // and loading subcategories on-demand when user selects a category
    getCategoriesHierarchy(),
  ]);

  const [studentData] = studentDataResult;
  if (!studentData) redirect("/student/profile");

  // Find the student's hostel name from ID
  const studentHostel = hostelsList.find(h => h.id === studentData.hostel_id);

  // Normalize student - use full_name from schema
  const fullName = dbUser.full_name || "";

  const normalizedStudent = {
    fullName: fullName,
    email: dbUser.email || "",
    mobile: dbUser.phone || "",
    hostel: studentHostel?.name || null,  // Use hostel name instead of ID
    roomNumber: studentData.room_no,
    batchYear: studentData.batch_year,
    classSection: studentData.class_section_name || null,  // Use class section name instead of ID
  };

  // OPTIMIZATION: Pre-filter and flatten categories on server to reduce client-side processing
  // For students, hide ANY committee-related categories (e.g., "committee", "_committee", "food_committee")
  const visibleCategories = Array.isArray(categoryHierarchy) 
    ? categoryHierarchy.filter((cat) => {
        const label = (cat.label || "").toLowerCase();
        const value = (cat.value || "").toLowerCase();
        return !label.includes("committee") && !value.includes("committee");
      })
    : [];

  // Pre-flatten hierarchy into shapes expected by TicketForm (server-side processing)
  // This reduces client-side computation and improves initial render time
  const categoriesFromHierarchy = visibleCategories.map((cat) => ({
    id: cat.id,
    name: cat.label || cat.name || '',
    slug: cat.value || cat.slug || '',
  }));

  const subcategoriesWithSubs = visibleCategories.flatMap((cat) =>
    (cat.subcategories || []).map((sub) => ({
      id: sub.id,
      category_id: cat.id,
      name: sub.label || sub.name || '',
      slug: sub.value || sub.slug || '',
      display_order: sub.display_order ?? 0,
      // Pre-process fields on server to reduce client-side work
      fields: (sub.fields || []).map((f) => ({
        id: f.id,
        name: f.name || '',
        slug: f.slug || '',
        field_type: f.type || 'text',
        required: f.required ?? false,
        placeholder: f.placeholder ?? null,
        help_text: f.help_text ?? null,
        validation_rules: (f.validation_rules ?? {}) as Record<string, unknown>,
        display_order: f.display_order ?? 0,
        subcategory_id: sub.id,
        options: (f.options || []).map((opt, index) => ({
          id: opt.id || index,
          label: opt.label || '',
          value: opt.value || '',
        })),
      })),
    }))
  );

  // Pre-flatten dynamic fields for TicketForm (server-side processing)
  const mappedCategoryFields = subcategoriesWithSubs.flatMap((sub) => sub.fields || []);

  // Define standard profile fields to show for all tickets
  // These are always shown to help admins contact students
  const standardProfileFields = [
    {
      field_name: "name",
      storage_key: "name",
      required: false,
      editable: false,
      display_order: 1,
    },
    {
      field_name: "email",
      storage_key: "email",
      required: false,
      editable: false,
      display_order: 2,
    },
    {
      field_name: "phone",
      storage_key: "phone",
      required: false,
      editable: true,
      display_order: 3,
    },
    {
      field_name: "hostel",
      storage_key: "hostel",
      required: false,
      editable: true,
      display_order: 4,
    },
    {
      field_name: "roomNumber",
      storage_key: "roomNumber",
      required: false,
      editable: true,
      display_order: 5,
    },
    {
      field_name: "batchYear",
      storage_key: "batchYear",
      required: false,
      editable: false,
      display_order: 6,
    },
    {
      field_name: "classSection",
      storage_key: "classSection",
      required: false,
      editable: false,
      display_order: 7,
    },
  ];

  return (
    <TicketForm
      dbUserId={dbUser.id}
      student={normalizedStudent}
      categories={categoriesFromHierarchy as Array<{ id: number; name: string;[key: string]: unknown }>}
      subcategories={subcategoriesWithSubs}
      profileFields={standardProfileFields}
      dynamicFields={mappedCategoryFields}
      fieldOptions={[]}
      hostels={hostelsList as Array<{ id: number; name: string }>}
    />
  );
}
