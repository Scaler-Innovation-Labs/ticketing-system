# Dashboard Architecture - Final Implementation

## 🎯 Architecture Overview

Unified dashboard architecture with clear separation of concerns:

```
┌─────────────────────────────────────────────────────────┐
│                    Page Components                      │
│  (Suspense, UX, View Toggles, Parallel Fetching)      │
└────────────────────┬────────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────────┐
│                  Role Policies                          │
│  (Assignment Logic, Visibility Scope, Base Conditions) │
└────────────────────┬────────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────────┐
│                   Core Utilities                       │
│  (DB Filtering, Pagination, Stats, Types)              │
└─────────────────────────────────────────────────────────┘
```

## 📁 File Structure

```
src/lib/dashboard/
├── core/                          # Role-agnostic utilities
│   ├── types.ts                  # Type definitions
│   ├── parseDashboardFilters.ts  # Filter parsing
│   ├── calculateFilteredStats.ts # Stats calculation
│   ├── pagination.ts             # Pagination utilities
│   ├── fetchDashboardTickets.ts  # Core fetch function
│   └── index.ts                  # Public API
│
├── policies/                      # Role-specific logic
│   ├── admin.policy.ts           # 3-tier assignment logic
│   ├── snr-admin.policy.ts       # Snr-admin visibility
│   ├── superadmin.policy.ts      # Superadmin visibility
│   └── index.ts                  # Public API
│
├── README.md                      # Overview
├── ARCHITECTURE.md               # This file
└── MIGRATION_STATUS.md           # Migration progress
```

## 🔑 Key Principles

### 1. DB-Level Filtering (MANDATORY)
- ✅ All filtering happens in SQL WHERE clause
- ✅ NO client-side filtering of tickets
- ✅ Pagination uses DB totalCount

### 2. Separated Stats (CRITICAL)
- ✅ `globalStats` - All tickets user can see (for header/dashboard overview)
- ✅ `filteredStats` - Current filtered view (for stats cards)

### 3. Role Policies (ISOLATION)
- ✅ Assignment logic isolated in policies
- ✅ Core utilities stay role-agnostic
- ✅ Easy to add new roles

### 4. Strong Typing (SAFETY)
- ✅ Proper TypeScript types
- ✅ No `as any` casts
- ✅ Type guards for nullable fields

### 5. Simplified searchParams (CLARITY)
- ✅ No Promise wrapping (Next.js resolves it)
- ✅ Centralized parsing utility
- ✅ Consistent across all dashboards

## 📊 Data Flow

```
Page Component
    ↓
Parse Filters (parseDashboardFilters)
    ↓
Fetch Tickets (fetchDashboardTickets + Role Policy)
    ├─→ Build Base Condition (Role Policy)
    ├─→ Apply Filters (Core)
    ├─→ Fetch Global Stats (Core)
    ├─→ Fetch Filtered Count (Core)
    └─→ Fetch Paginated Rows (Core)
    ↓
Calculate Filtered Stats (calculateFilteredStats)
    ↓
Calculate Pagination (calculatePagination)
    ↓
Render UI
```

## 🚀 Usage Example

```typescript
import { 
  parseDashboardFilters, 
  calculateFilteredStats, 
  calculatePagination,
  fetchDashboardTickets 
} from '@/lib/dashboard/core';
import { snrAdminPolicy } from '@/lib/dashboard/policies';

export default async function DashboardPage({ 
  searchParams 
}: { 
  searchParams?: Record<string, string | string[] | undefined>
}) {
  const { userId } = await auth();
  
  // 1. Parse filters
  const filters = parseDashboardFilters(searchParams || {});
  
  // 2. Fetch tickets (all filtering at DB level)
  const { rows, totalCount, globalStats } = await fetchDashboardTickets(
    userId,
    filters,
    20, // limit
    snrAdminPolicy
  );
  
  // 3. Calculate filtered stats
  const filteredStats = calculateFilteredStats(rows);
  
  // 4. Calculate pagination
  const pagination = calculatePagination(
    parseInt(filters.page || "1", 10),
    totalCount,
    20,
    rows.length
  );
  
  // 5. Render UI
  return (
    <div>
      <StatsCards stats={filteredStats} />
      <TicketList tickets={rows} pagination={pagination} />
    </div>
  );
}
```

## ✅ Completed Migrations

- ✅ Snr-Admin Dashboard
- ✅ Superadmin Dashboard

## ⏳ Pending Migrations

- ⏳ Admin Dashboard (complex assignment logic)

## 🔧 Role Policy Interface

```typescript
interface RolePolicy {
  roleName: 'admin' | 'snr-admin' | 'superadmin';
  
  getAllowedFilters(): string[];
  
  buildBaseCondition(
    dbUser: { id: string; roleName: string | null; primary_domain_id: number | null } | null,
    context?: any
  ): Promise<any> | any;
}
```

## 📈 Performance Benefits

| Metric | Before | After |
|--------|--------|-------|
| DB Queries | 1 (fetch all) | 1 (filtered + paginated) |
| Memory Usage | High | Low (paginated) |
| Filtering | Client-side | DB-level |
| Pagination | ❌ None | ✅ Correct |
| Stats | ❌ Filtered only | ✅ Global + Filtered |

## 🎓 Best Practices

1. **Always use role policies** - Don't hardcode assignment logic
2. **Filter at DB level** - Never filter tickets client-side
3. **Separate stats** - Show both global and filtered stats
4. **Use proper types** - No `as any` casts
5. **Keep policies simple** - Complex logic belongs in core utilities


