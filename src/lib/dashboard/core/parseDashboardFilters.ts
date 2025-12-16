/**
 * Parse Dashboard Filters
 * 
 * Centralized filter parsing utility.
 * Simplified - no Promise wrapping (Next.js App Router resolves searchParams).
 */

import type { DashboardFilters } from './types';

/**
 * Parse dashboard search params (simplified - no Promise wrapping)
 * Next.js App Router already resolves searchParams
 */
export function parseDashboardFilters(
  searchParams: Record<string, string | string[] | undefined>
): DashboardFilters {
  const getParam = (key: string): string => {
    const value = searchParams[key];
    if (typeof value === "string") return value;
    if (Array.isArray(value) && value.length > 0) return value[0] || "";
    return "";
  };

  return {
    search: getParam("search"),
    tat: getParam("tat"),
    status: getParam("status"),
    escalated: getParam("escalated"),
    from: getParam("from"),
    to: getParam("to"),
    user: getParam("user"),
    category: getParam("category"),
    subcategory: getParam("subcategory"),
    location: getParam("location"),
    scope: getParam("scope"),
    sort: getParam("sort") || "newest",
    page: getParam("page") || "1",
  };
}


