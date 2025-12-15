/**
 * Admin Filters Data
 * 
 * Server-side function to fetch all filter options for admin dashboard.
 * Fetches in parallel and uses cached queries for optimal performance.
 * 
 * This replaces client-side API calls with server-side data fetching.
 */

import { getCachedTicketStatuses, getCachedCategoriesHierarchy, getCachedDomains } from '@/lib/cache/cached-queries';
import { db, subcategories } from '@/db';
import { eq, and, inArray } from 'drizzle-orm';

export interface AdminFilterStatus {
  id: number;
  value: string;
  label: string;
  color?: string | null;
  progress_percent?: number | null;
}

export interface AdminFilterCategory {
  id: number;
  name: string;
  slug?: string | null;
  icon?: string | null;
  color?: string | null;
  subcategories: Array<{
    id: number;
    name: string;
    slug?: string | null;
    category_id: number;
  }>;
}

export interface AdminFilterDomain {
  id: number;
  name: string;
  slug?: string | null;
  description?: string | null;
}

export interface AdminFilters {
  statuses: AdminFilterStatus[];
  categories: AdminFilterCategory[];
  domains: AdminFilterDomain[];
}

/**
 * Get all admin filter options (server-side, cached, parallel)
 * 
 * This function fetches all filter data in parallel using cached queries.
 * It should be called server-side only and passed as props to client components.
 */
export async function getAdminFilters(): Promise<AdminFilters> {
  // Fetch all filters in parallel (all use cached queries)
  const [statusesData, categoriesData, domainsData] = await Promise.all([
    getCachedTicketStatuses(),
    getCachedCategoriesHierarchy(),
    getCachedDomains(),
  ]);

  // Transform statuses to match expected format
  const statuses: AdminFilterStatus[] = statusesData.map(s => ({
    id: s.id,
    value: s.value,
    label: s.label || s.value,
    color: s.color || null,
    progress_percent: s.progress_percent || null,
  }));

  // Transform categories to include subcategories
  // getCachedCategoriesHierarchy already includes subcategories in the nested structure
  const categories: AdminFilterCategory[] = categoriesData.map(cat => ({
    id: cat.id,
    name: cat.name,
    slug: cat.slug || null,
    icon: cat.icon || null,
    color: cat.color || null,
    subcategories: (cat.subcategories || []).map(sub => ({
      id: sub.id,
      name: sub.name,
      slug: sub.slug || null,
      category_id: sub.category_id,
    })),
  }));

  // Transform domains to match expected format
  const domains: AdminFilterDomain[] = domainsData.map(d => ({
    id: d.id,
    name: d.name,
    slug: d.slug || null,
    description: d.description || null,
  }));

  return {
    statuses,
    categories,
    domains,
  };
}

