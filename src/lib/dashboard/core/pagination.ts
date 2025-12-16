/**
 * Pagination Utilities
 * 
 * Centralized pagination calculation with bounds checking.
 */

import type { PaginationInfo } from './types';

/**
 * Calculate pagination metadata
 * 
 * @param page - Current page number (1-indexed)
 * @param totalCount - Total number of items matching filters (from DB)
 * @param limit - Items per page
 * @param actualRowCount - Actual number of rows returned (may be less than limit on last page)
 */
export function calculatePagination(
  page: number,
  totalCount: number,
  limit: number,
  actualRowCount: number
): PaginationInfo {
  // Ensure page is valid
  const validPage = Math.max(1, page);
  
  // Calculate total pages
  const totalPages = Math.max(1, Math.ceil(totalCount / limit));
  
  // Ensure page doesn't exceed total pages
  const clampedPage = Math.min(validPage, totalPages);
  
  // Calculate offset
  const offsetValue = (clampedPage - 1) * limit;

  return {
    page: clampedPage,
    totalPages,
    hasNextPage: clampedPage < totalPages && actualRowCount === limit,
    hasPrevPage: clampedPage > 1,
    totalCount,
    startIndex: actualRowCount > 0 ? offsetValue + 1 : 0,
    endIndex: actualRowCount > 0 ? offsetValue + actualRowCount : 0,
    limit,
  };
}

/**
 * Validate pagination parameters with bounds checking
 * 
 * @param page - Page number from query params (string or number)
 * @param limit - Items per page (default: 20, max: 100)
 * @returns Validated page and limit
 */
export function validatePaginationParams(
  page: string | number | undefined,
  limit: number = 20
): { page: number; limit: number } {
  // Parse page
  let parsedPage: number;
  if (typeof page === "number") {
    parsedPage = page;
  } else if (typeof page === "string") {
    parsedPage = parseInt(page, 10);
  } else {
    parsedPage = 1;
  }
  
  // Validate page bounds
  const validPage = Math.max(1, Math.min(parsedPage, 10000)); // Cap at 10,000 pages
  const validLimit = Math.max(1, Math.min(limit, 100)); // Cap at 100 per page
  
  return {
    page: validPage,
    limit: validLimit,
  };
}

/**
 * Validate pagination bounds and return safe values
 * Handles edge cases like negative pages, zero limits, etc.
 */
export function validatePaginationBounds(
  page: number,
  totalCount: number,
  limit: number
): { page: number; limit: number; offset: number } {
  // Validate inputs
  const validLimit = Math.max(1, Math.min(limit, 100));
  const validPage = Math.max(1, page);
  
  // Calculate total pages
  const totalPages = Math.max(1, Math.ceil(totalCount / validLimit));
  
  // Clamp page to valid range
  const clampedPage = Math.min(validPage, totalPages);
  
  // Calculate offset
  const offset = Math.max(0, (clampedPage - 1) * validLimit);
  
  return {
    page: clampedPage,
    limit: validLimit,
    offset,
  };
}

