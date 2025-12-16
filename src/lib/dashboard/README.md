# Dashboard Architecture

## Overview

Unified dashboard architecture for admin, snr-admin, and superadmin roles.

## Architecture Principles

1. **DB-Level Filtering**: All filtering happens in SQL - NO client-side filtering
2. **Role Policies**: Assignment logic isolated in role-specific policies
3. **Separated Stats**: Global stats (all tickets) vs filtered stats (current view)
4. **Strong Typing**: No `as any` casts - proper TypeScript types
5. **Pagination**: Correct pagination using DB totalCount

## Structure

```
dashboard/
├── core/                    # Core utilities (role-agnostic)
│   ├── types.ts            # Type definitions
│   ├── parseDashboardFilters.ts
│   ├── calculateFilteredStats.ts
│   ├── pagination.ts
│   └── fetchDashboardTickets.ts
│
├── policies/                # Role-specific policies
│   ├── admin.policy.ts     # 3-tier assignment logic
│   ├── snr-admin.policy.ts
│   └── superadmin.policy.ts
│
└── README.md
```

## Usage

```typescript
import { 
  parseDashboardFilters, 
  calculateFilteredStats, 
  calculatePagination,
  fetchDashboardTickets 
} from '@/lib/dashboard/core';
import { adminPolicy } from '@/lib/dashboard/policies';

// Parse filters
const filters = parseDashboardFilters(searchParams || {});

// Fetch tickets (all filtering at DB level)
const { rows, totalCount, globalStats } = await fetchDashboardTickets(
  userId,
  filters,
  20, // limit
  adminPolicy
);

// Calculate filtered stats
const filteredStats = calculateFilteredStats(rows);

// Calculate pagination
const pagination = calculatePagination(
  parseInt(filters.page || "1", 10),
  totalCount,
  20,
  rows.length
);
```

## Migration Status

- ✅ Core utilities created
- ✅ Role policies created
- ✅ Snr-admin dashboard migrated
- ✅ Superadmin dashboard migrated
- ⏳ Admin dashboard migration (in progress - complex assignment logic)

## Next Steps

1. Migrate admin dashboard to use new architecture
2. Add DB indexes for dashboard queries
3. Add query timing logs
4. Add pagination bounds checks


