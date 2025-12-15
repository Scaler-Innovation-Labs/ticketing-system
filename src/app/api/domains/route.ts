/**
 * Domains & Scopes Dropdown API
 * 
 * GET - List all active domains and scopes for dropdowns
 */

import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/helpers';
import { db } from '@/db';
import { domains, scopes } from '@/db';
import { eq, asc } from 'drizzle-orm';
import { logger } from '@/lib/logger';

/**
 * GET /api/domains
 * List all active domains and scopes
 */
export async function GET() {
  try {
    await requireAuth();
    // Fetch all active domains
    const allDomains = await db
      .select({
        id: domains.id,
        name: domains.name,
        description: domains.description,
        is_active: domains.is_active,
      })
      .from(domains)
      .where(eq(domains.is_active, true))
      .orderBy(asc(domains.id));

    // Fetch all active scopes
    const allScopes = await db
      .select({
        id: scopes.id,
        name: scopes.name,
        domain_id: scopes.domain_id,
        is_active: scopes.is_active,
      })
      .from(scopes)
      .where(eq(scopes.is_active, true))
      .orderBy(asc(scopes.id));

    return NextResponse.json({
      success: true,
      domains: allDomains,
      scopes: allScopes,
    });
  } catch (error: any) {
    if (error instanceof Error && (error.message.includes('Unauthorized') || error.message.includes('Authentication required'))) {
      logger.warn({ path: '/api/domains' }, 'Unauthorized API access attempt');
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }
    logger.error({ error: error.message }, 'Failed to fetch domains');
    return NextResponse.json(
      { error: 'Failed to fetch domains' },
      { status: 500 }
    );
  }
}
