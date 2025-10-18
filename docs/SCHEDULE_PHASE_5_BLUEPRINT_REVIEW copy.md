# 🔬 PHASE 5: BLUEPRINT EXPERT REVIEW

**Excellence Protocol - Phase 5**  
**Date:** October 16, 2025  
**Status:** ⏳ **IN PROGRESS**

---

## 👨‍💻 EXPERT 1: SECURITY ARCHITECT - BLUEPRINT REVIEW

### Critical Security Issues Found 🔴

**ISSUE 1: Missing Request Idempotency**
- **Severity:** HIGH
- **Problem:** Duplicate form submissions bypass budget limits
- **Blueprint Section:** TimeOffRequestModal component
- **Risk:** User clicks twice → 2 overrides created → budget bypass
- **Fix Required:**
```typescript
// Generate idempotency key on component mount
const [idempotencyKey] = useState(() => `${userId}-${Date.now()}`);

// Include in API call
headers: {
  'Content-Type': 'application/json',
  'X-Idempotency-Key': idempotencyKey
}

// Server checks cache:
const cached = await redis.get(`idem:${idempotencyKey}`);
if (cached) return NextResponse.json(JSON.parse(cached));

// Store result for 5 minutes
await redis.set(`idem:${idempotencyKey}`, JSON.stringify(result), { ex: 300 });
```

**ISSUE 2: CSRF Implementation Incomplete**
- **Severity:** MEDIUM
- **Problem:** Blueprint shows CSRF token but no server validation
- **Fix:** Add server-side token validation in all POST endpoints

**ISSUE 3: Rate Limiting Uses In-Memory Map**
- **Severity:** MEDIUM  
- **Problem:** Map resets on server restart, multi-instance doesn't share state
- **Fix:** Use Redis or Upstash for distributed rate limiting

### Approved Security Measures ✅
- ✅ CSRF tokens in forms
- ✅ Input sanitization (HTML stripping)
- ✅ Date validation (server-side)
- ✅ Role-based access control
- ✅ RLS policies enforced

**Verdict:** ⚠️ **CONDITIONAL APPROVAL** - Fix ISSUE 1 & 3 before implementation

---

## ⚡ EXPERT 2: PERFORMANCE ENGINEER - BLUEPRINT REVIEW

### Performance Concerns Found ⚠️

**ISSUE 1: Missing Loading Skeleton**
- **Severity:** LOW
- **Problem:** White screen during initial data fetch
- **Fix:** Add skeleton UI while loading schedule table

**ISSUE 2: No Debouncing on Reason Input**
- **Severity:** LOW
- **Problem:** Character count updates on every keystroke
- **Fix:** Already mentioned in blueprint but not implemented
```typescript
const debouncedReason = useDebounce(reason, 300);
<p>{debouncedReason.length}/200</p>
```

**ISSUE 3: Fetch Waterfall**
- **Severity:** MEDIUM
- **Problem:** Modal loads budget after opening (sequential)
- **Fix:** Prefetch budget when page loads
```typescript
// In SchedulePageClient:
const { data: budget } = useQuery(['budget'], fetchBudget);

// Pass to modal:
<TimeOffRequestModal budget={budget} />
```

### Approved Optimizations ✅
- ✅ React Query with 5-min cache
- ✅ Optimistic UI updates
- ✅ Indexed database queries
- ✅ Event-based refresh (`override-created`)

**Verdict:** ✅ **APPROVED** - Implement prefetch optimization

---

## 🗄️ EXPERT 3: DATA ARCHITECT - BLUEPRINT REVIEW

### Data Integrity Issues Found 🔴

**ISSUE 1: Race Condition in Budget Check**
- **Severity:** CRITICAL
- **Problem:** `request_availability_override` RPC doesn't use row-level locking
- **Risk:** Concurrent requests bypass budget limit
- **Fix:** Modify RPC to use `SELECT FOR UPDATE`
```sql
SELECT monthly_override_limit, current_month_overrides
INTO v_budget_record
FROM public.stylist_override_budgets
WHERE stylist_user_id = p_stylist_id
FOR UPDATE;  -- ← ADD THIS
```

