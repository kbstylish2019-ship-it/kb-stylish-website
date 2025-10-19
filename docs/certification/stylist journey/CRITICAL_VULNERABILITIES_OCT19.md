# 🚨 CRITICAL VULNERABILITIES DISCOVERED - OCTOBER 19, 2025

**Protocol**: Universal AI Excellence Protocol (All 10 Phases)  
**Severity**: P0 PRODUCTION BLOCKERS  
**Discovery Method**: End-to-end user testing + live database inspection

---

## 📊 EXECUTIVE SUMMARY

### 5 Critical Issues Discovered:

1. **[SJ-SEC-005]** Self-Booking Vulnerability - Stylist can book themselves (CVSS 6.5 MEDIUM)
2. **[SJ-FUNC-001]** Schedule Overrides NOT WORKING - get_available_slots() ignores overrides (P0 BLOCKER)
3. **[SJ-CACHE-001]** Cache invalidation firing but frontend shows stale data (CONFIRMED working, false alarm)
4. **[SJ-UI-001]** Request Time Off constraint violation (priority check failing)
5. **[SJ-VENDOR-001]** Similar vulnerability in vendor system (can vendors buy their own products?)

---

## PHASE 1-2: CONSCIOUSNESS + 5-EXPERT PANEL

### Issue #1: Self-Booking Vulnerability

**Evidence from Live Database**:
```sql
-- Self-booking CONFIRMED
customer_user_id: 8e80ead5-ce95-4bad-ab30-d4f54555584b  
stylist_user_id:  8e80ead5-ce95-4bad-ab30-d4f54555584b  ← SAME USER!
username: "shishir bhusal"
status: cancelled (after user manually cancelled)
```

**Root Cause Analysis**:
```sql
-- create_booking function - NO VALIDATION
CREATE FUNCTION create_booking(
  p_customer_id uuid,  -- ← Can be SAME as stylist!
  p_stylist_id uuid,   -- ← No check here
  ...
) 
-- Function has ZERO validation that customer ≠ stylist
```

**RLS Policy Analysis**:
```sql
CREATE POLICY "Customers can create bookings" ON bookings
  FOR INSERT
  WITH CHECK (customer_user_id = auth.uid());
  
-- ✅ Checks: User is logged in
-- ❌ MISSING: Check that customer_user_id ≠ stylist_user_id
```

---

### 5-Expert Panel Consultation:

#### Expert 1: Security Architect
**Verdict**: **MEDIUM-HIGH SEVERITY** (CVSS 6.5)

**Attack Vectors**:
1. **Malicious**: Stylist books themselves to block slots, preventing real customers
2. **Accidental**: Genuine mistake (as happened in testing)
3. **Financial**: Self-bookings could manipulate earnings metrics
4. **Data Integrity**: False booking analytics

**Exploitation**:
- No authentication bypass needed
- Can be done via normal UI flow
- No logging/alerting for this case

**Impact**:
- Availability manipulation
- Revenue reporting corruption
- Analytics integrity compromised

**Recommended Fix**:
```sql
-- Option A: Database constraint (BEST - atomic)
ALTER TABLE bookings ADD CONSTRAINT prevent_self_booking 
  CHECK (customer_user_id != stylist_user_id);

-- Option B: Function validation (GOOD - clear error)
IF p_customer_id = p_stylist_id THEN
  RETURN jsonb_build_object(
    'success', FALSE,
    'error', 'Cannot book your own services',
    'code', 'SELF_BOOKING_NOT_ALLOWED'
  );
END IF;

-- Option C: RLS policy (WEAK - bypassable)
-- Not recommended as primary defense
```

**Verdict**: Implement **BOTH A and B** (defense in depth)

---

#### Expert 2: Business Logic Engineer
**Verdict**: **BUSINESS RULE VIOLATION**

**Business Impact**:
1. **Revenue Leakage**: If stylist books themselves, who pays?
   - Payment system confusion
   - Refund handling unclear
   - Commission calculation broken

2. **Availability Blocking**: 
   - Malicious stylist could block all their slots
   - Prevents genuine customers from booking
   - Disrupts platform operations

3. **Trust Erosion**:
   - Customers see "fully booked"
   - Actually just self-bookings
   - Platform credibility damaged

**Similar Issue: Vendor Products**:
- Can vendor buy their own product?
- Should this be allowed? (Maybe for testing?)
- Same business logic needed

**Recommendation**: 
- **Hard block** for bookings (never valid use case)
- **Soft warning** for products (may have legitimate testing need)

