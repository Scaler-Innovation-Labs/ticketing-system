# Escalation Rules Documentation

## Overview

Escalation rules automatically reassign tickets to higher-level staff when tickets exceed their SLA deadlines or meet specific quality thresholds. The system escalates tickets based on four triggers:

1. **Missing Resolution**: When a ticket is not resolved within its full SLA time
2. **TAT Extension Limit**: When a ticket's TAT is extended for the 3rd time
3. **Repeated Reopening**: When a student reopens a ticket for the 3rd time
4. **Negative Feedback**: When a student rates a resolved ticket 1 or 2 stars

## How Escalation Works

### Escalation Triggers

1. **Resolution Deadline Escalation (SLA Breach)**
   - **Trigger**: When `resolution_due_at < now` and status is not `resolved`/`closed`
   - **Reason**: Commitment to the student has been broken
   - **Action**: Escalate to next level
   - **Exclusions**: Tickets in "awaiting_student_response" status (TAT is paused)

2. **TAT Extension Limit**
   - **Trigger**: Admin requests a TAT extension for the **3rd, 5th, or 7th time** (`tat_extensions` in [3, 5, 7])
   - **Reason**: Repeated delays indicate the issue is complex or being ignored
   - **Action**: Escalate to next level immediately

3. **Repeated Reopening**
   - **Trigger**: Student reopens the ticket for the **3rd time** (`reopen_count === 3`)
   - **Reason**: The solution provided is clearly not satisfying the student or the fix is temporary
   - **Action**: Escalate to next level (needs oversight)

4. **Negative Feedback (Low Rating)**
   - **Trigger**: Student rates a resolved ticket **1 or 2 stars** (`rating <= 2`)
   - **Reason**: Quality control. A resolved ticket with a bad rating is a failure
   - **Action**: Escalate to next level for review

### Escalation Process

1. When a ticket becomes overdue, the system:
   - Increments the ticket's `escalation_level` (0 → 1 → 2 → 3, etc.)
   - **Adds 48 business hours** to both `acknowledgement_due_at` and `resolution_due_at` (excluding weekends)
   - Finds the matching escalation rule for:
     - Current escalation level + 1
     - Ticket's category domain
     - Ticket's scope (if any)
   - Reassigns the ticket to the user specified in the rule
   - Stores the previous assignee in `metadata.previous_assigned_to`
   - Logs the escalation activity with reason

2. If no matching rule is found:
   - The escalation level is still incremented
   - **48 business hours are still added** to the TAT deadlines
   - The ticket remains assigned to the current user
   - An activity is logged indicating no matching rule was found

### TAT Extension on Escalation

When a ticket is escalated, **48 business hours are automatically added** to both:
- `acknowledgement_due_at` (if it exists)
- `resolution_due_at` (if it exists)

This gives the newly assigned staff member additional time to handle the escalated ticket. The 48 hours are calculated using business hours (excluding weekends).

### Business Hours

- **Weekends are excluded**: Saturday and Sunday are not counted in SLA calculations
- **24-hour weekdays**: Monday-Friday count as full 24-hour days
- **Escalation cron job**: Runs every 30 minutes (configured in `vercel.json`)

## Escalation Rule Structure

Each escalation rule contains:

```typescript
{
  id: number;                    // Unique identifier
  domain_id: number | null;      // Category domain (null = global)
  scope_id: number | null;       // Optional scope filter (null = all scopes)
  level: number;                 // Escalation level (1, 2, 3, etc.)
  escalate_to_user_id: string;   // User UUID to escalate to
  tat_hours: number;             // Hours before next escalation (if applicable)
  notify_channel: string | null; // Notification method (slack, email, etc.)
  is_active: boolean;            // Whether the rule is active
  created_at: Date;
  updated_at: Date;
}
```

## Rule Matching Logic

When a ticket needs to be escalated, the system finds the matching rule using this priority:

1. **Domain Match**: Rule's `domain_id` must match ticket's category domain (or be null for global)
2. **Scope Match**: Rule's `scope_id` must match ticket's scope (or be null for all scopes)
3. **Level Match**: Rule's `level` must equal `current_escalation_level + 1`
4. **Active**: Rule must have `is_active = true`

The system selects the first matching rule ordered by level (ascending).

## API Endpoints

### List Escalation Rules

**GET** `/api/escalation-rules`

**Query Parameters:**
- `domain_id` (optional): Filter by domain ID
- `scope_id` (optional): Filter by scope ID

