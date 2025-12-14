/**
 * Middleware Configuration
 * 
 * Handles authentication and route protection using Clerk.
 * - Public routes (health check, webhooks)
 * - Protected routes (API, app pages)
 * - Role-based access control
 */

import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';

// Define public routes (no auth required)
const isPublicRoute = createRouteMatcher([
  '/',
  '/sign-in(.*)',
  '/sign-up(.*)',
  '/api/health',
  '/api/webhooks/(.*)',
]);

// Define cron routes (require CRON_SECRET)
const isCronRoute = createRouteMatcher([
  '/api/cron/(.*)',
]);

export default clerkMiddleware(async (auth, req) => {
  // Allow public routes
  if (isPublicRoute(req)) {
    return NextResponse.next();
  }

  // Verify cron secret for cron routes
  if (isCronRoute(req)) {
    // OPTIMIZATION: Check for CRON_SECRET existence first to prevent silent failures
    if (!process.env.CRON_SECRET) {
      return NextResponse.json(
        { error: 'Server misconfigured: CRON_SECRET not set' },
        { status: 500 }
      );
    }
    
    const authHeader = req.headers.get('authorization');
    const expectedAuth = `Bearer ${process.env.CRON_SECRET}`;
    
    if (authHeader !== expectedAuth) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }
    
    return NextResponse.next();
  }

  // For API routes, let them through - they'll handle auth themselves
  // This prevents CORS errors from redirects and allows API routes to return proper 401 JSON
  const isApiRoute = req.nextUrl.pathname.startsWith('/api/');
  
  if (isApiRoute) {
    // Let API routes handle their own authentication
    // They can return proper 401 JSON responses without CORS issues
    return NextResponse.next();
  }

  // For page routes, use protect() which redirects to sign-in
  await auth.protect();

  return NextResponse.next();
});

export const config = {
  matcher: [
    // Skip Next.js internals and static files
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    // Always run for API routes
    '/(api|trpc)(.*)',
  ],
};
