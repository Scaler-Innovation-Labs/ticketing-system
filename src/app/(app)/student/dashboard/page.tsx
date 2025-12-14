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

export default async function StudentDashboardPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  try {
    // OPTIMIZATION: Parallelize auth() and searchParams parsing
    const [session, resolvedParams] = await Promise.all([
      auth(),
      searchParams,
    ]);
    
    const userId = session?.userId;

    // This should never happen - layout.tsx already verified, but type safety
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

    // OPTIMIZATION: Parallelize user lookup and ensureUser if needed
    let dbUser = await getCachedUser(userId);
    if (!dbUser) {
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

    // -----------------------------
    // 2. Parse URL params (already awaited above)
    // -----------------------------
    const params = resolvedParams ?? {};
    const getParam = (value: string | string[] | undefined) =>
      Array.isArray(value) ? value[0] ?? "" : value ?? "";

    const search = getParam(params.search);
    const statusFilter = getParam(params.status);
    const escalatedFilter = getParam(params.escalated);
    const categoryFilter = getParam(params.category);
    const subcategoryFilter = getParam(params.subcategory);
    const sortBy = getParam(params.sort) || "newest";
    const page = parseInt(getParam(params.page) || "1", 10);

    // Build dynamic filters from params
    const dynamicFilters = Object.entries(params)
      .filter(([key]) => key.startsWith("f_"))
      .map(([key, value]) => ({ key, value: Array.isArray(value) ? value[0] ?? "" : value || "" }))
      .filter((f) => f.value);

    // -----------------------------
    // 3. Load critical data first (tickets and stats) - these are above the fold
    // OPTIMIZATION: Load categories and statuses in parallel but don't block rendering
    // -----------------------------
    const [ticketsResult, stats] = await Promise.all([
      getStudentTickets({
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
      }),
      getTicketStats(dbUser.id),
    ]);

    // Load filter data in parallel (non-blocking for initial render)
    const [categoryListResult, ticketStatusesResult] = await Promise.all([
      getCategoriesHierarchy().catch(() => []),
      getCachedTicketStatuses().catch(() => []),
    ]);

    // -----------------------------
    // 4. Sanitize and serialize data
    // OPTIMIZATION: Use single-pass filter + map for better performance
    // -----------------------------
    const allTickets: NonNullable<ReturnType<typeof sanitizeTicket>>[] = [];
    for (const ticket of ticketsResult.tickets) {
      const sanitized = sanitizeTicket(ticket);
      if (sanitized !== null) {
        allTickets.push(sanitized);
      }
    }

    const categoryList = sanitizeCategoryHierarchy(
      Array.isArray(categoryListResult) ? categoryListResult : []
    );

    // OPTIMIZATION: Use single-pass loop for better performance
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

    // OPTIMIZATION: Removed JSON.stringify test - it adds unnecessary overhead
    // Serialization errors will be caught during rendering if they occur

    // -----------------------------
    // 5. UI Render
    // -----------------------------
    return (
      <div className="space-y-4 sm:space-y-6 lg:space-y-8">
        {/* Header */}
        <DashboardHeader />

        {/* Alert for tickets awaiting student response */}
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

        {/* Stats */}
        {stats.total > 0 && (
          <Suspense fallback={<div className="h-32 animate-pulse bg-muted rounded-lg" />}>
            <StatsCards stats={stats} />
          </Suspense>
        )}

        {/* Search + Filters - Loaded asynchronously to not block initial render */}
        <Suspense fallback={<Card className="border-2"><CardContent className="p-4 sm:p-6"><div className="h-20 animate-pulse bg-muted rounded-lg" /></CardContent></Card>}>
          <TicketSearchAsync
            categoryList={categoryList}
            ticketStatuses={ticketStatuses}
            sortBy={sortBy}
          />
        </Suspense>

        {/* Tickets List or Empty State */}
        {allTickets.length === 0 ? (
          <TicketEmpty />
        ) : (
          <>
            <TicketList tickets={allTickets} />

            {/* Pagination */}
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
        )}
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
