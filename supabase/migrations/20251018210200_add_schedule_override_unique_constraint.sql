-- =====================================================================
-- KB STYLISH - FORENSIC RESTORATION FIX #3
-- Migration: Add UNIQUE Constraint on Schedule Overrides
-- Issue: VJ-SCHED-001 - Duplicate overrides allowed
-- Severity: P0 CRITICAL - CVSS 6.5
-- Created: 2025-10-18 21:02:00 NPT
-- =====================================================================
--
-- PROBLEM:
-- schedule_overrides table has no UNIQUE constraint on:
-- (stylist_user_id, start_date, end_date)
--
-- EXPLOIT SCENARIO:
-- Stylist can submit 10 override requests for same date:
-- for (let i = 0; i < 10; i++) {
--   await requestOverride({ date: '2025-10-20' });
-- }
-- Result: Budget charged 10x, database bloat, unclear which override wins
--
-- IMPACT:
-- - Budget system completely broken
-- - Stylist can use 1 day but consume entire month's budget
-- - Database filled with duplicate records
-- - Availability calculation confusion
--
-- SOLUTION:
-- Add partial UNIQUE constraint:
-- - Only for stylist-specific overrides (stylist_user_id NOT NULL)
-- - Allow multiple business-wide closures on same date
-- - Prevent duplicate personal overrides
--
-- =====================================================================

BEGIN;

-- =====================================================================
-- STEP 1: CHECK FOR EXISTING DUPLICATES
-- =====================================================================

DO $$
DECLARE
  v_dup_count INTEGER;
  v_duplicates TEXT;
BEGIN
  -- Find duplicate overrides (same stylist, same date range)
  SELECT COUNT(*) INTO v_dup_count
  FROM (
    SELECT stylist_user_id, start_date, end_date, COUNT(*) as dup_count
    FROM public.schedule_overrides
    WHERE stylist_user_id IS NOT NULL
    GROUP BY stylist_user_id, start_date, end_date
    HAVING COUNT(*) > 1
  ) duplicates;
  
  IF v_dup_count > 0 THEN
    -- Get details for logging
    SELECT string_agg(
      format('Stylist: %s, Date: %s to %s, Count: %s',
        stylist_user_id,
        start_date,
        end_date,
        dup_count
      ),
      E'\n'
    ) INTO v_duplicates
    FROM (
      SELECT stylist_user_id, start_date, end_date, COUNT(*) as dup_count
      FROM public.schedule_overrides
      WHERE stylist_user_id IS NOT NULL
      GROUP BY stylist_user_id, start_date, end_date
      HAVING COUNT(*) > 1
    ) dups
    LIMIT 10;
    
    RAISE WARNING E'Found % sets of duplicate overrides:\n%', v_dup_count, v_duplicates;
    RAISE NOTICE 'Will attempt to deduplicate before adding constraint...';
  ELSE
    RAISE NOTICE 'No duplicate overrides found - safe to add constraint';
  END IF;
END $$;

-- =====================================================================
-- STEP 2: DEDUPLICATE EXISTING RECORDS (if needed)
-- =====================================================================

-- Keep only the most recent override for each (stylist, date range) combination
-- Delete older duplicates
DO $$
DECLARE
  v_deleted_count INTEGER;
BEGIN
  WITH duplicates AS (
    SELECT 
      id,
      ROW_NUMBER() OVER (
        PARTITION BY stylist_user_id, start_date, end_date 
        ORDER BY created_at DESC, id DESC
      ) as row_num
    FROM public.schedule_overrides
    WHERE stylist_user_id IS NOT NULL
  )
  DELETE FROM public.schedule_overrides
  WHERE id IN (
    SELECT id FROM duplicates WHERE row_num > 1
  );
  
  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
  
  IF v_deleted_count > 0 THEN
    RAISE NOTICE 'Deleted % duplicate override records (kept most recent)', v_deleted_count;
  ELSE
    RAISE NOTICE 'No duplicates to remove';
  END IF;
END $$;

-- =====================================================================
-- STEP 3: ADD UNIQUE CONSTRAINT
-- =====================================================================

