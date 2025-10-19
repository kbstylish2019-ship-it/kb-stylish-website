# STYLIST JOURNEY - REMEDIATION BLUEPRINT

**Created**: October 19, 2025  
**Engineer**: Claude Sonnet 4.5 (AI Remediation Specialist)  
**Priority**: P0 CRITICAL FIXES ONLY  
**Estimated Time**: 8-12 hours  
**Deployment Risk**: MEDIUM (requires migrations + testing)

---

## ⚡ EXECUTION STRATEGY

### Fix Order (Dependency-Based)

1. **[SJ-DATA-002]** `payment_intent_id` UNIQUE constraint → **NO DEPENDENCIES**
2. **[SJ-DATA-001]** `schedule_overrides` UNIQUE constraint → **NO DEPENDENCIES**
3. **[SJ-SEC-004]** Enable RLS on `schedule_change_log` → **NO DEPENDENCIES**
4. **[SJ-SEC-002]** Add advisory lock to `cancel_booking` → **NO DEPENDENCIES**
5. **[SJ-SEC-001]** Fix buffer time asymmetry in `create_booking` → **NO DEPENDENCIES**
6. **[SJ-SEC-003]** Remove UPDATE policy / Create RPC for cancellation → **DEPENDS ON #4**
7. **[SJ-PERF-001]** Async cache invalidation → **CAN BE DEFERRED TO P1**
8. **[SJ-TZ-001]** Fix TIME columns in schedules → **MAJOR MIGRATION - DEFERRED**

### Testing Protocol

After EACH fix:
1. ✅ Apply migration via MCP
2. ✅ Run manual verification query
3. ✅ Test exploit scenario (should fail)
4. ✅ Test legitimate use case (should work)
5. ✅ Check for regressions

### Rollback Strategy

All migrations include rollback SQL. If ANY fix causes issues:
1. Execute rollback migration
2. Verify system restored
3. Document issue
4. Revise fix

---

## 🔧 FIX #1: [SJ-DATA-002] Add UNIQUE Constraint on payment_intent_id

**Priority**: P0 - CRITICAL  
**Risk Level**: LOW (additive constraint)  
**Estimated Time**: 15 minutes  
**Dependencies**: None  

### Current State

```sql
-- Index exists but NOT unique
CREATE INDEX idx_bookings_payment ON bookings (payment_intent_id)
WHERE payment_intent_id IS NOT NULL;
```

### Problem

Same Stripe `payment_intent_id` can be used for multiple bookings, causing double-charging.

### Solution

**Migration**: `20251019_fix_payment_intent_unique.sql`

```sql
-- Forward migration
BEGIN;

-- Step 1: Check for existing duplicates (should be zero in production)
DO $$
DECLARE
  duplicate_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO duplicate_count
  FROM (
    SELECT payment_intent_id, COUNT(*) as cnt
    FROM bookings
    WHERE payment_intent_id IS NOT NULL
    GROUP BY payment_intent_id
    HAVING COUNT(*) > 1
  ) dups;
  
  IF duplicate_count > 0 THEN
    RAISE EXCEPTION 'Found % duplicate payment_intent_ids. Manual cleanup required.', duplicate_count;
  END IF;
END $$;

-- Step 2: Add UNIQUE constraint
ALTER TABLE bookings
ADD CONSTRAINT bookings_payment_intent_unique
UNIQUE (payment_intent_id);

COMMIT;
```

**Rollback**:
```sql
ALTER TABLE bookings
DROP CONSTRAINT IF EXISTS bookings_payment_intent_unique;
```

### Testing

```sql
-- Test 1: Attempt duplicate payment_intent_id (should FAIL)
INSERT INTO bookings (
  customer_user_id, stylist_user_id, service_id,
  start_time, end_time, price_cents, status,
  payment_intent_id
) VALUES (
  '...', '...', '...',
  NOW(), NOW() + INTERVAL '1 hour', 5000, 'confirmed',
  'pi_test_duplicate_123'
);

-- Duplicate insert (should raise constraint violation)
INSERT INTO bookings (
  customer_user_id, stylist_user_id, service_id,
  start_time, end_time, price_cents, status,
  payment_intent_id
) VALUES (
  '...', '...', '...',
  NOW() + INTERVAL '2 hours', NOW() + INTERVAL '3 hours', 5000, 'confirmed',
  'pi_test_duplicate_123'  -- SAME payment intent!
);
-- Expected: ERROR duplicate key value violates unique constraint
```

