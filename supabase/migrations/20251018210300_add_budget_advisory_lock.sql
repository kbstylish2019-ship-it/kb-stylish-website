-- =====================================================================
-- KB STYLISH - FORENSIC RESTORATION FIX #4
-- Migration: Add Advisory Lock to Budget Function
-- Issue: VJ-SCHED-002 - Budget race condition bypasses limits
-- Severity: P0 CRITICAL - CVSS 7.2
-- Created: 2025-10-18 21:03:00 NPT
-- =====================================================================
--
-- PROBLEM:
-- request_availability_override() function has race condition:
-- 
-- Flow:
-- 1. SELECT current_month_overrides (= 9)
-- 2. Check if 9 < 10 (PASS)
-- 3. INSERT override
-- 4. UPDATE current_month_overrides = 10
--
-- Race Condition: If 3 concurrent requests execute step 1 simultaneously:
-- - All 3 see current_month_overrides = 9
-- - All 3 pass budget check (9 < 10)
-- - All 3 create overrides
-- - Result: current_month_overrides = 12 (LIMIT BYPASSED!)
--
-- IMPACT:
-- - Budget limits completely ineffective under concurrent load
-- - Stylist can bypass monthly override limit
-- - System design assumption violated
--
-- SOLUTION:
-- Add pg_try_advisory_xact_lock at start of function to serialize requests
-- per stylist. Only ONE override request can process at a time per stylist.
--
-- =====================================================================

BEGIN;

-- =====================================================================
-- STEP 1: RECREATE FUNCTION WITH ADVISORY LOCK
-- =====================================================================

CREATE OR REPLACE FUNCTION public.request_availability_override(
  p_stylist_id UUID,
  p_target_date DATE,
  p_is_closed BOOLEAN DEFAULT TRUE,
  p_reason TEXT DEFAULT NULL,
  p_is_emergency BOOLEAN DEFAULT FALSE
)
RETURNS JSONB
SECURITY DEFINER  -- Budget enforcement requires elevated access
SET search_path = 'public', 'private', 'pg_temp'
LANGUAGE plpgsql
AS $$
DECLARE
  v_budget_record RECORD;
  v_override_id UUID;
  v_lock_acquired BOOLEAN;
  v_lock_key BIGINT;
