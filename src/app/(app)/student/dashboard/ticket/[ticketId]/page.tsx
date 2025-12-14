import { auth } from "@clerk/nextjs/server";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import nextDynamic from "next/dynamic";
import { db, tickets } from "@/db";
import { desc } from "drizzle-orm";

// Data loading
import { getCachedUser } from "@/lib/cache/cached-queries";
import { ensureUser } from "@/lib/auth/api-auth";
import { getStudentTicketViewModel } from "@/lib/ticket/data/viewModel";

// UI Components - Static imports for above-the-fold content
import { TicketHeader } from "@/components/features/tickets/display/StudentTicket/TicketHeader";
import { TicketQuickInfo } from "@/components/features/tickets/display/StudentTicket/TicketQuickInfo";
import { TicketSubmittedInfo } from "@/components/features/tickets/display/StudentTicket/TicketSubmittedInfo";
import { StudentActions } from "@/components/features/tickets/actions/StudentActions";

// Lazy-load only heavy, below-the-fold sections using dynamic imports
const TicketTimeline = nextDynamic(() =>
  import("@/components/features/tickets/display/StudentTicket/TicketTimeline").then(
    (mod) => mod.TicketTimeline
  ),
  { ssr: true }
);

const TicketConversation = nextDynamic(() =>
  import("@/components/features/tickets/display/StudentTicket/TicketConversation").then(
    (mod) => mod.TicketConversation
  ),
  { ssr: true }
);

const TicketRating = nextDynamic(() =>
  import("@/components/features/tickets/display/StudentTicket/TicketRating").then(
    (mod) => mod.TicketRating
  ),
  { ssr: true }
);

const TicketTATInfo = nextDynamic(() =>
  import("@/components/features/tickets/display/StudentTicket/TicketTATInfo").then(
    (mod) => mod.TicketTATInfo
  ),
  { ssr: true }
);

const TicketStudentInfo = nextDynamic(() =>
  import("@/components/features/tickets/display/StudentTicket/TicketStudentInfo").then(
    (mod) => mod.TicketStudentInfo
  ),
  { ssr: true }
);

// Loading skeletons for Suspense boundaries
function TimelineSkeleton() {
  return (
    <Card className="border-2">
      <CardContent className="p-6">
        <Skeleton className="h-6 w-32 mb-4" />
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function ConversationSkeleton() {
  return (
    <Card className="border-2 shadow-md">
      <CardContent className="p-6">
        <Skeleton className="h-6 w-32 mb-4" />
        <div className="space-y-4">
          {[1, 2].map((i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// Mark as dynamic since we use auth() and user-specific data
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Allow on-demand rendering for tickets not in the static params list
export const dynamicParams = true;

// ISR: Revalidate every 10 seconds for faster subsequent loads
export const revalidate = 10;

// Note: generateStaticParams removed since we're using force-dynamic
// This page requires authentication and user-specific data, so it must be rendered dynamically

/**
 * Student Ticket Detail Page
 * 
 * Pure UI + Data Loading
 * All business logic is handled by getStudentTicketViewModel()
 * 
 * Note: Auth is handled by student/layout.tsx
 */
export default async function StudentTicketPage({
  params,
}: {
  params: Promise<{ ticketId: string }>;
}) {
  const { userId } = await auth();
  if (!userId) throw new Error("Unauthorized"); // Should never happen due to layout protection

  const { ticketId } = await params;
  const id = Number(ticketId);
  if (!Number.isFinite(id)) notFound();

  // Get user (ensure exists; handle Clerk external_id changes)
  // Note: This is cached, so it's fast
  let dbUser = await getCachedUser(userId);
  if (!dbUser) {
    // Try to create/link user and retry once
    try {
      await ensureUser(userId);
      dbUser = await getCachedUser(userId);
    } catch (err) {
      // ignore, will handle below
    }
  }
  if (!dbUser) {
    throw new Error("User not found in database");
  }

  // Load view model (handles all business logic)
  // OPTIMIZATION: getStudentTicketViewModel now parallelizes all internal queries
  // (ticket, activities, attachments are fetched in parallel)
  let vm;
  try {
    vm = await getStudentTicketViewModel(id, dbUser.id);
  } catch (error) {
    console.error("Error loading student ticket view model:", error);
    throw error;
  }

  if (!vm) {
    notFound();
  }

  // Render UI with view model
  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/20">
      <div className="max-w-6xl mx-auto px-3 py-4 sm:px-4 sm:py-6 md:px-6 md:py-8 space-y-3 sm:space-y-4 md:space-y-6">
        <TicketHeader
          ticketId={vm.ticket.id}
          status={vm.statusDisplay}
          category={vm.category}
          subcategory={vm.subcategory}
        />

        <Card className="border-2 shadow-xl bg-card/50 backdrop-blur-sm">
          <CardContent className="space-y-4 sm:space-y-6 p-4 sm:p-6">
            <TicketQuickInfo
              ticketProgress={vm.ticketProgress}
              normalizedStatus={vm.normalizedStatus}
              assignedStaff={vm.assignedStaff}
              tatInfo={vm.tatInfo}
              ticket={vm.ticket}
            />

            <TicketSubmittedInfo
              description={vm.ticket.description}
              location={vm.ticket.location}
              images={vm.images.map(img => img.url)}
              dynamicFields={vm.normalizedDynamicFields}
            />

            <Suspense fallback={<TimelineSkeleton />}>
              <TicketTimeline entries={vm.timelineEntries} />
            </Suspense>

            <Suspense fallback={<ConversationSkeleton />}>
              <TicketConversation
                comments={vm.normalizedComments}
                ticketId={vm.ticket.id}
                status={vm.statusDisplay}
                normalizedStatus={vm.normalizedStatus}
                optimisticComments={[]}
              />
            </Suspense>

            {vm.normalizedStatus === "resolved" && (
              <Suspense fallback={<Skeleton className="h-32 w-full" />}>
                <TicketRating
                  ticketId={vm.ticket.id}
                  currentRating={vm.ticket.rating ? String(vm.ticket.rating) : undefined}
                />
              </Suspense>
            )}

            <StudentActions
              ticketId={vm.ticket.id}
              currentStatus={vm.statusDisplay?.value || "open"}
            />

            <Suspense fallback={<Skeleton className="h-24 w-full" />}>
              <TicketTATInfo tatInfo={vm.tatInfo} />
            </Suspense>

            {(vm.ticket.escalation_level ?? 0) > 0 && (
              <Card className="border-2 bg-muted/30">
                <CardContent className="p-3 sm:p-4">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      Escalation Level
                    </span>
                    <span className="text-sm font-semibold">{vm.ticket.escalation_level}</span>
                  </div>
                </CardContent>
              </Card>
            )}

            <Suspense fallback={<Skeleton className="h-32 w-full" />}>
              <TicketStudentInfo profileFields={vm.resolvedProfileFields} />
            </Suspense>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
