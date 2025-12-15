import { auth } from "@clerk/nextjs/server";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

// Data loading
import { getCachedUser } from "@/lib/cache/cached-queries";
import { ensureUser } from "@/lib/auth/api-auth";
import { getStudentTicketViewModel } from "@/lib/ticket/data/viewModel";

// UI Components - All server components, so direct imports are optimal
// OPTIMIZATION: Removed next/dynamic - these are server components in App Router
import { TicketHeader } from "@/components/features/tickets/display/StudentTicket/TicketHeader";
import { TicketQuickInfo } from "@/components/features/tickets/display/StudentTicket/TicketQuickInfo";
import { TicketSubmittedInfo } from "@/components/features/tickets/display/StudentTicket/TicketSubmittedInfo";
import { StudentActions } from "@/components/features/tickets/actions/StudentActions";
import { TicketTimeline } from "@/components/features/tickets/display/StudentTicket/TicketTimeline";
import { TicketConversation } from "@/components/features/tickets/display/StudentTicket/TicketConversation";
import { TicketRating } from "@/components/features/tickets/display/StudentTicket/TicketRating";
import { TicketTATInfo } from "@/components/features/tickets/display/StudentTicket/TicketTATInfo";
import { TicketStudentInfo } from "@/components/features/tickets/display/StudentTicket/TicketStudentInfo";

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
// OPTIMIZATION: force-dynamic disables ISR, so revalidate is ignored - removed it
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Allow on-demand rendering for tickets not in the static params list
export const dynamicParams = true;

// Note: This page requires authentication and user-specific data, so it must be rendered dynamically
// ISR (revalidate) is not compatible with force-dynamic - removed to avoid confusion

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
  // OPTIMIZATION: Parallelize auth and params parsing
  const [{ userId }, { ticketId }] = await Promise.all([
    auth(),
    params,
  ]);
  
  if (!userId) throw new Error("Unauthorized"); // Should never happen due to layout protection

  const id = Number(ticketId);
  if (!Number.isFinite(id)) notFound();

  // Get user (ensure exists; handle Clerk external_id changes)
  // Note: This is cached, so it's fast
  // OPTIMIZATION: Handle race condition when Clerk external_id changes
  // If user not found, ensureUser() will sync/link the user, then retry fetch
  let dbUser = await getCachedUser(userId);
  if (!dbUser) {
    // Try to sync/link user (handles external_id changes)
    try {
      await ensureUser(userId);
      // Retry fetching user after sync (with a small delay to allow DB propagation)
      await new Promise(resolve => setTimeout(resolve, 100));
      dbUser = await getCachedUser(userId);
      
      // If still not found, try one more time (handles cache invalidation)
      if (!dbUser) {
        // Force cache invalidation by using a fresh query
        const { getCachedUser: freshGetUser } = await import("@/lib/cache/cached-queries");
        dbUser = await freshGetUser(userId);
      }
    } catch (err) {
      console.error('[StudentTicketPage] Failed to sync user:', err);
      // Don't throw immediately - try one more fetch in case sync succeeded but fetch failed
      dbUser = await getCachedUser(userId);
    }
  }
  
  if (!dbUser) {
    // User still not found after sync attempts - redirect to profile page
    console.error('[StudentTicketPage] User not found after sync attempts:', userId);
    redirect("/student/profile");
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