**ISSUE 2: Missing ON CONFLICT Handling**
- **Severity:** HIGH
- **Problem:** Duplicate override insertion will fail but no retry logic
- **Blueprint:** Shows unique constraint but no conflict resolution
- **Fix:** Add ON CONFLICT DO NOTHING or proper error handling

**ISSUE 3: Timezone Inconsistency Risk**
- **Severity:** MEDIUM
- **Problem:** Client sends date string, server interprets in UTC
- **Risk:** Date boundary issues (11:59 PM user → next day UTC)
- **Fix:** Send ISO 8601 with explicit timezone
```typescript
const isoDate = new Date(targetDate).toISOString(); // 2025-10-20T00:00:00.000Z
```

### Approved Data Design ✅
- ✅ Unique constraints on overrides
- ✅ CHECK constraints on dates
- ✅ Foreign key cascade deletes
- ✅ Audit logging in RPC

**Verdict:** 🔴 **BLOCKED** - Fix ISSUE 1 (critical race condition)

---

## 🎨 EXPERT 4: UX ENGINEER - BLUEPRINT REVIEW

### UX Issues Found ⚠️

**ISSUE 1: Date Picker Doesn't Disable Booked Dates**
- **Severity:** MEDIUM
- **Problem:** User can select already-requested dates
- **Fix:** Fetch existing overrides, disable those dates
```typescript
const { data: existing } = useQuery(['overrides'], fetchOverrides);
const disabledDates = existing?.map(o => o.start_date) || [];

<input
  type="date"
  disabled={(date) => disabledDates.includes(date)}
/>
```

**ISSUE 2: No Confirmation Step**
- **Severity:** LOW
- **Problem:** Single click submits (risky for emergency override)
- **Fix:** Add confirmation dialog for emergency requests
```typescript
if (isEmergency && !confirmed) {
  setShowConfirm(true);
  return;
}
```

**ISSUE 3: Missing Empty State for Schedule**
- **Severity:** LOW
- **Problem:** If no schedule exists, shows empty table
- **Fix:** Show call-to-action to contact admin

**ISSUE 4: Character Counter Not Real-time**
- **Severity:** LOW
- **Problem:** Counter updates after validation
- **Fix:** Show count as user types (already in blueprint)

### Approved UX Patterns ✅
- ✅ Loading states with Loader2
- ✅ Error states with AlertTriangle
- ✅ Toast notifications
- ✅ Budget display before submission
- ✅ Responsive design

**Verdict:** ✅ **APPROVED** - Implement ISSUE 1 (disable booked dates)

---

## 🔬 EXPERT 5: PRINCIPAL ENGINEER - BLUEPRINT REVIEW

### System Integration Issues Found 🔴

**ISSUE 1: No Rollback Plan for Migration**
- **Severity:** HIGH
- **Problem:** Blueprint adds constraints but no rollback SQL
- **Fix:** Include rollback in migration file
```sql
-- Rollback:
DROP INDEX IF EXISTS idx_no_duplicate_override;
ALTER TABLE schedule_overrides DROP CONSTRAINT IF EXISTS check_valid_date_range;
```

**ISSUE 2: Missing Error Monitoring**
- **Severity:** MEDIUM
- **Problem:** No logging/monitoring mentioned
- **Fix:** Add Sentry or console logging
```typescript
try {
  // API call
} catch (err) {
  console.error('[Schedule] Override request failed:', {
    userId,
    targetDate,
    error: err
  });
  // Send to Sentry if configured
  throw err;
}
```

**ISSUE 3: No Graceful Degradation**
- **Severity:** LOW
- **Problem:** If RPC fails, entire page breaks
- **Fix:** Show cached schedule or "Unavailable" message

**ISSUE 4: React Query Not in Dependencies**
- **Severity:** CRITICAL
- **Problem:** Blueprint uses `useQuery` but no package.json update
- **Fix:** Add to dependencies
```json
{
  "@tanstack/react-query": "^5.0.0"
}
```

