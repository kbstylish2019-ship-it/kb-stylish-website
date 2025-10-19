# VENDOR JOURNEY - P0 FIXES TESTING GUIDE
**Version**: 1.0  
**Created**: October 18, 2025 9:10 PM NPT  
**Test Coverage**: All 5 P0 Critical Fixes  
**Estimated Testing Time**: 2-3 hours  
**Test Environment**: Staging (before production)

---

## 🎯 TESTING STRATEGY

### Test Levels

1. **Database-Level Tests** (30 min) - SQL queries to verify migrations
2. **API-Level Tests** (45 min) - Edge Function / RPC testing
3. **Application-Level Tests** (60 min) - Manual UI testing
4. **Concurrency Tests** (30 min) - Load testing for race conditions

---

## 🧪 DATABASE-LEVEL TESTS

### TEST #1: Verify Encryption (VJ-SEC-001)

**Objective**: Confirm bank accounts are encrypted and can be decrypted by admins only.

```sql
-- TEST 1.1: Verify plain text columns removed
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'vendor_profiles' 
AND column_name IN ('bank_account_number', 'tax_id', 'esewa_number', 'khalti_number');
-- Expected: 0 rows (columns dropped)

-- TEST 1.2: Verify encrypted columns exist
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'vendor_profiles' 
AND column_name LIKE '%_enc';
-- Expected: 4 rows (bank_account_number_enc, tax_id_enc, esewa_number_enc, khalti_number_enc)

-- TEST 1.3: Verify data is encrypted (not human-readable)
SELECT 
  user_id,
  bank_account_number_enc,
  length(bank_account_number_enc) as encrypted_length
FROM public.vendor_profiles 
WHERE bank_account_number_enc IS NOT NULL 
LIMIT 3;
-- Expected: BYTEA values (binary data like \x3c1a2b...)

-- TEST 1.4: Test decryption function (as admin)
SELECT public.decrypt_bank_account('[vendor_user_id]');
-- Expected: Decrypted bank account number (human-readable)

-- TEST 1.5: Verify audit logging
SELECT * FROM private.audit_log 
WHERE action = 'decrypt_bank_account' 
ORDER BY created_at DESC 
LIMIT 5;
-- Expected: Log entries for each decrypt operation
```

**Pass Criteria**: 
- ✅ Plain text columns completely removed
- ✅ Encrypted columns contain binary data
- ✅ Decrypt function returns correct value
- ✅ All decrypt operations logged

---

### TEST #2: Verify Payout Arithmetic Constraint (VJ-DATA-002)

**Objective**: Confirm payouts with incorrect arithmetic are rejected.

```sql
-- TEST 2.1: Verify constraint exists
SELECT conname, pg_get_constraintdef(oid) 
FROM pg_constraint 
WHERE conname = 'payouts_arithmetic_check';
-- Expected: 1 row showing CHECK constraint

-- TEST 2.2: Test CORRECT arithmetic (should succeed)
BEGIN;
INSERT INTO public.payouts (
  vendor_id, 
  amount_cents, 
  platform_fees_cents, 
  net_amount_cents, 
  status
) VALUES (
  (SELECT user_id FROM vendor_profiles LIMIT 1),
  10000,  -- $100.00
  1500,   -- $15.00 platform fee
  8500,   -- $85.00 net (CORRECT: 10000 - 1500 = 8500)
  'pending'
);
ROLLBACK;
-- Expected: SUCCESS (no error)

-- TEST 2.3: Test WRONG arithmetic (should fail)
BEGIN;
INSERT INTO public.payouts (
  vendor_id,
  amount_cents,
  platform_fees_cents,
  net_amount_cents,
  status
) VALUES (
  (SELECT user_id FROM vendor_profiles LIMIT 1),
  10000,  -- $100.00
  1500,   -- $15.00 platform fee
  9999,   -- $99.99 net (WRONG! Should be 8500)
  'pending'
);
ROLLBACK;
-- Expected: ERROR - violates check constraint "payouts_arithmetic_check"

-- TEST 2.4: Verify existing data integrity
SELECT COUNT(*) as invalid_payouts
FROM public.payouts
WHERE net_amount_cents != (amount_cents - platform_fees_cents);
-- Expected: 0 (all existing payouts have correct arithmetic)
```

**Pass Criteria**:
- ✅ Constraint exists and active
- ✅ Correct arithmetic inserts succeed
- ✅ Wrong arithmetic inserts fail
- ✅ All existing data valid

---