-- Partial UNIQUE index - only for stylist-specific overrides
-- Allows multiple business-wide closures (applies_to_all_stylists = TRUE)
CREATE UNIQUE INDEX idx_schedule_overrides_unique_per_stylist
ON public.schedule_overrides(stylist_user_id, start_date, end_date)
WHERE stylist_user_id IS NOT NULL;

COMMENT ON INDEX idx_schedule_overrides_unique_per_stylist IS 
'Prevents duplicate override requests for same stylist and date range. Only applies to stylist-specific overrides (not business-wide closures).';

-- =====================================================================
-- ALTERNATIVE: Use UNIQUE CONSTRAINT instead of index
-- =====================================================================

-- Note: PostgreSQL allows partial UNIQUE constraints via partial unique indexes
-- The above index serves as a UNIQUE constraint with the WHERE clause

-- If you prefer explicit constraint syntax (does the same thing):
-- ALTER TABLE public.schedule_overrides
-- ADD CONSTRAINT schedule_overrides_unique_per_stylist
-- UNIQUE (stylist_user_id, start_date, end_date)
-- WHERE stylist_user_id IS NOT NULL;

-- =====================================================================
-- STEP 4: VERIFY CONSTRAINT IS ACTIVE
-- =====================================================================

DO $$
DECLARE
  v_index_exists BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 
    FROM pg_indexes 
    WHERE indexname = 'idx_schedule_overrides_unique_per_stylist'
    AND tablename = 'schedule_overrides'
  ) INTO v_index_exists;
  
  IF v_index_exists THEN
    RAISE NOTICE '==========================================';
    RAISE NOTICE 'UNIQUE CONSTRAINT ADDED SUCCESSFULLY';
    RAISE NOTICE 'Table: public.schedule_overrides';
    RAISE NOTICE 'Index: idx_schedule_overrides_unique_per_stylist';
    RAISE NOTICE 'Rule: (stylist_user_id, start_date, end_date) UNIQUE';
    RAISE NOTICE 'Scope: stylist-specific overrides only';
    RAISE NOTICE 'Status: ACTIVE';
    RAISE NOTICE '==========================================';
  ELSE
    RAISE EXCEPTION 'Unique index creation failed';
  END IF;
END $$;

COMMIT;

-- =====================================================================
-- TESTING (Run after migration)
-- =====================================================================
--
-- Test 1: First override should work
-- INSERT INTO schedule_overrides (
--   override_type, applies_to_all_stylists, stylist_user_id,
--   start_date, end_date, is_closed, priority, created_by
-- ) VALUES (
--   'stylist_vacation', FALSE, '[stylist_id]',
--   '2025-10-20', '2025-10-20', TRUE, 900, '[stylist_id]'
-- );
-- Expected: SUCCESS
--
-- Test 2: Duplicate override should FAIL
-- INSERT INTO schedule_overrides (
--   override_type, applies_to_all_stylists, stylist_user_id,
--   start_date, end_date, is_closed, priority, created_by
-- ) VALUES (
--   'stylist_vacation', FALSE, '[stylist_id]',
--   '2025-10-20', '2025-10-20', TRUE, 900, '[stylist_id]'
-- );
-- Expected: ERROR - duplicate key value violates unique constraint
--
-- Test 3: Different stylist on same date should work
-- INSERT INTO schedule_overrides (
--   override_type, applies_to_all_stylists, stylist_user_id,
--   start_date, end_date, is_closed, priority, created_by
-- ) VALUES (
--   'stylist_vacation', FALSE, '[different_stylist_id]',
--   '2025-10-20', '2025-10-20', TRUE, 900, '[different_stylist_id]'
-- );
-- Expected: SUCCESS
--
-- Test 4: Business-wide closure (multiple allowed)
-- INSERT INTO schedule_overrides (
--   override_type, applies_to_all_stylists, stylist_user_id,
--   start_date, end_date, is_closed, priority, created_by
-- ) VALUES (
--   'business_closure', TRUE, NULL,
--   '2025-10-20', '2025-10-20', TRUE, 1000, '[admin_id]'
-- );
-- Expected: SUCCESS (can have multiple business closures)
--
-- =====================================================================

-- =====================================================================
-- ROLLBACK PROCEDURE (if needed)
-- =====================================================================
--
-- To remove this constraint:
-- DROP INDEX IF EXISTS idx_schedule_overrides_unique_per_stylist;
--
-- =====================================================================
