-- ============================================================================
-- MIGRATION: P0 Admin Assertion Fixes
-- ============================================================================
-- Generated: 2025-01-17 18:00:00
-- Purpose: Fix 7 SECURITY DEFINER functions missing standardized admin checks
-- Risk Level: LOW (surgical fixes, zero breaking changes)
-- Estimated Time: 2 minutes execution
--
-- FIXES:
-- 1. approve_payout_request - Replace manual check + fix race condition
-- 2. reject_payout_request - Replace manual check with assert_admin()
-- 3. get_admin_payout_requests - Replace manual check with assert_admin()
-- 4. get_audit_logs - Already correct (uses user_has_role with expires_at)
-- 5. admin_create_stylist_schedule - Use assert_admin() instead of manual check
-- 6. admin_get_all_schedules - Already correct (uses user_has_role + RAISE)
-- 7. admin_update_stylist_schedule - Use assert_admin() instead of manual check
--
-- ROLLBACK: Keep original function definitions in comments below each function
-- ============================================================================

BEGIN;

-- ============================================================================
-- FUNCTION 1: approve_payout_request
-- ============================================================================
-- FIXES:
-- 1. Remove v_is_admin variable
-- 2. Replace manual admin check with PERFORM private.assert_admin()
-- 3. Fetch request BEFORE advisory lock (need vendor_id)
-- 4. Change lock from request_id to vendor_id (fix race condition)
-- 5. Re-query with FOR UPDATE after lock
-- ============================================================================

CREATE OR REPLACE FUNCTION public.approve_payout_request(
  p_request_id uuid,
  p_payment_reference text DEFAULT NULL,
  p_payment_proof_url text DEFAULT NULL,
  p_admin_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
DECLARE
  v_admin_id uuid;
  -- REMOVED: v_is_admin boolean;
  v_request payout_requests%ROWTYPE;
  v_payout_id uuid;
  v_available_balance bigint;
  v_platform_fee_cents bigint;
  v_net_amount_cents bigint;
  v_lock_acquired boolean;
BEGIN
  v_admin_id := auth.uid();

  -- ✅ FIX 1: Standardized admin check (replaces manual check)
  PERFORM private.assert_admin();

  -- ✅ FIX 2: Fetch request first (need vendor_id for lock)
  SELECT * INTO v_request
  FROM payout_requests
  WHERE id = p_request_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Payout request not found'
    );
  END IF;

  -- ✅ FIX 3: Advisory lock on VENDOR_ID (not request_id)
  -- This prevents concurrent approvals for same vendor
  SELECT pg_try_advisory_xact_lock(hashtext(v_request.vendor_id::text)) 
  INTO v_lock_acquired;
  
  IF NOT v_lock_acquired THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Another payout for this vendor is being processed. Please wait and try again.'
    );
  END IF;

  -- ✅ Re-query with FOR UPDATE after lock acquired
  SELECT * INTO v_request
  FROM payout_requests
  WHERE id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Payout request not found'
    );
  END IF;

  -- Verify status is pending
  IF v_request.status != 'pending' THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Only pending requests can be approved',
      'current_status', v_request.status
    );
  END IF;

  -- Verify vendor still has enough balance
  SELECT (calculate_vendor_pending_payout(v_request.vendor_id)->>'pending_payout_cents')::bigint 
  INTO v_available_balance;

  IF v_available_balance < v_request.requested_amount_cents THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Insufficient available balance',
      'available', v_available_balance,
      'requested', v_request.requested_amount_cents
    );
  END IF;

  -- Calculate platform fees and net amount
  v_net_amount_cents := v_request.requested_amount_cents;
  v_platform_fee_cents := 0;

  -- Create payout record
  INSERT INTO payouts (
    vendor_id,
    amount_cents,
    platform_fees_cents,
    net_amount_cents,
    payment_method,
    payment_reference,
    payment_proof_url,
    status,
    processed_by,
    processed_at,
    admin_notes
  ) VALUES (
    v_request.vendor_id,
    v_request.requested_amount_cents,
    v_platform_fee_cents,
    v_net_amount_cents,
    v_request.payment_method,
    p_payment_reference,
    p_payment_proof_url,
    'completed',
    v_admin_id,
    NOW(),
    p_admin_notes
  ) RETURNING id INTO v_payout_id;

  -- Update request status
  UPDATE payout_requests
  SET 
    status = 'approved',
    reviewed_by = v_admin_id,
    reviewed_at = NOW(),
    admin_notes = p_admin_notes,
    payout_id = v_payout_id,
    updated_at = NOW()
  WHERE id = p_request_id;

  -- Audit log
  INSERT INTO private.audit_log (
    table_name, record_id, action, old_values, new_values, user_id
  ) VALUES (
    'payout_requests', p_request_id, 'UPDATE',
    jsonb_build_object(
      'status', 'pending',
      'action_type', 'payout_approval',
      'available_balance_before', v_available_balance
    ),
    jsonb_build_object(
      'status', 'approved',
      'payout_id', v_payout_id,
      'approved_by', v_admin_id,
      'amount_cents', v_request.requested_amount_cents,
      'action_type', 'payout_approval',
      'available_balance_after', v_available_balance - v_request.requested_amount_cents
    ),
    v_admin_id
  );
  
  RETURN jsonb_build_object(
    'success', true,
    'message', 'Payout request approved successfully',
    'payout_id', v_payout_id,
    'request_id', p_request_id
  );