BEGIN
  -- ========================================================================
  -- CONCURRENCY FIX: Acquire advisory lock
  -- ========================================================================
  
  -- Generate deterministic lock key from stylist ID
  -- This ensures all requests for same stylist use same lock
  v_lock_key := hashtext(p_stylist_id::text || '_override_budget');
  
  -- Try to acquire transaction-level advisory lock
  -- This lock is automatically released at end of transaction
  SELECT pg_try_advisory_xact_lock(v_lock_key) INTO v_lock_acquired;
  
  IF NOT v_lock_acquired THEN
    -- Another request is processing for this stylist
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Another override request is currently being processed. Please try again in a moment.',
      'code', 'CONCURRENT_REQUEST_IN_PROGRESS'
    );
  END IF;
  
  -- Lock acquired - proceed with budget check
  -- No other request for this stylist can proceed until this transaction completes
  
  -- ========================================================================
  -- SECURITY LAYER 1: Verify stylist role
  -- ========================================================================
  
  IF NOT public.user_has_role(p_stylist_id, 'stylist') THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Unauthorized: Stylist role required',
      'code', 'UNAUTHORIZED'
    );
  END IF;

  -- ========================================================================
  -- SECURITY LAYER 2: Verify active stylist profile
  -- ========================================================================
  
  IF NOT EXISTS (
    SELECT 1 FROM public.stylist_profiles 
    WHERE user_id = p_stylist_id AND is_active = true
  ) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Stylist profile not found or inactive',
      'code', 'NOT_FOUND'
    );
  END IF;

  -- ========================================================================
  -- VALIDATION: Date must be in future
  -- ========================================================================
  
  IF p_target_date < CURRENT_DATE THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Cannot request override for past dates',
      'code', 'INVALID_DATE'
    );
  END IF;

  -- ========================================================================
  -- BUDGET CHECK: Get or initialize budget
  -- ========================================================================
  
  -- Use FOR UPDATE to lock the row (belt-and-suspenders with advisory lock)
  SELECT 
    monthly_override_limit,
    current_month_overrides,
    emergency_overrides_remaining,
    budget_reset_at
  INTO v_budget_record
  FROM public.stylist_override_budgets
  WHERE stylist_user_id = p_stylist_id
  FOR UPDATE;  -- Row-level lock

  -- Initialize budget if doesn't exist (first-time stylist)
  IF v_budget_record IS NULL THEN
    INSERT INTO public.stylist_override_budgets (stylist_user_id)
    VALUES (p_stylist_id)
    RETURNING 
      monthly_override_limit,
      current_month_overrides,
      emergency_overrides_remaining,
      budget_reset_at
    INTO v_budget_record;
  END IF;

  -- Check if monthly budget reset is needed
  IF v_budget_record.budget_reset_at <= NOW() THEN
    UPDATE public.stylist_override_budgets
    SET 
      current_month_overrides = 0,
      budget_reset_at = date_trunc('month', NOW() + INTERVAL '1 month'),
      updated_at = NOW()
    WHERE stylist_user_id = p_stylist_id;
    
    -- Re-fetch after reset to get fresh values
    SELECT 
      monthly_override_limit,
      current_month_overrides,
      emergency_overrides_remaining,
      budget_reset_at
    INTO v_budget_record
    FROM public.stylist_override_budgets
    WHERE stylist_user_id = p_stylist_id;
  END IF;

  -- ========================================================================
  -- BUDGET ENFORCEMENT: Check availability
  -- ========================================================================
  
  IF p_is_emergency THEN
    IF v_budget_record.emergency_overrides_remaining <= 0 THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'Emergency override budget exhausted',
        'code', 'BUDGET_EXHAUSTED',
        'budget', jsonb_build_object(
          'monthlyRemaining', v_budget_record.monthly_override_limit - v_budget_record.current_month_overrides,
          'emergencyRemaining', 0,
          'resetsAt', v_budget_record.budget_reset_at
        )
      );
    END IF;
  ELSE
    IF v_budget_record.current_month_overrides >= v_budget_record.monthly_override_limit THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', format('Monthly override budget exhausted (%s/%s used)', 
                       v_budget_record.current_month_overrides, 
                       v_budget_record.monthly_override_limit),
        'code', 'BUDGET_EXHAUSTED',
        'budget', jsonb_build_object(
          'monthlyRemaining', 0,
          'emergencyRemaining', v_budget_record.emergency_overrides_remaining,
          'resetsAt', v_budget_record.budget_reset_at
        )
      );
    END IF;
  END IF;

  -- ========================================================================
  -- CREATE OVERRIDE REQUEST
  -- ========================================================================
  
  INSERT INTO public.schedule_overrides (
    override_type,
    applies_to_all_stylists,
    stylist_user_id,
    start_date,
    end_date,
    is_closed,
    priority,
    reason,
    created_by
  )
  VALUES (
    'stylist_vacation'::TEXT,
    FALSE,
    p_stylist_id,
    p_target_date,
    p_target_date,
    p_is_closed,
    CASE WHEN p_is_emergency THEN 950 ELSE 900 END,  -- Emergency: higher priority
    COALESCE(p_reason, 'Stylist requested override'),
    p_stylist_id
  )
  RETURNING id INTO v_override_id;

  -- ========================================================================
  -- UPDATE BUDGET
  -- ========================================================================
  
  IF p_is_emergency THEN
    UPDATE public.stylist_override_budgets
    SET 
      emergency_overrides_remaining = emergency_overrides_remaining - 1,
      last_override_at = NOW(),
      updated_at = NOW()
    WHERE stylist_user_id = p_stylist_id;
  ELSE
    UPDATE public.stylist_override_budgets
    SET 
      current_month_overrides = current_month_overrides + 1,
      last_override_at = NOW(),
      updated_at = NOW()
    WHERE stylist_user_id = p_stylist_id;
  END IF;

  -- ========================================================================
  -- LOG CHANGE (Audit trail for admin review)
  -- ========================================================================
  
  INSERT INTO private.schedule_change_log (
    stylist_user_id,
    change_date,
    change_type,
    reason,
    is_emergency,
    ip_address,
    user_agent
  )
  VALUES (
    p_stylist_id,
    p_target_date,
    'availability_override',
    p_reason,
    p_is_emergency,
    inet_client_addr(),
    current_setting('request.headers', true)::json->>'user-agent'
  );

  -- ========================================================================
  -- RETURN SUCCESS
  -- ========================================================================
  
  RETURN jsonb_build_object(
    'success', true,
    'overrideId', v_override_id,
    'budget', jsonb_build_object(
      'monthlyUsed', v_budget_record.current_month_overrides + CASE WHEN NOT p_is_emergency THEN 1 ELSE 0 END,
      'monthlyLimit', v_budget_record.monthly_override_limit,
      'monthlyRemaining', v_budget_record.monthly_override_limit - (v_budget_record.current_month_overrides + CASE WHEN NOT p_is_emergency THEN 1 ELSE 0 END),
      'emergencyRemaining', v_budget_record.emergency_overrides_remaining - CASE WHEN p_is_emergency THEN 1 ELSE 0 END,
      'resetsAt', v_budget_record.budget_reset_at
    ),
    'message', 'Override request created successfully'
  );