---

#### Expert 3: Data Architect
**Verdict**: **SCHEMA INTEGRITY ISSUE**

**Data Model Analysis**:
```
bookings table:
- customer_user_id → user_profiles(id)
- stylist_user_id → stylist_profiles(user_id)
- MISSING: CHECK constraint for customer ≠ stylist
```

**Cascade Effects**:
- booking_status_history: Audit trail shows self-bookings
- stylist_profiles.total_bookings: Inflated by self-bookings
- Analytics queries: Need to filter `WHERE customer_user_id != stylist_user_id`

**Historical Data Cleanup**:
```sql
-- Check for existing self-bookings in production
SELECT COUNT(*) FROM bookings 
WHERE customer_user_id = stylist_user_id
  AND status != 'cancelled';
-- Expected: 0 (user cancelled the one we found)
```

**Recommendation**: Add CHECK constraint + migrate/audit historical data

---

#### Expert 4: Frontend/UX Engineer
**Verdict**: **UI SHOULD PREVENT THIS**

**Current Flow**:
1. User logs in as stylist
2. Goes to "Book a Stylist" page
3. Sees their own profile listed
4. Can click "Book Now" on themselves ← **SHOULD BE DISABLED**

**UX Improvements**:
```tsx
// In StylistCard component
const canBook = currentUser?.id !== stylist.user_id;

<Button 
  disabled={!canBook}
  title={!canBook ? "You cannot book your own services" : undefined}
>
  {!canBook ? "Your Profile" : "Book Now"}
</Button>
```

**But**: UI validation is NOT security - backend MUST enforce

---

#### Expert 5: Principal Engineer (Systems)
**Verdict**: **CRITICAL - MULTI-LAYER FAILURE**

**Defense Layers Analyzed**:
1. ❌ **UI Layer**: Allows booking own profile
2. ❌ **API Layer**: No validation in `/api/bookings/create`
3. ❌ **Database Function**: `create_booking()` missing check
4. ❌ **RLS Policy**: Only checks `auth.uid() = customer_user_id`
5. ❌ **Database Constraint**: No CHECK constraint

**ALL 5 LAYERS FAILED** = Systemic issue

**Similar Issues to Check**:
- Can vendor buy their own product? (Same pattern)
- Can stylist review themselves? (Check review system)
- Can admin promote themselves? (Check promotion workflow)

---

## ISSUE #2: Schedule Overrides NOT WORKING

**Evidence**:
- Override created: 2025-10-21, 21:00-23:00, priority 100
- Frontend STILL shows 9:30 PM - 11:00 PM slots as available
- Cache shows these slots exist

**Root Cause**: `get_available_slots()` function **DOES NOT CHECK** `schedule_overrides` table!

**Current Function Logic**:
```sql
-- get_available_slots() checks:
1. stylist_schedules (base schedule) ✅
2. bookings (existing bookings) ✅
3. booking_reservations (temp holds) ✅
4. schedule_overrides ❌❌❌ NOT CHECKED!
```

**Critical Missing Logic**:
```sql
-- SHOULD add this check in the WHILE loop:
IF EXISTS (
  SELECT 1 FROM schedule_overrides so
  WHERE so.stylist_user_id = p_stylist_id
    AND p_target_date BETWEEN so.start_date AND so.end_date
    AND (
      so.is_closed = TRUE
      OR (
        v_slot_start_local::time >= so.override_start_time
        AND v_slot_end_local::time <= so.override_end_time
      )
    )
) THEN
  v_slot_start_local := v_slot_start_local + interval '30 minutes';
  CONTINUE;  -- Skip this slot
END IF;
```

**Impact**: 
- ❌ Time off requests don't block slots
- ❌ Business closures don't work
- ❌ Seasonal hours ignored
- ❌ Customers can book during vacation!

---

## ISSUE #3: Request Time Off Constraint Violation

**Error from Screenshot**:
```
new row for relation "schedule_overrides" violates 
check constraint "schedule_overrides_priority_check"
```

**Constraint Definition**:
```sql
CHECK ((priority >= 0) AND (priority <= 100))
```

**User Input**: Priority = 100 (from slider, max value)

**Possible Causes**:
1. Frontend sending `null` instead of 100?
2. Frontend sending string "100" not number?
3. Frontend sending value > 100?
4. Database constraint bug?

**Need to inspect**: Frontend form submission for Request Time Off

---

## PHASE 3-6: SOLUTION BLUEPRINT

