-- =====================================================================
-- KB STYLISH BLUEPRINT V3.1 - PHASE 4: STYLIST PORTAL
-- Migration 5: Stylist Override Request RPC (Budget-Aware)
-- =====================================================================
--
-- Purpose: Allow stylists to request schedule overrides with budget tracking
-- Budget: 10 monthly + 3 emergency overrides
-- Logs all requests to schedule_change_log
--
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
BEGIN
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
  
  SELECT 
    monthly_override_limit,
    current_month_overrides,
    emergency_overrides_remaining,
    budget_reset_at
  INTO v_budget_record
  FROM public.stylist_override_budgets
  WHERE stylist_user_id = p_stylist_id;

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
    
    v_budget_record.current_month_overrides := 0;
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
  RETURN jsonb_build_object(
    'success', false,
    'error', SQLERRM,
    'code', 'INTERNAL_ERROR'
  );
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION public.request_availability_override TO authenticated;

COMMENT ON FUNCTION public.request_availability_override IS 
'Allows stylists to request schedule overrides with budget tracking. Normal: 10/month, Emergency: 3/lifetime (resets monthly). SECURITY DEFINER with role verification. Logs all requests to schedule_change_log. Returns updated budget status.';

-- =====================================================================
-- VERIFICATION
-- =====================================================================

-- Test query (as authenticated stylist):
-- SELECT public.request_availability_override(
--   p_stylist_id := auth.uid(),
--   p_target_date := CURRENT_DATE + 1,
--   p_is_closed := TRUE,
--   p_reason := 'Personal appointment',
--   p_is_emergency := FALSE
-- );
--
-- Verify budget was updated:
-- SELECT * FROM public.stylist_override_budgets 
-- WHERE stylist_user_id = auth.uid();