EXCEPTION WHEN OTHERS THEN
  -- Advisory lock automatically released on exception
  RETURN jsonb_build_object(
    'success', false,
    'error', SQLERRM,
    'code', 'INTERNAL_ERROR'
  );
END;
$$;

-- Grant permissions (unchanged)
GRANT EXECUTE ON FUNCTION public.request_availability_override TO authenticated;

COMMENT ON FUNCTION public.request_availability_override IS 
'Allows stylists to request schedule overrides with budget tracking. RACE CONDITION FIX: Uses advisory lock to prevent concurrent budget bypasses. Normal: 10/month, Emergency: 3/lifetime. SECURITY DEFINER with role verification. Logs all requests to schedule_change_log. Returns updated budget status.';

-- =====================================================================
-- VERIFICATION
-- =====================================================================

DO $$
BEGIN
  RAISE NOTICE '==========================================';
  RAISE NOTICE 'BUDGET RACE CONDITION FIX APPLIED';
  RAISE NOTICE 'Function: request_availability_override';
  RAISE NOTICE 'Fix: pg_try_advisory_xact_lock added';
  RAISE NOTICE 'Concurrency: Serialized per stylist';
  RAISE NOTICE 'Additional: FOR UPDATE lock on budget row';
  RAISE NOTICE 'Status: ACTIVE';
  RAISE NOTICE '==========================================';
END $$;

COMMIT;

-- =====================================================================
-- TESTING (Concurrent Load Test Required)
-- =====================================================================
--
-- Test 1: Sequential requests should work normally
-- SELECT request_availability_override('[stylist_id]', CURRENT_DATE + 1);
-- Expected: SUCCESS
--
-- Test 2: Concurrent requests (requires load testing tool)
-- Run 10 simultaneous requests for same stylist:
-- for i in {1..10}; do
--   psql -c "SELECT request_availability_override('[stylist_id]', CURRENT_DATE + 1);" &
-- done
-- Expected: Only 1 should succeed (if budget allows)
--          Others should get "CONCURRENT_REQUEST_IN_PROGRESS" error
--
-- Test 3: Different stylists concurrent (should not block each other)
-- Simultaneously:
--   SELECT request_availability_override('[stylist_1]', CURRENT_DATE + 1);
--   SELECT request_availability_override('[stylist_2]', CURRENT_DATE + 1);
-- Expected: Both SUCCESS (different lock keys)
--
-- =====================================================================

-- =====================================================================
-- ROLLBACK PROCEDURE (if needed)
-- =====================================================================
--
-- Restore original function from migration 20251015194000:
-- (Copy original function from that file)
--
-- =====================================================================