### TEST #3: Verify Schedule Override Uniqueness (VJ-SCHED-001)

**Objective**: Confirm duplicate overrides are prevented.

```sql
-- TEST 3.1: Verify unique index exists
SELECT indexname, indexdef 
FROM pg_indexes 
WHERE indexname = 'idx_schedule_overrides_unique_per_stylist';
-- Expected: 1 row showing partial unique index

-- TEST 3.2: Test FIRST override (should succeed)
BEGIN;
INSERT INTO public.schedule_overrides (
  override_type,
  applies_to_all_stylists,
  stylist_user_id,
  start_date,
  end_date,
  is_closed,
  priority,
  created_by
) VALUES (
  'stylist_vacation',
  FALSE,
  (SELECT user_id FROM stylist_profiles LIMIT 1),
  '2025-12-31',
  '2025-12-31',
  TRUE,
  900,
  (SELECT user_id FROM stylist_profiles LIMIT 1)
);
-- Expected: SUCCESS

-- TEST 3.3: Test DUPLICATE override (should fail)
INSERT INTO public.schedule_overrides (
  override_type,
  applies_to_all_stylists,
  stylist_user_id,
  start_date,
  end_date,
  is_closed,
  priority,
  created_by
) VALUES (
  'stylist_vacation',
  FALSE,
  (SELECT user_id FROM stylist_profiles LIMIT 1),
  '2025-12-31',  -- SAME DATE
  '2025-12-31',  -- SAME DATE
  TRUE,
  900,
  (SELECT user_id FROM stylist_profiles LIMIT 1)
);
ROLLBACK;
-- Expected: ERROR - duplicate key value violates unique constraint

-- TEST 3.4: Test DIFFERENT stylist (should succeed)
BEGIN;
INSERT INTO public.schedule_overrides (
  override_type,
  applies_to_all_stylists,
  stylist_user_id,
  start_date,
  end_date,
  is_closed,
  priority,
  created_by
) VALUES (
  'stylist_vacation',
  FALSE,
  (SELECT user_id FROM stylist_profiles OFFSET 1 LIMIT 1),  -- Different stylist
  '2025-12-31',
  '2025-12-31',
  TRUE,
  900,
  (SELECT user_id FROM stylist_profiles OFFSET 1 LIMIT 1)
);
ROLLBACK;
-- Expected: SUCCESS (different stylist, same date is OK)

-- TEST 3.5: Verify no duplicates in existing data
SELECT stylist_user_id, start_date, end_date, COUNT(*) as duplicate_count
FROM public.schedule_overrides
WHERE stylist_user_id IS NOT NULL
GROUP BY stylist_user_id, start_date, end_date
HAVING COUNT(*) > 1;
-- Expected: 0 rows (no duplicates)
```

**Pass Criteria**:
- ✅ Unique index active
- ✅ First override succeeds
- ✅ Duplicate override fails
- ✅ Different stylist succeeds
- ✅ No existing duplicates

---

### TEST #4: Verify Advisory Lock (VJ-SCHED-002)

**Objective**: Confirm budget function uses advisory locks (requires concurrent testing).

```sql
-- TEST 4.1: Verify function contains advisory lock
SELECT prosrc 
FROM pg_proc 
WHERE proname = 'request_availability_override'
AND prosrc LIKE '%pg_try_advisory_xact_lock%';
-- Expected: 1 row (function contains lock code)

-- TEST 4.2: Verify function signature unchanged
SELECT 
  proname as function_name,
  pg_get_function_arguments(oid) as arguments
FROM pg_proc 
WHERE proname = 'request_availability_override';
-- Expected: Same signature as before (backwards compatible)

-- NOTE: Concurrency testing requires application-level test (see below)
```

**Pass Criteria**:
- ✅ Advisory lock code present
- ✅ Function signature unchanged

---

### TEST #5: Verify Cache Invalidation Trigger (VJ-SCHED-011)

**Objective**: Confirm cache is invalidated when overrides change.

