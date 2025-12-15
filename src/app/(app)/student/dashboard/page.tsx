import { auth } from "@clerk/nextjs/server";
import { Suspense } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertCircle } from "lucide-react";

// Data loading
import { getCachedUser } from "@/lib/cache/cached-queries";
import { getCategoriesHierarchy } from "@/lib/category/getCategoriesHierarchy";
import { getCachedTicketStatuses } from "@/lib/cache/cached-queries";
import { getStudentTickets, getTicketStats } from "@/lib/ticket/data/queries";
import { sanitizeTicket, sanitizeCategoryHierarchy } from "@/lib/ticket/formatting/serialization";

// UI Components
import { DashboardHeader } from "@/components/student/dashboard/DashboardHeader";
import { StatsCards } from "@/components/dashboard/StatsCards";
import TicketSearch from "@/components/student/TicketSearch";
import { TicketList } from "@/components/student/dashboard/TicketList";
import { TicketEmpty } from "@/components/student/dashboard/TicketEmpty";
import { PaginationControls } from "@/components/dashboard/PaginationControls";
import { ensureUser } from "@/lib/auth/api-auth";

// Force dynamic rendering since we use auth() and searchParams
export const dynamic = 'force-dynamic';

// Skeleton components for streaming
function TicketListSkeleton() {
  return (
    <div className="space-y-4">
      {[1, 2, 3, 4, 5].map((i) => (
        <Card key={i} className="border-2">
          <CardContent className="p-4 sm:p-6">
            <div className="h-24 animate-pulse bg-muted rounded-lg" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function StatsCardsSkeleton() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {[1, 2, 3, 4].map((i) => (
        <Card key={i} className="border-2">
          <CardContent className="p-4 sm:p-6">
            <div className="h-20 animate-pulse bg-muted rounded-lg" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function FilterSkeleton() {
  return (
    <Card className="border-2">
      <CardContent className="p-4 sm:p-6">
        <div className="h-20 animate-pulse bg-muted rounded-lg" />
      </CardContent>
    </Card>
  );
}

// Async component for TicketSearch to enable streaming
async function TicketSearchAsync({
  categoryList,
  ticketStatuses,
  sortBy,
}: {
  categoryList: any[];
  ticketStatuses: any[];
  sortBy: string;
}) {
  return (
    <Card className="border-2">
      <CardContent className="p-4 sm:p-6">
        <TicketSearch
          categories={categoryList.map(cat => ({
            value: cat.slug,
            label: cat.name,
            id: cat.id,
            subcategories: cat.subcategories.map((sub: any) => ({
              value: sub.slug,
              label: sub.name,
              id: sub.id
            }))
          }))}
          currentSort={sortBy}
          statuses={ticketStatuses}
        />
      </CardContent>
    </Card>
  );
}

// Critical data component - tickets list (above the fold)
async function TicketsListServer({
  userId,
  dbUser,
  params,
}: {
  userId: string;
  dbUser: { id: string };
  params: Record<string, string | string[] | undefined>;
}) {
  const getParam = (value: string | string[] | undefined) =>
    Array.isArray(value) ? value[0] ?? "" : value ?? "";

  const search = getParam(params.search);
  const statusFilter = getParam(params.status);
  const escalatedFilter = getParam(params.escalated);
  const categoryFilter = getParam(params.category);
  const subcategoryFilter = getParam(params.subcategory);
  const sortBy = getParam(params.sort) || "newest";
  const page = parseInt(getParam(params.page) || "1", 10);

  const dynamicFilters = Object.entries(params)
    .filter(([key]) => key.startsWith("f_"))
    .map(([key, value]) => ({ key, value: Array.isArray(value) ? value[0] ?? "" : value || "" }))
    .filter((f) => f.value);

  // Load tickets (limit 12 for pagination consistency)
  // FIX 1: This is in Suspense, so it doesn't block initial render
  const ticketsResult = await getStudentTickets({
    userId: dbUser.id,
    search,
    status: statusFilter,
    escalated: escalatedFilter,
    category: categoryFilter,
    subcategory: subcategoryFilter,
    dynamicFilters,
    sortBy,
    page,
    limit: 12,
  });

  const allTickets: NonNullable<ReturnType<typeof sanitizeTicket>>[] = [];
  for (const ticket of ticketsResult.tickets) {
    const sanitized = sanitizeTicket(ticket);
    if (sanitized !== null) {
      allTickets.push(sanitized);
    }
  }

  if (allTickets.length === 0) {
    return <TicketEmpty />;
  }

  return (
    <>
      <TicketList tickets={allTickets} />
      {ticketsResult.pagination.totalPages > 1 && (
        <PaginationControls
          currentPage={ticketsResult.pagination.currentPage}
          totalPages={ticketsResult.pagination.totalPages}
          hasNext={ticketsResult.pagination.hasNextPage}
          hasPrev={ticketsResult.pagination.hasPrevPage}
          totalCount={ticketsResult.pagination.totalCount}
          startIndex={ticketsResult.pagination.startIndex}
          endIndex={ticketsResult.pagination.endIndex}
        />
      )}
    </>
  );
}

// Non-critical component - stats cards
async function StatsCardsServer({ userId }: { userId: string }) {
  const dbUser = await getCachedUser(userId);
  if (!dbUser) return null;

  const stats = await getTicketStats(dbUser.id);
  
  if (stats.total === 0) return null;

  return (
    <>
      {stats.awaitingStudent > 0 && (
        <Alert className="border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800">
          <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
          <AlertTitle className="text-amber-900 dark:text-amber-100">
            Action Required: {stats.awaitingStudent} Ticket{stats.awaitingStudent !== 1 ? 's' : ''} Awaiting Your Response
          </AlertTitle>
          <AlertDescription className="text-amber-800 dark:text-amber-200 mt-1">
            You have {stats.awaitingStudent} ticket{stats.awaitingStudent !== 1 ? 's' : ''} that {stats.awaitingStudent !== 1 ? 'require' : 'requires'} your response. Please review and respond to help resolve these tickets.
          </AlertDescription>
        </Alert>
      )}
      <StatsCards stats={stats} />
    </>
  );
}

// Non-critical component - filters
async function FiltersServer({
  sortBy,
}: {
  sortBy: string;
}) {
  const [categoryListResult, ticketStatusesResult] = await Promise.all([
    getCategoriesHierarchy().catch(() => []),
    getCachedTicketStatuses().catch(() => []),
  ]);

  const categoryList = sanitizeCategoryHierarchy(
    Array.isArray(categoryListResult) ? categoryListResult : []
  );

  const ticketStatuses: Array<{
    id: number;
    value: string;
    label: string;
    description: string | null;
    progress_percent: number;
    badge_color: string | null;
    is_active: boolean;
    is_final: boolean;
    display_order: number;
  }> = [];
  if (Array.isArray(ticketStatusesResult)) {
    for (const status of ticketStatusesResult) {
      if (!status || typeof status !== 'object') continue;
      ticketStatuses.push({
        id: (status as { id?: number }).id ?? 0,
        value: (status as { value?: string }).value ?? '',
        label: (status as { label?: string }).label ?? '',
        description: (status as { description?: string | null }).description ?? null,
        progress_percent: (status as { progress_percent?: number }).progress_percent ?? 0,
        badge_color: (status as { badge_color?: string | null }).badge_color ?? null,
        is_active: (status as { is_active?: boolean }).is_active ?? true,
        is_final: (status as { is_final?: boolean }).is_final ?? false,
        display_order: (status as { display_order?: number }).display_order ?? 0,
      });
    }
  }

  return (
    <TicketSearchAsync
      categoryList={categoryList}
      ticketStatuses={ticketStatuses}
      sortBy={sortBy}
    />
  );
}

export default async function StudentDashboardPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  try {
    // FIX 1: Render immediately - don't await searchParams before auth
    // This allows the page shell to render while we fetch data
    const [resolvedParams, { userId }] = await Promise.all([
      searchParams,
      auth(),
    ]);

    if (!userId) {
      return (
        <Alert variant="destructive" className="m-6">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Authentication Error</AlertTitle>
          <AlertDescription>
            Unable to verify your identity. Please try logging in again.
          </AlertDescription>
        </Alert>
      );
    }

    // FIX 2: Move ensureUser off critical path - fire-and-forget
    // Don't block rendering on user sync
    let dbUser = await getCachedUser(userId);
    if (!dbUser) {
      // Fire-and-forget: sync user in background, don't wait
      Promise.resolve().then(() => {
        ensureUser(userId).catch((err) => {
          console.error("[StudentDashboardPage] Background user sync failed:", err);
        });
      });
      // Return early with skeleton - user will see content on next load
      return (
        <div className="space-y-4 sm:space-y-6 lg:space-y-8">
          <DashboardHeader />
          <div className="text-center py-12 text-muted-foreground">
            <p>Setting up your account...</p>
          </div>
        </div>
      );
    }

    const params = resolvedParams ?? {};
    const getParam = (value: string | string[] | undefined) =>
      Array.isArray(value) ? value[0] ?? "" : value ?? "";
    const sortBy = getParam(params.sort) || "newest";

    // FIX 1: Render page shell immediately, stream data in Suspense boundaries
    return (
      <div className="space-y-4 sm:space-y-6 lg:space-y-8">
        {/* Header - renders immediately */}
        <DashboardHeader />

        {/* Stats - non-critical, streams in */}
        <Suspense fallback={null}>
          <StatsCardsServer userId={userId} />
        </Suspense>

        {/* Filters - non-critical, streams in */}
        <Suspense fallback={<FilterSkeleton />}>
          <FiltersServer sortBy={sortBy} />
        </Suspense>

        {/* Tickets - critical, but still in Suspense for streaming */}
        <Suspense fallback={<TicketListSkeleton />}>
          <TicketsListServer userId={userId} dbUser={dbUser} params={params} />
        </Suspense>
      </div>
    );
  } catch (error) {
    console.error('[StudentDashboardPage] Error:', error);
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center space-y-4">
          <h2 className="text-2xl font-bold text-destructive">Error Loading Dashboard</h2>
          <p className="text-muted-foreground">
            There was an error loading your dashboard. Please try refreshing the page.
          </p>
        </div>
      </div>
    );
  }
}
