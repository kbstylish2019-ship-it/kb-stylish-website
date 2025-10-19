# 🚨 CRITICAL BUGS DISCOVERED - OCTOBER 19, 2025 (ROUND 2)

**Discovery Method**: End-to-end user testing after initial fixes  
**Status**: 3 CRITICAL P0 BUGS CONFIRMED

---

## BUG #1: PRIORITY CONFLICT - Oct 21 Shows NO Slots

### **Observed Behavior**
- Oct 21 override created: 9PM-11PM (partial day)
- **EXPECTED**: Slots before 9PM and after 11PM should be available
- **ACTUAL**: NO slots shown at all for Oct 21

### **Root Cause**: Dashain Festival Override Conflict
```sql
-- Two competing overrides:
1. Dashain Festival: Oct 15-25, is_closed=TRUE, applies_to_all_stylists=TRUE, priority=100
2. Specific Time: Oct 21, 21:00-23:00, is_closed=FALSE, stylist-specific, priority=100
```

**Problem**: `get_available_slots()` checks full-day closures FIRST:
```sql
-- This check runs BEFORE slot generation
SELECT EXISTS (
    SELECT 1 FROM schedule_overrides
    WHERE is_closed = TRUE
) INTO v_override_exists;

IF v_override_exists THEN
    RETURN;  -- ❌ EXITS IMMEDIATELY! Ignores time-specific override
END IF;
```

**Impact**: 
- User can't override Dashain for specific hours
- Breaks the entire override priority system
- Time-specific overrides are COMPLETELY IGNORED if ANY full-day override exists

### **Fix Required**: 
Check priority BEFORE deciding to return. Higher priority time-specific overrides should take precedence over lower priority full-day closures.

---

## BUG #2: TIME-SPECIFIC OVERRIDE NOT BLOCKING SLOTS

### **Observed Behavior**
- Oct 28-29 override created: 9PM-10PM (should block slots starting in that range)
- **EXPECTED**: 9:30 PM slot should be blocked (starts at 9:30 PM, overlaps with 9PM-10PM)
- **ACTUAL**: 9:30 PM, 10:00 PM, 10:30 PM, 11:00 PM ALL showing as available

### **Evidence**
```sql
-- Manual query CONFIRMS logic is correct:
should_block_930pm: TRUE
should_block_1000pm: FALSE (correct - starts at 10:00 PM, after override ends)

-- But get_available_slots() RETURNS these slots anyway!
```

### **Root Cause**: CACHE SERVING STALE DATA

**Smoking Gun**:
```sql
-- Cache expires_at: 2025-10-19 05:34:17 (5 minutes after computation)
-- Override created_at: 2025-10-19 05:27:30
-- Cache computed_at: 2025-10-19 05:29:17 (AFTER override creation)

-- BUT: Cache was computed with OLD function that DIDN'T check overrides!
```

**Timeline**:
1. 05:27:30 - Admin creates Oct 28-29 override (9PM-10PM)
2. 05:29:17 - Someone queries Oct 28 slots → cache computed with OLD broken function
3. 05:34:17 - Cache expires
4. User queries → sees stale cached slots WITH override times included

### **Fix Required**:
1. Invalidate cache when override is created
2. Verify function actually works (seems correct, but cache is hiding the truth)

---

## BUG #3: CACHE STALENESS ACROSS BROWSERS

### **Observed Behavior**
- User creates override in Admin panel
- Checks booking page in Browser A → still sees slots (STALE)
- Hard refreshes multiple times → still stale
- Switches to Browser B (logged in as stylist) → correctly shows no slots
- Returns to Browser A → NOW correctly shows no slots

### **Root Cause**: Multi-layer Caching

**Possible Culprits**:
1. **Browser Cache**: Next.js may be caching the API response
2. **Database Cache**: `availability_cache` table not invalidated
3. **CDN/Vercel Cache**: If deployed, edge caching
4. **React Query/SWR**: Client-side cache

### **Evidence**:
- Different browsers show different results (NOT database cache)
- Hard refresh doesn't clear it (NOT simple browser cache)
- Eventually resolves (cache expiry working)

### **Likely Cause**: Next.js Route Cache + Database Cache combo

---

## BUG #4: ADMIN OVERRIDE LIST - NO CREATOR INDICATOR

### **Observed Behavior**
- Admin override page shows all overrides
- No visual difference between:
  - Admin-created overrides (from admin panel)
  - Stylist-created overrides (from "Request Time Off")

### **Current Data**
```sql
created_by column exists:
- Admin overrides: created_by = admin_user_id
- Stylist overrides: created_by = stylist_user_id
```

### **Fix Required**:
Add badge/indicator in UI:
```tsx
{override.created_by === current_admin_id ? (
  <Badge variant="admin">Admin</Badge>
) : (
  <Badge variant="stylist">Stylist Request</Badge>
)}
```

---

## PHASE 2: 5-EXPERT PANEL ANALYSIS

### Expert 1: Cache Architect

**Verdict**: **CRITICAL CACHE INVALIDATION FAILURE**