```sql
-- TEST 5.1: Verify trigger exists
SELECT tgname, tgrelid::regclass, tgfoid::regproc 
FROM pg_trigger 
WHERE tgname = 'trigger_invalidate_cache_on_override';
-- Expected: 1 row showing trigger on schedule_overrides

-- TEST 5.2: Verify trigger fires on all operations
SELECT tgtype, tgname
FROM pg_trigger 
WHERE tgname = 'trigger_invalidate_cache_on_override';
-- Expected: tgtype includes INSERT, UPDATE, DELETE flags

-- TEST 5.3: Test cache invalidation on INSERT
BEGIN;
-- Create cache entry
INSERT INTO private.availability_cache (
  stylist_user_id,
  service_id,
  cache_date,
  available_slots,
  computed_at,
  expires_at
) VALUES (
  (SELECT user_id FROM stylist_profiles LIMIT 1),
  gen_random_uuid(),
  CURRENT_DATE + 7,
  '[]'::jsonb,
  NOW(),
  NOW() + INTERVAL '5 minutes'
);

-- Create override (should trigger cache deletion)
INSERT INTO public.schedule_overrides (
  override_type,
  applies_to_all_stylists,
  stylist_user_id,
  start_date,
  end_date,
  is_closed,
  priority,
  created_by
) VALUES (
  'stylist_vacation',
  FALSE,
  (SELECT user_id FROM stylist_profiles LIMIT 1),
  CURRENT_DATE + 7,
  CURRENT_DATE + 7,
  TRUE,
  900,
  (SELECT user_id FROM stylist_profiles LIMIT 1)
);

-- Verify cache was deleted
SELECT * FROM private.availability_cache 
WHERE stylist_user_id = (SELECT user_id FROM stylist_profiles LIMIT 1)
AND cache_date >= CURRENT_DATE;

ROLLBACK;
-- Expected: 0 rows (cache was invalidated)
```

**Pass Criteria**:
- ✅ Trigger exists
- ✅ Trigger fires on all operations
- ✅ Cache invalidated on INSERT
- ✅ Only affected stylist's cache deleted

---

## 🔌 API-LEVEL TESTS

### TEST #6: Budget Function with Lock (RPC)

**Objective**: Test request_availability_override with advisory lock.

**Setup**: Use Supabase Dashboard → SQL Editor or REST API

```javascript
// Test via JavaScript client
import { createClient } from '@supabase/supabase-js'

const supabase = createClient('[url]', '[anon_key]')

// TEST 6.1: Normal request (should succeed)
const { data, error } = await supabase.rpc('request_availability_override', {
  p_stylist_id: '[stylist_user_id]',
  p_target_date: '2025-12-25',
  p_is_closed: true,
  p_reason: 'Christmas holiday',
  p_is_emergency: false
})

console.log('Result:', data)
// Expected: { success: true, overrideId: '...', budget: {...} }

// TEST 6.2: Budget exhaustion (should fail gracefully)
// Create 10 overrides to exhaust budget, then try 11th
// Expected: { success: false, code: 'BUDGET_EXHAUSTED' }

// TEST 6.3: Past date (should fail)
const { data: pastData } = await supabase.rpc('request_availability_override', {
  p_stylist_id: '[stylist_user_id]',
  p_target_date: '2020-01-01',  // Past date
  p_is_closed: true
})
// Expected: { success: false, code: 'INVALID_DATE' }
```

**Pass Criteria**:
- ✅ Normal requests succeed
- ✅ Budget limits enforced
- ✅ Past dates rejected
- ✅ Error messages user-friendly

---

### TEST #7: Concurrent Budget Requests (CRITICAL)

**Objective**: Verify race condition is fixed.

**Tool Required**: Artillery, k6, or custom script

```javascript
// concurrent-test.js
// Run 5 simultaneous requests for same stylist

const requests = Array(5).fill(null).map((_, i) => 
  supabase.rpc('request_availability_override', {
    p_stylist_id: '[same_stylist_id]',
    p_target_date: '2025-12-26',
    p_is_closed: true,
    p_reason: `Concurrent test ${i}`
  })
)

const results = await Promise.all(requests)

const successes = results.filter(r => r.data?.success === true)
const failures = results.filter(r => r.data?.success === false)

console.log(`Successes: ${successes.length}`)
console.log(`Failures: ${failures.length}`)
console.log('Failure reasons:', failures.map(f => f.data?.code))

// Expected (if budget allows 1 more):
// - Successes: 0 or 1 (due to unique constraint on same date)
// - Failures: 4-5
// - Reasons: "CONCURRENT_REQUEST_IN_PROGRESS" or unique constraint error
```

**Pass Criteria**:
- ✅ At most 1 request succeeds (no budget bypass)
- ✅ Others get clear error message
- ✅ Budget counter accurate after test
- ✅ No database deadlocks

---

## 🖥️ APPLICATION-LEVEL TESTS

### TEST #8: Vendor Dashboard - Bank Account Viewing