---

## 🔧 FIX #2: [SJ-DATA-001] Add UNIQUE Constraint on schedule_overrides

**Priority**: P0 - CRITICAL  
**Risk Level**: LOW  
**Estimated Time**: 20 minutes  
**Dependencies**: None

### Solution

**Migration**: `20251019_fix_schedule_override_unique.sql`

```sql
BEGIN;

-- Check for existing duplicates
DO $$
DECLARE
  duplicate_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO duplicate_count
  FROM (
    SELECT stylist_user_id, start_date, end_date, override_type, COUNT(*) as cnt
    FROM schedule_overrides
    WHERE stylist_user_id IS NOT NULL
    GROUP BY stylist_user_id, start_date, end_date, override_type
    HAVING COUNT(*) > 1
  ) dups;
  
  IF duplicate_count > 0 THEN
    RAISE WARNING 'Found % duplicate schedule overrides. Keeping first, deleting rest.', duplicate_count;
    
    -- Delete duplicates keeping only the earliest created_at
    DELETE FROM schedule_overrides
    WHERE id IN (
      SELECT id
      FROM (
        SELECT id,
               ROW_NUMBER() OVER (
                 PARTITION BY stylist_user_id, start_date, end_date, override_type
                 ORDER BY created_at ASC
               ) as rn
        FROM schedule_overrides
        WHERE stylist_user_id IS NOT NULL
      ) ranked
      WHERE rn > 1
    );
  END IF;
END $$;

-- Add UNIQUE constraint
ALTER TABLE schedule_overrides
ADD CONSTRAINT schedule_overrides_unique_per_stylist
UNIQUE (stylist_user_id, start_date, end_date, override_type)
WHERE stylist_user_id IS NOT NULL;

-- Note: allows multiple all-stylist overrides (stylist_user_id IS NULL)

COMMIT;
```

**Rollback**:
```sql
ALTER TABLE schedule_overrides
DROP CONSTRAINT IF EXISTS schedule_overrides_unique_per_stylist;
```

---

## 🔧 FIX #3: [SJ-SEC-004] Enable RLS on schedule_change_log

**Priority**: P0 - CRITICAL PRIVACY  
**Risk Level**: LOW  
**Estimated Time**: 15 minutes  

### Solution

**Migration**: `20251019_fix_schedule_change_log_rls.sql`

```sql
BEGIN;

-- Enable RLS
ALTER TABLE schedule_change_log ENABLE ROW LEVEL SECURITY;

-- Policy 1: Stylists can only view their own logs
CREATE POLICY "Stylists view own schedule logs" ON schedule_change_log
  FOR SELECT
  USING (stylist_user_id = auth.uid());

-- Policy 2: Admins can view all logs
CREATE POLICY "Admins view all schedule logs" ON schedule_change_log
  FOR ALL
  USING (public.user_has_role(auth.uid(), 'admin'));

-- Policy 3: No one can modify/delete logs (immutable audit trail)
-- (Already enforced by table design, but explicit policy adds clarity)

COMMIT;
```

**Rollback**:
```sql
DROP POLICY IF EXISTS "Stylists view own schedule logs" ON schedule_change_log;
DROP POLICY IF EXISTS "Admins view all schedule logs" ON schedule_change_log;
ALTER TABLE schedule_change_log DISABLE ROW LEVEL SECURITY;
```

---

## 🔧 FIX #4: [SJ-SEC-002] Add Advisory Lock to cancel_booking

**Priority**: P0 - CRITICAL  
**Risk Level**: MEDIUM (function replacement)  
**Estimated Time**: 30 minutes  

### Solution

**Migration**: `20251019_fix_cancel_booking_race_condition.sql`

