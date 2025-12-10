import { db, committees, users } from "@/db";
import { eq } from "drizzle-orm";
import { CommitteesManagement } from "@/components/admin/committees";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";

// Use ISR - revalidate every 5 minutes (committees change infrequently)
export const revalidate = 300;

interface CommitteeMember {
  id: number;
  committee_id: number;
  clerk_user_id: string;
  role: string | null;
  user?: {
    firstName: string | null;
    lastName: string | null;
    emailAddresses: Array<{ emailAddress: string }>;
  };
}

async function getCommitteeMembers(committeeId: number): Promise<CommitteeMember[]> {
  const [committee] = await db
    .select({
      id: committees.id,
      name: committees.name,
      head_id: committees.head_id,
      contact_email: committees.contact_email,
    })
    .from(committees)
    .where(eq(committees.id, committeeId))
    .limit(1);

  if (!committee) return [];

  // Prefer explicit head_id; otherwise fall back to contact_email to infer head
  let member =
    committee.head_id
      ? await db
          .select({
            id: users.id,
            auth_provider: users.auth_provider,
            external_id: users.external_id,
            full_name: users.full_name,
            email: users.email,
          })
          .from(users)
          .where(eq(users.id, committee.head_id))
          .limit(1)
          .then((rows) => rows[0])
      : null;

  if (!member && committee.contact_email) {
    member = await db
      .select({
        id: users.id,
        auth_provider: users.auth_provider,
        external_id: users.external_id,
        full_name: users.full_name,
        email: users.email,
      })
      .from(users)
      .where(eq(users.email, committee.contact_email))
      .limit(1)
      .then((rows) => rows[0]);
  }

  // If still no member, create a fallback member using contact_email so the head is visible
  if (!member && committee.contact_email) {
    const email = committee.contact_email;
    const emailLocal = email.split("@")[0] || "";
    const [firstNameFromEmail, ...restFromEmail] = emailLocal.split(".").filter(Boolean);
    return [{
      id: 0,
      committee_id: committee.id,
      clerk_user_id: email, // use email as identifier for fallback
      role: "head",
      user: {
        firstName: firstNameFromEmail || null,
        lastName: restFromEmail.length > 0 ? restFromEmail.join(" ") : null,
        emailAddresses: [{ emailAddress: email }],
      },
    }];
  }

  if (!member) return [];

  const [firstName, ...restNameParts] = (member.full_name || "").split(" ").filter(Boolean);
  const lastName = restNameParts.length > 0 ? restNameParts.join(" ") : null;

  return [{
    id: 0,
    committee_id: committee.id,
    clerk_user_id: member.external_id || member.email || committee.contact_email || "",
    role: "head",
    user: {
      firstName: firstName || null,
      lastName,
      emailAddresses: member.email
        ? [{ emailAddress: member.email }]
        : committee.contact_email
          ? [{ emailAddress: committee.contact_email }]
          : [],
    },
  }];
}

export default async function SnrAdminCommitteesPage() {
  // Fetch all committees from database
  const allCommittees = await db
    .select({
      id: committees.id,
      name: committees.name,
      description: committees.description,
      contact_email: committees.contact_email,
      is_active: committees.is_active,
      created_at: committees.created_at,
      updated_at: committees.updated_at,
    })
    .from(committees)
    .orderBy(committees.name);

  // Split active vs archived (soft-deleted)
  const activeCommittees = allCommittees.filter((c) => c.is_active !== false);
  const archivedCommittees = allCommittees.filter((c) => c.is_active === false);

  // Fetch members for each committee
  const membersMap: Record<number, Awaited<ReturnType<typeof getCommitteeMembers>>> = {};
  await Promise.all(
    activeCommittees.map(async (committee) => {
      const members = await getCommitteeMembers(committee.id);
      membersMap[committee.id] = members;
    })
  );

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-bold tracking-tight mb-2 bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent">
            Committee Management
          </h1>
          <p className="text-muted-foreground">
            Manage committees and assign members to committees
          </p>
        </div>
        <Button variant="outline" asChild>
          <Link href="/snr-admin/dashboard">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Dashboard
          </Link>
        </Button>
      </div>

      <CommitteesManagement
        initialCommittees={activeCommittees}
        initialArchivedCommittees={archivedCommittees}
        initialMembers={membersMap}
        basePath="/snr-admin/dashboard"
      />
    </div>
  );
}