**User Role**: Admin  
**Objective**: Verify encrypted bank accounts displayed correctly.

**Steps**:
1. Login as admin
2. Navigate to Vendors → Vendor List
3. Click on a vendor with bank account
4. View payout information section

**Expected**:
- ✅ Bank account number displayed (decrypted)
- ✅ Displayed format: `***-***-1234` (last 4 digits visible)
- ✅ No errors in console
- ✅ Decrypt operation logged in audit table

**Negative Test**:
1. Login as non-admin (vendor or customer)
2. Try to access bank account info via API

**Expected**:
- ✅ Access denied / unauthorized error
- ✅ No bank account data leaked

---

### TEST #9: Stylist Schedule Override (UI)

**User Role**: Stylist  
**Objective**: Verify uniqueness constraint in UI.

**Steps**:
1. Login as stylist
2. Navigate to Schedule Management
3. Click "Request Time Off"
4. Select date: Tomorrow
5. Submit request

**Expected**:
- ✅ Request succeeds
- ✅ Budget counter decrements
- ✅ Override appears in calendar

**Duplicate Test**:
6. Try to request time off for SAME date again
7. Submit request

**Expected**:
- ✅ Error message: "Override already exists for this date"
- ✅ Request blocked
- ✅ Budget NOT decremented again

---

### TEST #10: Availability Check After Override

**User Role**: Customer  
**Objective**: Verify cache invalidation works.

**Steps**:
1. Open customer app
2. Select stylist and service
3. View availability for next week
4. Note available time slots

**Background** (as stylist):
5. Stylist creates override for a visible date
6. Wait 1-2 seconds

**Resume (as customer)**:
7. Refresh availability calendar

**Expected**:
- ✅ Availability updated immediately (cache invalidated)
- ✅ Override date shows "Unavailable"
- ✅ No stale cache data
- ✅ No booking possible on override date

---

## 📊 TEST RESULTS TEMPLATE

```markdown
# P0 FIXES TEST RESULTS
**Date**: [Date]  
**Tester**: [Name]  
**Environment**: [Staging/Production]  
**Version**: [Migration versions]

## Summary
- Total Tests: 10
- Passed: __
- Failed: __
- Blocked: __

## Detailed Results

### FIX #1: Encryption (VJ-SEC-001)
- [ ] Database Test #1: PASS / FAIL
- [ ] Application Test #8: PASS / FAIL
- **Issues**: [List any issues]

### FIX #2: Payout Constraint (VJ-DATA-002)
- [ ] Database Test #2: PASS / FAIL
- **Issues**: [List any issues]

### FIX #3: Unique Constraint (VJ-SCHED-001)
- [ ] Database Test #3: PASS / FAIL
- [ ] Application Test #9: PASS / FAIL
- **Issues**: [List any issues]

### FIX #4: Advisory Lock (VJ-SCHED-002)
- [ ] Database Test #4: PASS / FAIL
- [ ] API Test #6: PASS / FAIL
- [ ] Concurrency Test #7: PASS / FAIL
- **Issues**: [List any issues]

### FIX #5: Cache Invalidation (VJ-SCHED-011)
- [ ] Database Test #5: PASS / FAIL
- [ ] Application Test #10: PASS / FAIL
- **Issues**: [List any issues]

## Overall Verdict
- [ ] ✅ ALL TESTS PASSED - Ready for production
- [ ] ⚠️ MINOR ISSUES - Document and proceed
- [ ] ❌ CRITICAL FAILURES - Do not deploy

## Notes
[Additional observations, performance metrics, etc.]
```

---

## 🎯 ACCEPTANCE CRITERIA

**Production deployment approved ONLY if**:

1. **All database tests pass** (Tests #1-5)
2. **All API tests pass** (Tests #6-7)
3. **All application tests pass** (Tests #8-10)
4. **Concurrency test shows no race condition** (Test #7)
5. **Performance acceptable** (< 200ms response time)
6. **Zero data loss** verified
7. **Rollback procedure tested** on staging

---

## 🚀 NEXT STEPS AFTER TESTING

1. **Document results** using template above
2. **Fix any issues** found during testing
3. **Re-test** after fixes
4. **Get approval** from technical lead
5. **Deploy to production** using deployment guide
6. **Monitor** for 24-48 hours post-deployment

---

**Testing Guide Prepared By**: Claude Sonnet 4.5  
**Protocol**: Universal AI Excellence Protocol  
**Test Coverage**: 100% of P0 fixes  
**Estimated Time**: 2-3 hours (thorough testing)
