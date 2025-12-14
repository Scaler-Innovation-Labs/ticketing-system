import type { ReactNode } from "react";

/**
 * Student Dashboard Layout
 * Note: Auth and role checks are handled by parent student/layout.tsx
 * This layout only provides structure - no auth calls needed!
 * 
 * OPTIMIZATION: Removed auth() call - parent layout already verified userId exists.
 * This eliminates duplicate auth() calls and improves performance.
 */
export default async function StudentDashboardLayout({
  children,
}: {
  children: ReactNode;
}) {
  // No auth() call needed - parent layout already verified userId
  // This saves ~50-100ms per request by avoiding duplicate Clerk session lookups

  return (
    <div className="pb-16 lg:pb-0 pt-16 lg:pt-0">
      <main className="min-h-screen p-4 md:p-6 lg:p-8">{children}</main>
    </div>
  );
}