**Analysis**:
```
Cache Invalidation Strategy:
1. Override created → pg_notify fired → Edge function triggered
2. Edge function deletes cache entries for affected stylist+dates
3. Next query → cache miss → fresh computation

FAILURE POINT: Cache computed AFTER override creation but BEFORE invalidation!
```

**Race Condition**:
```
T=0: Override created
T=+50ms: User queries slots
T=+100ms: Cache miss, compute slots (uses NEW function with override check)
T=+150ms: Cache stored with 5-min TTL
T=+200ms: pg_notify processed, cache deletion attempted
T=+250ms: Cache already deleted? Or was it the old cache?

PROBLEM: If query happens between override creation and cache invalidation,
we store CORRECT data in cache. But if OLD cache exists, invalidation may fail.
```

**Recommendation**: Immediate cache deletion in same transaction as override creation

---

### Expert 2: Database Performance Engineer

**Verdict**: **PRIORITY SYSTEM FUNDAMENTALLY BROKEN**

**Critical Flaw**:
```sql
-- Current logic:
IF any_full_day_closure_exists THEN RETURN; END IF;

-- Should be:
highest_priority_override = get_highest_priority_override_for_date()
IF highest_priority_override.is_closed = TRUE THEN 
  RETURN; 
END IF;
```

**Example Scenario**:
```
Dashain Festival: Oct 15-25, priority=100, is_closed=TRUE
Emergency Override: Oct 21 09:00-17:00, priority=100, is_closed=FALSE

Current: Returns NO slots (Dashain wins)
Expected: Return slots 09:00-17:00 (same priority, but more specific)

Fix: Specificity should trump generality at EQUAL priority
```

---

### Expert 3: Systems Reliability Engineer

**Verdict**: **CACHE CONSISTENCY VIOLATED**

**CAP Theorem Violation**:
- Availability: ✅ (cache always returns data)
- Partition Tolerance: ✅ (works across browsers)
- Consistency: ❌ **VIOLATED** (different browsers see different data)

**Problem**: **Eventually Consistent** cache in **Immediately Consistent** system

**Fix**: Two options:
1. **Synchronous Cache Invalidation** (slow but consistent)
2. **Cache-Aside with TTL=0** for writes (fast but complex)

**Recommendation**: Option 1 - Delete cache BEFORE creating override

---

### Expert 4: Frontend Performance Expert

**Verdict**: **NEXT.JS ROUTER CACHE ISSUE**

**Evidence**:
```
- Hard refresh doesn't clear cache → NOT browser cache
- Different browsers show different results → NOT server cache
- Eventually syncs → Some TTL is expiring
```

**Culprit**: Next.js 15 Router Cache (formerly called "Full Route Cache")

**Next.js Cache Layers**:
1. **Router Cache** (client-side, per-browser)
2. **Request Memoization** (server-side, per-request)
3. **Data Cache** (server-side, persistent)
4. **Full Route Cache** (server-side, build-time)

**Problem**: GET `/api/bookings/available-slots` is being cached by Router Cache

**Fix**: Add cache control headers:
```typescript
return NextResponse.json(slots, {
  headers: {
    'Cache-Control': 'no-store, max-age=0',
  }
});
```

---

### Expert 5: Principal Engineer

**Verdict**: **SYSTEMIC OVERRIDE DESIGN FLAW**

**Critical Issues**:
1. ❌ Priority doesn't work (full-day always wins)
2. ❌ Cache invalidation timing wrong
3. ❌ No specificity rules (date-specific should win over range)
4. ❌ Multiple cache layers not synchronized

**Recommended Architecture**:
```sql
-- Step 1: Get ALL overlapping overrides
SELECT * FROM schedule_overrides
WHERE date_range_overlaps(p_target_date)
ORDER BY priority DESC, specificity DESC;

-- Step 2: Apply highest priority override PER TIME SLOT
FOR each_slot IN time_slots LOOP
  highest_override := get_highest_priority_for_time(slot, overrides);
  
  IF highest_override.is_closed THEN
    SKIP slot;
  ELSIF highest_override.override_time_exists THEN
    IF slot overlaps override_time THEN
      SKIP slot;
    END IF;
  END IF;
END LOOP;
```

---

## TESTING MATRIX

| Scenario | Current | Expected | Priority |
|----------|---------|----------|----------|
| Oct 21 (Dashain + 9PM-11PM override) | No slots | Slots except 9-11PM | P0 |
| Oct 27 (full day stylist time off) | No slots | No slots | ✅ PASS |
| Oct 28 (admin 9PM-10PM override) | All slots showing | Block 9:30 PM | P0 |
| Cache after override | Stale (5 min) | Immediate | P0 |
| Admin list - creator badge | Missing | Show Admin/Stylist | P1 |

---

## RECOMMENDED FIX ORDER

1. **P0 BLOCKER**: Fix priority + specificity logic (Bug #1)
2. **P0 BLOCKER**: Synchronous cache invalidation (Bug #2 + #3)
3. **P0 BLOCKER**: Add Next.js cache headers (Bug #3)
4. **P1 UX**: Add creator badge to admin list (Bug #4)

**Estimated Fix Time**: 2-3 hours
**Regression Risk**: MEDIUM (touching core availability logic)