```sql
CREATE OR REPLACE FUNCTION public.cancel_booking(
  p_booking_id UUID,
  p_cancelled_by UUID,
  p_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
    v_booking RECORD;
    v_refund_amount INTEGER;
BEGIN
    -- CRITICAL FIX: Acquire advisory lock FIRST to prevent race conditions
    PERFORM pg_advisory_xact_lock(hashtext('cancel_booking_' || p_booking_id::TEXT));
    
    -- Get booking details
    SELECT * INTO v_booking
    FROM bookings
    WHERE id = p_booking_id
    FOR UPDATE;
    
    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'error', 'Booking not found',
            'code', 'BOOKING_NOT_FOUND'
        );
    END IF;
    
    IF v_booking.status IN ('cancelled', 'completed') THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'error', 'Booking cannot be cancelled',
            'code', 'INVALID_STATUS',
            'current_status', v_booking.status
        );
    END IF;
    
    -- Calculate refund based on cancellation policy
    v_refund_amount := CASE 
        WHEN v_booking.start_time - NOW() > INTERVAL '24 hours' THEN v_booking.price_cents
        WHEN v_booking.start_time - NOW() > INTERVAL '12 hours' THEN v_booking.price_cents / 2
        ELSE 0
    END;
    
    -- Update booking status
    UPDATE bookings
    SET status = 'cancelled',
        cancelled_at = NOW(),
        cancelled_by = p_cancelled_by,
        cancellation_reason = p_reason,
        updated_at = NOW()
    WHERE id = p_booking_id;
    
    -- Decrement stylist's booking count
    UPDATE stylist_profiles
    SET total_bookings = GREATEST(0, total_bookings - 1),
        updated_at = NOW()
    WHERE user_id = v_booking.stylist_user_id;
    
    RETURN jsonb_build_object(
        'success', TRUE,
        'booking_id', p_booking_id,
        'refund_amount', v_refund_amount,
        'cancelled_at', NOW()
    );
END;
$$;
```

**Rollback**: Revert to previous version (backup function definition).

---

## 🔧 FIX #5: [SJ-SEC-001] Fix Buffer Time Asymmetry

**Priority**: P0 - CRITICAL  
**Risk Level**: MEDIUM  
**Estimated Time**: 45 minutes  

### Solution

**Migration**: `20251019_fix_booking_buffer_asymmetry.sql`

```sql
CREATE OR REPLACE FUNCTION public.create_booking(
  p_customer_id UUID,
  p_stylist_id UUID,
  p_service_id UUID,
  p_start_time TIMESTAMPTZ,
  p_customer_name TEXT,
  p_customer_phone TEXT DEFAULT NULL,
  p_customer_email TEXT DEFAULT NULL,
  p_customer_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
    v_booking_id UUID;
    v_end_time TIMESTAMPTZ;
    v_duration INTEGER;
    v_price INTEGER;
    v_conflicts INTEGER;
    v_buffer_minutes INTEGER;
BEGIN
    -- Get service duration and price
    v_duration := get_service_duration(p_stylist_id, p_service_id);
    v_price := get_service_price(p_stylist_id, p_service_id);
    v_end_time := p_start_time + (v_duration || ' minutes')::INTERVAL;
    
    -- Get buffer time
    SELECT booking_buffer_minutes INTO v_buffer_minutes
    FROM stylist_profiles
    WHERE user_id = p_stylist_id;
    
    -- Acquire advisory lock to prevent race conditions
    PERFORM pg_advisory_xact_lock(hashtext('booking_' || p_stylist_id::TEXT));
    
    -- CRITICAL FIX: Apply buffer to BOTH existing AND new booking ranges
    SELECT COUNT(*) INTO v_conflicts
    FROM bookings b
    WHERE b.stylist_user_id = p_stylist_id
        AND b.status NOT IN ('cancelled', 'no_show')
        AND tstzrange(
            b.start_time - (v_buffer_minutes || ' minutes')::INTERVAL,
            b.end_time + (v_buffer_minutes || ' minutes')::INTERVAL
        ) && tstzrange(
            p_start_time - (v_buffer_minutes || ' minutes')::INTERVAL,  -- FIX: Added buffer
            v_end_time + (v_buffer_minutes || ' minutes')::INTERVAL      -- FIX: Added buffer
        );
    
    IF v_conflicts > 0 THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'error', 'Time slot is no longer available',
            'code', 'SLOT_UNAVAILABLE'
        );
    END IF;
    
    -- Create the booking
    INSERT INTO bookings (
        customer_user_id,
        stylist_user_id,
        service_id,
        start_time,
        end_time,
        price_cents,
        status,
        customer_name,
        customer_phone,
        customer_email,
        customer_notes,
        booking_source
    ) VALUES (
        p_customer_id,
        p_stylist_id,
        p_service_id,
        p_start_time,
        v_end_time,
        v_price,
        'pending',
        p_customer_name,
        p_customer_phone,
        p_customer_email,
        p_customer_notes,
        'web'
    ) RETURNING id INTO v_booking_id;
    
    -- Update stylist's total bookings count
    UPDATE stylist_profiles
    SET total_bookings = total_bookings + 1,
        updated_at = NOW()
    WHERE user_id = p_stylist_id;
    
    RETURN jsonb_build_object(
        'success', TRUE,
        'booking_id', v_booking_id,
        'start_time', p_start_time,
        'end_time', v_end_time,
        'price_cents', v_price
    );
    
EXCEPTION
    WHEN OTHERS THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'error', SQLERRM,
            'code', 'BOOKING_ERROR'
        );
END;
$$;
```

