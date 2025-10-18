-- =====================================================================
-- GET PROMOTION BY USER - Resume Onboarding Feature
-- Description: Fetch existing promotion for a user to allow resume
-- Date: 2025-10-16
-- =====================================================================

-- =====================================================================
-- PRIVATE FUNCTION: get_promotion_by_user
-- =====================================================================

CREATE OR REPLACE FUNCTION private.get_promotion_by_user(
  p_user_id UUID,
  p_admin_id UUID
)
RETURNS JSONB
SECURITY DEFINER
SET search_path = 'public', 'private', 'pg_temp'
LANGUAGE plpgsql
AS $$
DECLARE
  v_promotion stylist_promotions%ROWTYPE;
  v_user_name TEXT;
  v_current_step INTEGER;
BEGIN
  -- Verify admin has admin role
  IF NOT public.user_has_role(p_admin_id, 'admin') THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Unauthorized: Admin role required',
      'code', 'UNAUTHORIZED'
    );
  END IF;

  -- Find existing pending promotion
  SELECT * INTO v_promotion
  FROM public.stylist_promotions
  WHERE user_id = p_user_id
    AND status IN ('draft', 'pending_checks', 'pending_training', 'pending_approval')
  ORDER BY created_at DESC
  LIMIT 1;

  -- If no pending promotion found
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'No pending promotion found for this user',
      'code', 'NOT_FOUND'
    );
  END IF;

  -- Get user display name
  SELECT display_name INTO v_user_name
  FROM public.user_profiles
  WHERE id = p_user_id;

  -- Calculate current step based on status
  CASE v_promotion.status
    WHEN 'draft' THEN v_current_step := 2;
    WHEN 'pending_checks' THEN v_current_step := 2;
    WHEN 'pending_training' THEN v_current_step := 3;
    WHEN 'pending_approval' THEN v_current_step := 4;
    ELSE v_current_step := 1;
  END CASE;

  -- Return full promotion data for restoration
  RETURN jsonb_build_object(
    'success', true,
    'promotion_id', v_promotion.id,
    'user_id', v_promotion.user_id,
    'user_name', v_user_name,
    'status', v_promotion.status,
    'current_step', v_current_step,
    'checks', jsonb_build_object(
      'background_check', v_promotion.background_check_status,
      'id_verification', v_promotion.id_verification_status,
      'training', v_promotion.training_completed,
      'mfa', v_promotion.mfa_enabled
    ),
    'stylist_profile_data', jsonb_build_object(
      'display_name', '',
      'title', '',
      'bio', '',
      'years_experience', 0,
      'timezone', 'Asia/Kathmandu'
    ),
    'created_at', v_promotion.created_at,
    'updated_at', v_promotion.updated_at,
    'requested_by', v_promotion.requested_by,
    'notes', COALESCE(v_promotion.notes, '[]'::jsonb)
  );

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'success', false,
    'error', SQLERRM,
    'code', 'INTERNAL_ERROR'
  );
END;
$$;

COMMENT ON FUNCTION private.get_promotion_by_user IS 
'Fetches existing pending promotion for a user to enable resume functionality in onboarding wizard';

-- =====================================================================
-- PUBLIC WRAPPER: get_promotion_by_user
-- =====================================================================

CREATE OR REPLACE FUNCTION public.get_promotion_by_user(
  p_user_id UUID,
  p_admin_id UUID
)
RETURNS JSONB
SECURITY INVOKER
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN private.get_promotion_by_user(p_user_id, p_admin_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_promotion_by_user TO authenticated;

COMMENT ON FUNCTION public.get_promotion_by_user IS 
'Public wrapper for private.get_promotion_by_user. Allows admin to fetch existing promotion for resume.';

-- =====================================================================
-- VERIFICATION
-- =====================================================================

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc 
    WHERE proname = 'get_promotion_by_user'
      AND pronamespace = 'public'::regnamespace
  ) THEN
    RAISE NOTICE 'get_promotion_by_user RPC created successfully';
  ELSE
    RAISE EXCEPTION 'Failed to create get_promotion_by_user RPC';
  END IF;
END;
$$;