### Approved Integration ✅
- ✅ Event-based communication (`window.dispatchEvent`)
- ✅ API endpoint structure
- ✅ Error handling patterns
- ✅ Booking system integration verified

**Verdict:** 🔴 **BLOCKED** - Add React Query dependency

---

## 📊 CONSOLIDATED REVIEW RESULTS

### 🔴 CRITICAL ISSUES (Must Fix Before Proceeding):
1. **Race condition in budget check** (Data Architect)
   - Add `SELECT FOR UPDATE` to RPC
   
2. **Missing React Query dependency** (Principal Engineer)
   - Add `@tanstack/react-query` to package.json
   
3. **Request idempotency missing** (Security)
   - Implement idempotency key system

### 🟡 HIGH PRIORITY (Should Fix):
1. **ON CONFLICT handling** (Data Architect)
2. **Migration rollback plan** (Principal Engineer)
3. **Rate limiting uses in-memory** (Security)
4. **Disable already-booked dates** (UX Engineer)

### 🟢 NICE TO HAVE:
1. Loading skeleton UI
2. Prefetch budget data
3. Confirmation for emergency override
4. Error monitoring/logging

---

## 🔧 REQUIRED BLUEPRINT REVISIONS

### Revision 1: Update RPC Function
```sql
-- File: supabase/migrations/20251016_fix_budget_race.sql
CREATE OR REPLACE FUNCTION request_availability_override(...)
RETURNS jsonb AS $$
DECLARE
  v_budget_record RECORD;
BEGIN
  -- ADD ROW LOCK:
  SELECT monthly_override_limit, current_month_overrides
  INTO v_budget_record
  FROM public.stylist_override_budgets
  WHERE stylist_user_id = p_stylist_id
  FOR UPDATE;  -- ← CRITICAL FIX
  
  -- Rest of function...
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

### Revision 2: Add Dependencies
```json
// package.json
{
  "dependencies": {
    "@tanstack/react-query": "^5.0.0",
    "@upstash/redis": "^1.28.0"  // For idempotency & rate limiting
  }
}
```

### Revision 3: Implement Idempotency
```typescript
// New utility: src/lib/idempotency.ts
import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_URL!,
  token: process.env.UPSTASH_REDIS_TOKEN!
});

export async function withIdempotency<T>(
  key: string,
  fn: () => Promise<T>
): Promise<T> {
  const cached = await redis.get(key);
  if (cached) return JSON.parse(cached as string);
  
  const result = await fn();
  await redis.set(key, JSON.stringify(result), { ex: 300 });
  return result;
}

// Usage in API route:
const result = await withIdempotency(
  `override:${userId}:${targetDate}`,
  async () => {
    // Call RPC
  }
);
```

### Revision 4: Migration Rollback
```sql
-- Add to migration file:
-- To rollback:
-- BEGIN;
-- DROP INDEX IF EXISTS idx_no_duplicate_override;
-- ALTER TABLE schedule_overrides DROP CONSTRAINT IF EXISTS check_valid_date_range;
-- ALTER TABLE stylist_schedules DROP CONSTRAINT IF EXISTS check_valid_work_hours;
-- COMMIT;
```

---

## ✅ PHASE 5 VERDICT

**Expert Votes:**
- Security: ⚠️ Conditional (fix idempotency)
- Performance: ✅ Approved
- Data: 🔴 Blocked (fix race condition)
- UX: ✅ Approved  
- Systems: 🔴 Blocked (add dependencies)

**Overall Status:** 🔴 **REVISIONS REQUIRED**

**Critical Blockers:** 3
1. Add `SELECT FOR UPDATE` to RPC
2. Add React Query dependency
3. Implement idempotency

**Action Required:** Proceed to **PHASE 6 (Blueprint Revision)**

---

**Phase 5 Complete:** October 16, 2025  
**Result:** Issues identified and documented  
**Next Phase:** Phase 6 (Address all critical issues)
