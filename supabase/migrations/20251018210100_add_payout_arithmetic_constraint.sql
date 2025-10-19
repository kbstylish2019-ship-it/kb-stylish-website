-- =====================================================================
-- KB STYLISH - FORENSIC RESTORATION FIX #2
-- Migration: Add Payout Arithmetic Constraint
-- Issue: VJ-DATA-002 - Payout arithmetic not enforced at database level
-- Severity: P0 CRITICAL - CVSS 7.8
-- Created: 2025-10-18 21:01:00 NPT
-- =====================================================================
--
-- PROBLEM:
-- The payouts table does not enforce that:
-- net_amount_cents = amount_cents - platform_fees_cents
--
-- This allows incorrect payouts to be inserted:
-- INSERT INTO payouts (amount_cents, platform_fees_cents, net_amount_cents)
-- VALUES (10000, 1500, 9999);  -- WRONG! Should be 8500
--
-- IMPACT:
-- - Platform could overpay vendors by thousands
-- - Revenue leakage
-- - Accounting reconciliation nightmare
--
-- SOLUTION:
-- Add CHECK constraint to enforce arithmetic at database level.
-- This prevents ANY incorrect payout from being inserted/updated.
--
-- TESTING:
-- After migration, try: INSERT INTO payouts with wrong math → should FAIL
-- =====================================================================

BEGIN;

-- =====================================================================
-- STEP 1: VERIFY EXISTING DATA INTEGRITY
-- =====================================================================

-- First, check if any existing records violate the constraint
DO $$
DECLARE
  v_bad_count INTEGER;
  v_bad_records TEXT;
BEGIN
  SELECT COUNT(*) INTO v_bad_count
  FROM public.payouts
  WHERE net_amount_cents != (amount_cents - platform_fees_cents);
  
  IF v_bad_count > 0 THEN
    -- Get details of bad records for logging
    SELECT string_agg(
      format('ID: %s, Amount: %s, Fees: %s, Net: %s (Expected: %s)',
        id,
        amount_cents,
        platform_fees_cents,
        net_amount_cents,
        amount_cents - platform_fees_cents
      ),
      E'\n'
    ) INTO v_bad_records
    FROM public.payouts
    WHERE net_amount_cents != (amount_cents - platform_fees_cents)
    LIMIT 10;
    
    RAISE EXCEPTION E'Cannot add constraint - % existing records violate arithmetic rule:\n%', 
      v_bad_count, v_bad_records;
  ELSE
    RAISE NOTICE 'Data integrity check PASSED - All existing payouts have correct arithmetic';
  END IF;
END $$;

-- =====================================================================
-- STEP 2: ADD CHECK CONSTRAINT
-- =====================================================================

-- Add constraint to enforce: net_amount_cents = amount_cents - platform_fees_cents
ALTER TABLE public.payouts
ADD CONSTRAINT payouts_arithmetic_check
CHECK (net_amount_cents = (amount_cents - platform_fees_cents));

COMMENT ON CONSTRAINT payouts_arithmetic_check ON public.payouts IS 
'Enforces payout arithmetic: net_amount_cents must equal amount_cents minus platform_fees_cents. Prevents financial calculation errors.';

-- =====================================================================
-- STEP 3: VERIFY CONSTRAINT IS ACTIVE
-- =====================================================================

DO $$
DECLARE
  v_constraint_exists BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 
    FROM pg_constraint 
    WHERE conname = 'payouts_arithmetic_check'
    AND conrelid = 'public.payouts'::regclass
  ) INTO v_constraint_exists;
  
  IF v_constraint_exists THEN
    RAISE NOTICE '==========================================';
    RAISE NOTICE 'PAYOUT ARITHMETIC CONSTRAINT ADDED';
    RAISE NOTICE 'Table: public.payouts';
    RAISE NOTICE 'Constraint: payouts_arithmetic_check';
    RAISE NOTICE 'Rule: net = amount - fees';
    RAISE NOTICE 'Status: ACTIVE';
    RAISE NOTICE '==========================================';
  ELSE
    RAISE EXCEPTION 'Constraint creation failed';
  END IF;
END $$;

COMMIT;

-- =====================================================================
-- TESTING (Run after migration)
-- =====================================================================
--
-- Test 1: Correct arithmetic should work
-- INSERT INTO payouts (
--   vendor_id, amount_cents, platform_fees_cents, net_amount_cents, status
-- ) VALUES (
--   '[vendor_id]', 10000, 1500, 8500, 'pending'
-- );
-- Expected: SUCCESS
--
-- Test 2: Wrong arithmetic should FAIL
-- INSERT INTO payouts (
--   vendor_id, amount_cents, platform_fees_cents, net_amount_cents, status
-- ) VALUES (
--   '[vendor_id]', 10000, 1500, 9999, 'pending'
-- );
-- Expected: ERROR - new row for relation "payouts" violates check constraint "payouts_arithmetic_check"
--
-- =====================================================================

-- =====================================================================
-- ROLLBACK PROCEDURE (if needed)
-- =====================================================================
--
-- To remove this constraint:
-- ALTER TABLE public.payouts DROP CONSTRAINT payouts_arithmetic_check;
--
-- =====================================================================