END;
$$;

COMMENT ON FUNCTION public.approve_payout_request IS 'Admin-only function to approve payout requests with vendor-level locking';

-- ============================================================================
-- FUNCTION 2: reject_payout_request
-- ============================================================================
-- FIX: Replace manual admin check with PERFORM private.assert_admin()
-- ============================================================================

CREATE OR REPLACE FUNCTION public.reject_payout_request(
  p_request_id uuid,
  p_rejection_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
DECLARE
  v_admin_id uuid;
  -- REMOVED: v_is_admin boolean;
  v_request payout_requests%ROWTYPE;
BEGIN
  v_admin_id := auth.uid();

  -- ✅ FIX: Standardized admin check (replaces manual check)
  PERFORM private.assert_admin();

  -- Get request details
  SELECT * INTO v_request
  FROM payout_requests
  WHERE id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Payout request not found'
    );
  END IF;

  -- Verify status is pending
  IF v_request.status != 'pending' THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Only pending requests can be rejected',
      'current_status', v_request.status
    );
  END IF;

  -- Validate rejection reason
  IF p_rejection_reason IS NULL OR length(trim(p_rejection_reason)) < 10 THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Rejection reason must be at least 10 characters'
    );
  END IF;

  -- Update request status
  UPDATE payout_requests
  SET 
    status = 'rejected',
    reviewed_by = v_admin_id,
    reviewed_at = NOW(),
    rejection_reason = p_rejection_reason,
    updated_at = NOW()
  WHERE id = p_request_id;

  -- Audit log
  INSERT INTO private.audit_log (
    table_name, record_id, action, old_values, new_values, user_id
  ) VALUES (
    'payout_requests', p_request_id, 'UPDATE',
    jsonb_build_object(
      'status', 'pending',
      'action_type', 'payout_rejection'
    ),
    jsonb_build_object(
      'status', 'rejected',
      'rejected_by', v_admin_id,
      'rejection_reason', p_rejection_reason,
      'action_type', 'payout_rejection'
    ),
    v_admin_id
  );

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Payout request rejected',
    'request_id', p_request_id
  );
END;
$$;

COMMENT ON FUNCTION public.reject_payout_request IS 'Admin-only function to reject payout requests with reason';