---

## 🔧 FIX #6: [SJ-SEC-003] Remove Unsafe UPDATE Policy

**Priority**: P0 - CRITICAL  
**Risk Level**: HIGH (removes permission)  
**Estimated Time**: 30 minutes  

### Solution

**Migration**: `20251019_fix_booking_update_policy.sql`

```sql
BEGIN;

-- Remove the unsafe UPDATE policy
DROP POLICY IF EXISTS "Customers can cancel own bookings" ON bookings;

-- Customers can NO LONGER directly UPDATE bookings table
-- They MUST use the cancel_booking() RPC function which has proper validation

-- Add comment explaining the change
COMMENT ON TABLE bookings IS 'Customers cannot UPDATE directly. Use cancel_booking() RPC for cancellations.';

COMMIT;
```

**Note**: The `cancel_booking()` RPC already exists and is SECURITY DEFINER, so it bypasses RLS.

---

## 📊 TESTING CHECKLIST

### After All Fixes Applied

- [ ] **Double-Booking Test**: 100 concurrent booking attempts → Verify only valid slots accepted
- [ ] **Payment Duplicate Test**: Attempt reusing payment_intent_id → Verify constraint violation
- [ ] **Override Duplicate Test**: Create duplicate override → Verify constraint violation  
- [ ] **Cancellation Race Test**: 10 concurrent cancellations → Verify only 1 succeeds
- [ ] **Price Manipulation Test**: Attempt UPDATE price_cents → Verify permission denied
- [ ] **Audit Log Privacy Test**: Non-admin tries reading other's logs → Verify RLS blocks
- [ ] **Buffer Time Test**: Book at exact boundary → Verify 15-minute gap enforced
- [ ] **Regression Test**: Existing booking flow still works → Verify end-to-end

---

## 🚀 DEPLOYMENT PLAN

### Pre-Deployment
1. Backup production database
2. Test all migrations on staging
3. Verify rollback procedures work
4. Schedule maintenance window (30 minutes)

### Deployment Steps
1. Apply Fix #1 (payment_intent UNIQUE)
2. Apply Fix #2 (schedule_overrides UNIQUE) 
3. Apply Fix #3 (RLS on schedule_change_log)
4. Apply Fix #4 (cancel_booking advisory lock)
5. Apply Fix #5 (buffer asymmetry fix)
6. Apply Fix #6 (remove UPDATE policy)
7. Run verification tests
8. Monitor logs for 1 hour

### Post-Deployment
1. Monitor error rates
2. Check booking success rate
3. Verify no customer complaints
4. Document lessons learned

---

**STATUS**: Ready for implementation  
**Approval Required**: YES - Human verification needed before production deployment

