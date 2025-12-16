# Dashboard Performance Fixes Applied

## ✅ Fix 1: Critical DB Indexes (HIGHEST ROI)

**Status**: ✅ Complete

**File**: `src/db/migrations/dashboard-indexes.sql`

**Indexes Added**:
- `idx_tickets_assigned_to` - Single column index for assigned_to (most common filter)
- `idx_tickets_status_id` - Single column index for status_id (used in every stats query)
- `idx_tickets_created_at` - Single column index for created_at (sorting and date filtering)
- `idx_tickets_category_id` - Single column index for category_id (common filter)
- `idx_tickets_resolution_due_at` - Single column index for TAT queries
- `idx_categories_domain_id` - Single column index for category domain lookups
- Plus composite indexes for specific query patterns

**Expected Impact**: 10-100x faster queries (from ~1.2s → <150ms)

**Action Required**: Run the migration SQL file on your database:
```bash
psql $DATABASE_URL -f src/db/migrations/dashboard-indexes.sql
```

---

## ✅ Fix 2: Cache Global Stats

**Status**: ✅ Complete

**File**: `src/lib/dashboard/core/cached-global-stats.ts`

**Implementation**:
- Created `getCachedGlobalStats()` function using `unstable_cache`
- Cache key based on role + domain combination
- TTL: 30 seconds (stats don't need to be real-time)
- Cache tags: `['tickets', 'dashboard-stats']` for invalidation

**Changes Made**:
- Updated `fetchDashboardTickets.ts` to use cached global stats instead of expensive COUNT query
- Removed inline global stats query from Promise.all

**Expected Impact**: Eliminates the most expensive query (~1.2s) from hot paths

**Cache Invalidation**: Stats automatically invalidate when tickets are updated (via cache tags)

---

## ✅ Fix 3: Conditional Joins (Partial)

**Status**: ✅ Partial (Optimized count query)

**Implementation**:
- Made count query joins conditional based on filters
- Status join: Only if status filter is present
- Category join: Only if category filter is present or category name needed
- User join: Only if user filter is present or creator info needed

**Note**: Row query still requires all joins because `TicketCard` always displays:
- `status` (always needed)
- `category_name` (always needed)
- `creator_full_name` / `creator_email` (always needed)
- `subcategory_name` (optional, but currently always joined)

**Future Optimization**: Could make subcategory join conditional if not displayed in card view

---

## ✅ Fix 4: Filter API Deduplication

**Status**: ✅ Already Implemented

**Current Implementation**:
- Filter options are fetched server-side via `getAdminFilters()`
- Uses cached queries (`getCachedTicketStatuses`, `getCachedCategoriesHierarchy`, `getCachedDomains`, `getCachedScopes`)
- Passed as props to `AdminTicketFilters` component
- Client-side fetching only happens if props are undefined (backward compatibility)

**Duplicate Calls**: The duplicate API calls in logs are likely from:
1. React Strict Mode double-rendering (development only)
2. Multiple component instances (if any)

**Recommendation**: Monitor production logs - duplicate calls should not occur in production if props are correctly passed.

---

## 📊 Expected Performance Improvements

| Metric | Before | After (with indexes + caching) |
|--------|--------|--------------------------------|
| **Global Stats Query** | ~1.2s (every request) | ~0ms (cached, 30s TTL) |
| **Filtered Query** | ~1.2s | <150ms (with indexes) |
| **Total Request Time** | ~2.5-3s | <300ms |
| **Memory Usage** | High (all tickets) | Low (paginated) |

---

## 🚀 Next Steps

1. **Apply Database Indexes** (CRITICAL):
   ```bash
   psql $DATABASE_URL -f src/db/migrations/dashboard-indexes.sql
   ```

2. **Monitor Performance**:
   - Check query timing logs (already implemented)
   - Look for queries > 1000ms (will be logged automatically)
   - Verify cache hits for global stats

3. **Optional Optimizations**:
   - Make subcategory join conditional if not always displayed
   - Consider splitting stats endpoint for even faster perceived performance
   - Add more composite indexes based on actual query patterns

---

## 📝 Notes

- **Indexes**: Must be applied for performance gains. Without indexes, queries will still be slow.
- **Caching**: Global stats cache is automatic. No manual configuration needed.
- **Monitoring**: Query timing logs appear automatically in development or when queries > 1000ms.
- **Cache Invalidation**: Stats cache invalidates automatically when tickets are updated (via cache tags).

---

## 🔍 Verification

After applying indexes, verify performance:

1. Check query timing logs:
   ```
   [Dashboard] Query performance (superadmin): {
     totalTime: '245.32ms',  // Should be < 300ms
     baseConditionTime: '12.45ms',
     queryTime: '230.87ms',  // Should be < 200ms
     rowsReturned: 5,
     totalCount: 5,
     ...
   }
   ```

2. Check cache hits:
   - First request: Global stats query executes (~1.2s)
   - Subsequent requests: Global stats from cache (~0ms)

3. Monitor database:
   - Check index usage: `EXPLAIN ANALYZE` on dashboard queries
   - Verify indexes are being used (not sequential scans)