**Response:**
```json
{
  "rules": [
    {
      "id": 1,
      "domain_id": 19,
      "scope_id": null,
      "level": 1,
      "user_id": "0785b58a-3653-48e1-a9ab-8e5d9dd5dff3",
      "tat_hours": 48,
      "notify_channel": "slack",
      "created_at": "2025-12-10T00:00:00Z",
      "domain": {
        "id": 19,
        "name": "Hostel"
      },
      "scope": null,
      "user": {
        "id": "0785b58a-3653-48e1-a9ab-8e5d9dd5dff3",
        "full_name": "John Doe",
        "email": "john@example.com"
      }
    }
  ]
}
```

**Authentication:** Requires `admin` or `super_admin` role

### Create Escalation Rule

**POST** `/api/escalation-rules`

**Request Body:**
```json
{
  "domain_id": 19,                    // or null for global
  "scope_id": 4,                      // or null for all scopes
  "level": 1,
  "escalate_to_user_id": "uuid-here",
  "tat_hours": 48,
  "notify_channel": "slack"           // or "email" or null
}
```

**Authentication:** Requires `super_admin` role

## Escalation Activity Log

When a ticket is escalated, an activity is logged with:

```json
{
  "action": "escalated",
  "details": {
    "reason": "Not acknowledged within SLA" | "Not resolved within SLA",
    "escalation_level": 1,
    "previous_level": 0,
    "escalated_to_user_id": "uuid",
    "rule_id": 1,
    "due_at": "2025-12-10T22:57:13.063Z"
  },
  "visibility": "admin_only"
}
```

The escalation reason is displayed in the ticket timeline.

## Escalation Service Functions

### `escalateUnacknowledgedTickets()`

Escalates tickets that have passed their acknowledgement deadline.

**Process:**
1. Finds tickets where `acknowledgement_due_at < now`
2. Excludes tickets in "awaiting_student_response" status
3. For each overdue ticket:
   - Finds matching escalation rule
   - Increments escalation level
   - Reassigns to rule's user (if rule found)
   - Logs escalation activity

### `escalateUnresolvedTickets()`

Escalates tickets that have passed their resolution deadline.

**Process:**
1. Finds tickets where `resolution_due_at < now`
2. Excludes tickets in "awaiting_student_response" status
3. For each overdue ticket:
   - Finds matching escalation rule
   - Increments escalation level
   - Reassigns to rule's user (if rule found)
   - Logs escalation activity

### `runEscalation()`

Runs both escalation checks in parallel.

**Called by:** `/api/cron/escalate-tickets` (every 30 minutes)

## Cron Job Configuration

The escalation cron job is configured in `vercel.json`:

```json
{
  "crons": [
    {
      "path": "/api/cron/escalate-tickets",
      "schedule": "*/30 * * * *"
    }
  ]
}
```

This runs every 30 minutes.

## Database Schema

```sql
CREATE TABLE escalation_rules (
  id SERIAL PRIMARY KEY,
  domain_id INTEGER REFERENCES domains(id) ON DELETE CASCADE,
  scope_id INTEGER REFERENCES scopes(id) ON DELETE CASCADE,
  level INTEGER NOT NULL,
  escalate_to_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  tat_hours INTEGER DEFAULT 48,
  notify_channel VARCHAR(50),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE(domain_id, scope_id, level)
);
```

## Best Practices

1. **Create rules in order**: Start with Level 1, then Level 2, etc.
2. **Use domain-specific rules**: Create rules for specific domains rather than global rules when possible
3. **Assign appropriate users**: Ensure escalated users have the right permissions and availability
4. **Monitor escalation levels**: Track which tickets are escalating frequently
5. **Set reasonable TAT hours**: Consider business hours and workload when setting TAT

## Troubleshooting

### Tickets not escalating

1. Check if escalation rules exist for the ticket's domain/scope
2. Verify the rule's `level` matches `current_escalation_level + 1`
3. Ensure the rule is `is_active = true`
4. Check if the ticket is in "awaiting_student_response" status (TAT is paused)

### Tickets escalating incorrectly

1. Verify the escalation rule's domain/scope matches the ticket
2. Check if multiple rules exist for the same level (first match wins)
3. Review the escalation cron job logs

### Weekend escalations

- Escalations should not run on weekends (business hours exclude weekends)
- If escalations occur on weekends, check the cron job configuration

## Related Files

- `src/lib/ticket/ticket-escalation-service.ts` - Escalation logic
- `src/app/api/cron/escalate-tickets/route.ts` - Cron job endpoint
- `src/lib/escalation/escalation-service.ts` - Rule management service
- `src/app/api/escalation-rules/route.ts` - API endpoints
- `src/components/admin/escalation/EscalationManager.tsx` - UI component
- `src/db/schema-tickets.ts` - Database schema

