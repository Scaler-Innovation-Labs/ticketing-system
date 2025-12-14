import { Suspense } from "react";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { getCachedUserRole } from "@/lib/cache/cached-queries";
import { RoleNav } from "@/components/nav/RoleNav";
import { NavLoadingShimmer } from "@/components/nav/NavLoadingShimmer";

/**
 * Student Role Root Layout
 * Handles navigation and role-based routing for all student routes
 * 
 * OPTIMIZATION: This layout is LIGHTWEIGHT - no expensive DB operations
 * - Middleware already verified authentication
 * - Only checks role (cached with React cache + in-memory cache) and redirects if needed
 * - ensureUser() is moved to pages (first hit only)
 * 
 * NOTE: Layouts run on EVERY navigation, so keep this fast!
 */
export default async function StudentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // OPTIMIZATION: Middleware already called auth.protect(), so userId is guaranteed
  // auth() here is just reading cached session (fast, no verification overhead)
  const { userId } = await auth();

  // If userId is somehow null, the middleware should have prevented access
  // Don't throw - just return children and let nested layout/page handle it
  if (!userId) {
    return (
      <>
        <Suspense fallback={<NavLoadingShimmer />}>
          <RoleNav role="student" />
        </Suspense>
        {children}
      </>
    );
  }

  // OPTIMIZATION: getCachedUserRole uses React cache() for request-level deduplication
  // This is the ONLY DB operation in layout - everything else moved to pages
  // Returns 'student' by default if user not found (safe fallback)
  let role: string = "student";
  try {
    role = await getCachedUserRole(userId);
  } catch (error) {
    console.error("[Student Layout] Failed to get role:", error);
    // Default to student - don't redirect
    role = "student";
  }

  // Only redirect if role is explicitly set to non-student AND we successfully got it
  // This prevents redirect loops when DB queries fail
  if (role && role !== "student") {
    if (role === "committee") {
      redirect("/committee/dashboard");
    } else if (role === "admin") {
      redirect("/admin/dashboard");
    } else if (role === "snr_admin") {
      redirect("/snr-admin/dashboard");
    } else if (role === "super_admin") {
      redirect("/superadmin/dashboard");
    }
  }

  return (
    <>
      <Suspense fallback={<NavLoadingShimmer />}>
        <RoleNav role="student" />
      </Suspense>
      {children}
    </>
  );
}