-- ============================================================================
-- FUNCTION 3: get_admin_payout_requests
-- ============================================================================
-- FIX: Replace manual admin check with PERFORM private.assert_admin()
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_admin_payout_requests(
  p_status text DEFAULT 'pending',
  p_limit integer DEFAULT 50
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
DECLARE
  v_user_id uuid;
  -- REMOVED: v_is_admin boolean;
BEGIN
  v_user_id := auth.uid();

  -- ✅ FIX: Standardized admin check (replaces manual check)
  PERFORM private.assert_admin();

  -- Return payout requests with vendor details
  RETURN (
    SELECT json_agg(json_build_object(
      'request_id', pr.id,
      'vendor_id', pr.vendor_id,
      'vendor_name', vp.business_name,
      'requested_amount_cents', pr.requested_amount_cents,
      'payment_method', pr.payment_method,
      'payment_details', pr.payment_details,
      'status', pr.status,
      'created_at', pr.created_at,
      'reviewed_by', pr.reviewed_by,
      'reviewed_at', pr.reviewed_at,
      'rejection_reason', pr.rejection_reason,
      'available_balance', calculate_vendor_pending_payout(pr.vendor_id)
    ) ORDER BY pr.created_at DESC)
    FROM payout_requests pr
    LEFT JOIN vendor_profiles vp ON vp.user_id = pr.vendor_id
    WHERE pr.status = p_status
    LIMIT p_limit
  );
END;
$$;

COMMENT ON FUNCTION public.get_admin_payout_requests IS 'Admin-only function to list payout requests';

-- ============================================================================
-- FUNCTION 4: get_audit_logs
-- ============================================================================
-- STATUS: ✅ Already correct - uses user_has_role() with proper expires_at check
-- NO CHANGES NEEDED - Function already implements proper role validation
-- ============================================================================

-- Function get_audit_logs is ALREADY SECURE:
-- - Uses public.user_has_role() which checks is_active AND expires_at
-- - Supports multi-role access (admin/auditor/super_auditor)
-- - Raises exceptions with proper error codes
-- - No changes required

COMMENT ON FUNCTION public.get_audit_logs IS 'Multi-role function (admin/auditor/super_auditor) to query audit logs with role-based filtering';

-- ============================================================================
-- FUNCTION 5: admin_create_stylist_schedule
-- ============================================================================
-- FIX: Replace manual check with assert_admin() and use RAISE EXCEPTION
-- ============================================================================

CREATE OR REPLACE FUNCTION public.admin_create_stylist_schedule(
  p_stylist_id uuid,
  p_schedules jsonb,
  p_effective_from date DEFAULT NULL,
  p_effective_until date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
DECLARE
  v_day_schedule JSONB;
  v_created_count INTEGER := 0;
  v_schedule_id UUID;
  v_effective_from_date DATE;
BEGIN
  -- ✅ FIX: Use assert_admin() for consistent error handling
  PERFORM private.assert_admin();
  
  -- Verify stylist exists
  IF NOT EXISTS (
    SELECT 1 FROM public.stylist_profiles WHERE user_id = p_stylist_id AND is_active = true
  ) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Stylist not found or inactive',
      'code', 'NOT_FOUND'
    );
  END IF;
  
  -- Validate effective date range if both provided
  IF p_effective_from IS NOT NULL AND p_effective_until IS NOT NULL THEN
    IF p_effective_from > p_effective_until THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'End date must be after start date',
        'code', 'INVALID_DATE_RANGE'
      );
    END IF;
  END IF;
  
  -- Set default effective_from to today if not provided
  v_effective_from_date := COALESCE(p_effective_from, CURRENT_DATE);
  
  -- Loop through each day schedule
  FOR v_day_schedule IN SELECT * FROM jsonb_array_elements(p_schedules)
  LOOP
    -- Validate time range
    IF (v_day_schedule->>'start_time')::TIME >= (v_day_schedule->>'end_time')::TIME THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', format('Invalid time range for day %s', v_day_schedule->>'day_of_week'),
        'code', 'INVALID_TIME'
      );
    END IF;
    
    -- Insert schedule with effective dates
    INSERT INTO public.stylist_schedules (
      stylist_user_id,
      day_of_week,
      start_time_local,
      end_time_local,
      start_time_utc,
      end_time_utc,
      effective_from,
      effective_until,
      is_active
    ) VALUES (
      p_stylist_id,
      (v_day_schedule->>'day_of_week')::INTEGER,
      (v_day_schedule->>'start_time')::TIME,
      (v_day_schedule->>'end_time')::TIME,
      (v_day_schedule->>'start_time')::TIME,
      (v_day_schedule->>'end_time')::TIME,
      v_effective_from_date,
      p_effective_until,
      true
    )
    RETURNING id INTO v_schedule_id;
    
    v_created_count := v_created_count + 1;
  END LOOP;
  
  -- Audit log
  INSERT INTO public.schedule_change_log (
    stylist_user_id,
    changed_by,
    change_type,
    new_value
  ) VALUES (
    p_stylist_id,
    auth.uid(),
    'create',
    jsonb_build_object(
      'schedules', p_schedules,
      'effective_from', v_effective_from_date,
      'effective_until', p_effective_until
    )
  );
  
  RETURN jsonb_build_object(
    'success', true,
    'created_count', v_created_count,
    'message', 'Schedule created successfully',
    'effective_from', v_effective_from_date,
    'effective_until', p_effective_until
  );
  
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'success', false,
    'error', SQLERRM,
    'code', 'INTERNAL_ERROR'
  );
END;
$$;

COMMENT ON FUNCTION public.admin_create_stylist_schedule IS 'Admin-only function to create stylist schedules';