## Example Escalation Flows

### Flow 1: SLA Breach Escalation

1. **Ticket Created** (Dec 12, 11:38 AM)
   - SLA: 48 hours
   - Resolution due: Dec 16, 11:38 AM (48h, excluding weekends)

2. **Resolution Missed** (Dec 16, 11:38 AM)
   - Resolution deadline passed
   - Escalates to Level 1
   - Finds Level 1 rule for domain "Hostel"
   - Reassigns to admin specified in rule
   - Adds 48 business hours to TAT deadlines
   - Logs: "Not resolved within SLA"

3. **Resolution Missed Again** (After extended deadline)
   - New resolution deadline passed
   - Escalates to Level 2
   - Finds Level 2 rule for domain "Hostel"
   - Reassigns to senior admin specified in rule
   - Adds 48 business hours to TAT deadlines
   - Logs: "Not resolved within SLA"

### Flow 2: TAT Extension Escalation

1. **Ticket Created** (Dec 12, 11:38 AM)
   - Initial resolution due: Dec 16, 11:38 AM

2. **1st TAT Extension** (Dec 15, 2:00 PM)
   - Admin extends TAT by 24 hours
   - `tat_extensions = 1`
   - New resolution due: Dec 17, 2:00 PM

3. **2nd TAT Extension** (Dec 16, 10:00 AM)
   - Admin extends TAT by 12 hours
   - `tat_extensions = 2`
   - New resolution due: Dec 17, 10:00 PM

4. **3rd TAT Extension** (Dec 17, 9:00 AM)
   - Admin extends TAT by 6 hours
   - `tat_extensions = 3` → **TRIGGERS ESCALATION**
   - Escalates to Level 1 immediately
   - Finds Level 1 rule for domain
   - Reassigns to senior admin
   - Adds 48 business hours to TAT deadlines
   - Logs: "TAT extension limit reached (extension #3)"

5. **4th TAT Extension** (Dec 18, 2:00 PM)
   - Admin extends TAT by 8 hours
   - `tat_extensions = 4` (no escalation)

6. **5th TAT Extension** (Dec 19, 10:00 AM)
   - Admin extends TAT by 4 hours
   - `tat_extensions = 5` → **TRIGGERS ESCALATION**
   - Escalates to Level 2 immediately
   - Logs: "TAT extension limit reached (extension #5)"

7. **6th TAT Extension** (Dec 20, 3:00 PM)
   - Admin extends TAT by 6 hours
   - `tat_extensions = 6` (no escalation)

8. **7th TAT Extension** (Dec 21, 11:00 AM)
   - Admin extends TAT by 3 hours
   - `tat_extensions = 7` → **TRIGGERS ESCALATION**
   - Escalates to Level 3 immediately
   - Logs: "TAT extension limit reached (extension #7)"

### Flow 3: Repeated Reopening Escalation

1. **Ticket Resolved** (Dec 12, 2:00 PM)
   - Student marks as resolved

2. **1st Reopen** (Dec 13, 10:00 AM)
   - Student reopens: "Issue not fixed"
   - `reopen_count = 1`

3. **Ticket Resolved Again** (Dec 14, 3:00 PM)
   - Admin resolves again

4. **2nd Reopen** (Dec 15, 11:00 AM)
   - Student reopens: "Still not working"
   - `reopen_count = 2`

5. **Ticket Resolved Again** (Dec 16, 1:00 PM)
   - Admin resolves again

6. **3rd Reopen** (Dec 17, 9:00 AM)
   - Student reopens: "Problem persists"
   - `reopen_count = 3` → **TRIGGERS ESCALATION**
   - Escalates to Level 1 immediately
   - Finds Level 1 rule for domain
   - Reassigns to senior admin
   - Adds 48 business hours to TAT deadlines
   - Logs: "Repeated reopening (3rd time)"

### Flow 4: Negative Feedback Escalation

1. **Ticket Resolved** (Dec 12, 2:00 PM)
   - Admin resolves the ticket

2. **Student Rates Ticket** (Dec 13, 10:00 AM)
   - Student gives **1 star** rating
   - `rating = 1` → **TRIGGERS ESCALATION**
   - Escalates to Level 1 immediately
   - Finds Level 1 rule for domain
   - Reassigns to senior admin for review
   - Adds 48 business hours to TAT deadlines
   - Logs: "Negative feedback (1 star)"