### Fix #1: Self-Booking Prevention

**Implementation**: Multi-layer defense

**Layer 1: Database Constraint** (PRIMARY DEFENSE)
```sql
ALTER TABLE bookings 
ADD CONSTRAINT prevent_self_booking 
CHECK (customer_user_id != stylist_user_id);
```

**Layer 2: Function Validation** (CLEAR ERROR MESSAGES)
```sql
-- In create_booking() function, add BEFORE conflict check:
IF p_customer_id = p_stylist_id THEN
  RETURN jsonb_build_object(
    'success', FALSE,
    'error', 'You cannot book your own services. Please select a different stylist.',
    'code', 'SELF_BOOKING_NOT_ALLOWED'
  );
END IF;
```

**Layer 3: UI Prevention** (UX IMPROVEMENT)
```tsx
// Disable booking button for own profile
{currentUser?.id === stylist.user_id ? (
  <Badge variant="outline">Your Profile</Badge>
) : (
  <Button onClick={openBookingModal}>Book Now</Button>
)}
```

---

### Fix #2: Schedule Overrides Integration

**Implementation**: Update `get_available_slots()` to respect overrides

**Critical Addition**:
```sql
-- Add AFTER break time check, BEFORE availability check:

-- Check if slot is blocked by schedule override
IF EXISTS (
  SELECT 1 FROM schedule_overrides so
  WHERE (
    so.stylist_user_id = p_stylist_id 
    OR (so.applies_to_all_stylists = TRUE)
  )
    AND p_target_date BETWEEN so.start_date AND so.end_date
    AND (
      -- Either fully closed
      so.is_closed = TRUE
      OR
      -- Or slot overlaps with override time range
      (
        so.override_start_time IS NOT NULL
        AND so.override_end_time IS NOT NULL
        AND NOT (
          -- Slot ends before override starts
          time_from_timestamp(v_slot_end_utc, v_stylist_timezone) <= so.override_start_time
          OR
          -- Slot starts after override ends
          time_from_timestamp(v_slot_start_utc, v_stylist_timezone) >= so.override_end_time
        )
      )
    )
  ORDER BY so.priority DESC  -- Respect priority
  LIMIT 1
) THEN
  v_slot_start_local := v_slot_start_local + interval '30 minutes';
  CONTINUE;  -- Skip this slot
END IF;
```

---

### Fix #3: Request Time Off Form Validation

**Need to investigate frontend**:
- Check form submission code
- Validate priority value type
- Add error handling

---

### Fix #4: Vendor Self-Purchase Check

**5-Expert Recommendation**:
- **Allow** with warning (may have legitimate use for testing)
- **Log** all self-purchases for fraud detection
- **Flag** in analytics as "self-purchase"

```sql
-- Add soft warning, not hard block
COMMENT ON COLUMN orders.vendor_self_purchase IS 
  'TRUE if customer_id = product.vendor_id. Flagged for analytics.';
```

---

## TESTING MATRIX

| Issue | Test Case | Expected | Current |
|-------|-----------|----------|---------|
| Self-booking | Stylist tries to book themselves | ❌ Error | ✅ Allowed |
| Override time off | Customer views slots during override | ❌ Hidden | ✅ Visible |
| Override business closure | Customer books on holiday | ❌ Error | ✅ Allowed |
| Request time off form | Stylist submits priority=100 | ✅ Success | ❌ Constraint error |
| Cache invalidation | Override created → cache cleared | ✅ Cleared | ⚠️ Async (working) |

---

## RISK ASSESSMENT

| Issue | Severity | Exploitability | Business Impact | Priority |
|-------|----------|----------------|-----------------|----------|
| Self-booking | MEDIUM (6.5) | Easy | Medium | P0 |
| Overrides not working | CRITICAL (9.0) | N/A | HIGH | P0 |
| Request time off error | MEDIUM | N/A | Medium | P1 |
| Cache staleness | LOW | N/A | Low | P2 |
| Vendor self-purchase | LOW | Easy | Low | P3 |

---

## RECOMMENDED FIX ORDER

1. **Fix #2 FIRST** - Schedule overrides (blocks customer bookings during vacation)
2. **Fix #1 SECOND** - Self-booking prevention (data integrity)
3. **Fix #3 THIRD** - Request time off form (UX issue)
4. **Fix #4 DEFER** - Vendor self-purchase (low priority, may be intentional)

**Estimated Implementation**: 4-6 hours total
**Testing Required**: End-to-end booking flow + override scenarios