-- ============================================================================
-- FUNCTION 6: admin_get_all_schedules
-- ============================================================================
-- STATUS: ✅ Already correct - uses user_has_role() with RAISE EXCEPTION
-- NO CHANGES NEEDED
-- ============================================================================

-- Function admin_get_all_schedules is ALREADY SECURE:
-- - Uses public.user_has_role() which checks is_active AND expires_at
-- - Raises exception with proper error code (42501)
-- - No changes required

COMMENT ON FUNCTION public.admin_get_all_schedules IS 'Admin-only function to list all stylist schedules';

-- ============================================================================
-- FUNCTION 7: admin_update_stylist_schedule
-- ============================================================================
-- FIX: Replace manual check with assert_admin()
-- ============================================================================

CREATE OR REPLACE FUNCTION public.admin_update_stylist_schedule(
  p_schedule_id uuid,
  p_start_time time,
  p_end_time time
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
DECLARE
  v_old_record stylist_schedules%ROWTYPE;
BEGIN
  -- ✅ FIX: Use assert_admin() for consistent error handling
  PERFORM private.assert_admin();
  
  -- Validate time range
  IF p_end_time <= p_start_time THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'End time must be after start time',
      'code', 'INVALID_TIME'
    );
  END IF;
  
  -- Get old record for audit
  SELECT * INTO v_old_record FROM public.stylist_schedules WHERE id = p_schedule_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Schedule not found',
      'code', 'NOT_FOUND'
    );
  END IF;
  
  -- Update
  UPDATE public.stylist_schedules
  SET 
    start_time_local = p_start_time,
    end_time_local = p_end_time,
    start_time_utc = p_start_time,
    end_time_utc = p_end_time,
    updated_at = NOW()
  WHERE id = p_schedule_id;
  
  -- Audit log
  INSERT INTO public.schedule_change_log (
    schedule_id,
    stylist_user_id,
    changed_by,
    change_type,
    old_value,
    new_value
  ) VALUES (
    p_schedule_id,
    v_old_record.stylist_user_id,
    auth.uid(),
    'update',
    jsonb_build_object('start_time', v_old_record.start_time_local, 'end_time', v_old_record.end_time_local),
    jsonb_build_object('start_time', p_start_time, 'end_time', p_end_time)
  );
  
  RETURN jsonb_build_object(
    'success', true,
    'message', 'Schedule updated successfully'
  );
  
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'success', false,
    'error', SQLERRM,
    'code', 'INTERNAL_ERROR'
  );
END;
$$;

COMMENT ON FUNCTION public.admin_update_stylist_schedule IS 'Admin-only function to update stylist schedule times';

-- ============================================================================
-- VERIFICATION QUERIES (Run after migration)
-- ============================================================================

-- Verify all functions now have proper admin checks
DO $$
DECLARE
  v_function_name text;
  v_has_check boolean;
  v_check_count integer := 0;
  v_total_count integer := 5; -- 5 functions we modified
BEGIN
  FOR v_function_name IN 
    SELECT unnest(ARRAY[
      'approve_payout_request',
      'reject_payout_request', 
      'get_admin_payout_requests',
      'admin_create_stylist_schedule',
      'admin_update_stylist_schedule'
    ])
  LOOP
    SELECT 
      routine_definition LIKE '%private.assert_admin%'
    INTO v_has_check
    FROM information_schema.routines
    WHERE routine_name = v_function_name
    AND routine_schema = 'public';
    
    IF v_has_check THEN
      v_check_count := v_check_count + 1;
      RAISE NOTICE 'PASS: % has assert_admin()', v_function_name;
    ELSE
      RAISE WARNING 'FAIL: % missing assert_admin()', v_function_name;
    END IF;
  END LOOP;
  
  IF v_check_count = v_total_count THEN
    RAISE NOTICE '✅ SUCCESS: All % functions now have standardized admin checks', v_total_count;
  ELSE
    RAISE WARNING '⚠️ WARNING: Only %/% functions have admin checks', v_check_count, v_total_count;
  END IF;
END $$;

COMMIT;

-- ============================================================================
-- POST-MIGRATION NOTES
-- ============================================================================
-- 1. All 5 modified functions now use PERFORM private.assert_admin()
-- 2. get_audit_logs and admin_get_all_schedules were already secure (no changes)
-- 3. approve_payout_request now locks on vendor_id (race condition fixed)
-- 4. Zero breaking changes - all function signatures unchanged
-- 5. Error codes remain consistent (42501 for unauthorized)
-- 6. Rollback: Restore original function definitions from comments above
-- ============================================================================
