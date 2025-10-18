-- =====================================================================
-- KB STYLISH - FIX: Expose Promotion RPCs to Public Schema
-- =====================================================================
-- 
-- Issue: Admin onboarding wizard cannot call RPCs in private schema
-- Solution: Create public wrapper functions that call private functions
--
-- =====================================================================

-- =====================================================================
-- PUBLIC WRAPPER: update_promotion_checks
-- =====================================================================

CREATE OR REPLACE FUNCTION public.update_promotion_checks(
  p_promotion_id UUID,
  p_check_type TEXT,
  p_status TEXT,
  p_admin_id UUID,
  p_note TEXT DEFAULT NULL
)
RETURNS JSONB
SECURITY DEFINER  -- Elevated access to private schema
SET search_path = 'public', 'private', 'pg_temp'
LANGUAGE plpgsql
AS $$
BEGIN
  -- Call the private function
  RETURN private.update_promotion_checks(
    p_promotion_id,
    p_check_type,
    p_status,
    p_admin_id,
    p_note
  );
END;
$$;

-- Grant access to authenticated users
GRANT EXECUTE ON FUNCTION public.update_promotion_checks TO authenticated;

COMMENT ON FUNCTION public.update_promotion_checks IS 
'Public wrapper for private.update_promotion_checks. Allows admin UI to update verification checks during stylist onboarding.';

-- =====================================================================
-- PUBLIC WRAPPER: initiate_stylist_promotion
-- =====================================================================

CREATE OR REPLACE FUNCTION public.initiate_stylist_promotion(
  p_user_id UUID,
  p_admin_id UUID
)
RETURNS JSONB
SECURITY DEFINER
SET search_path = 'public', 'private', 'pg_temp'
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN private.initiate_stylist_promotion(p_user_id, p_admin_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.initiate_stylist_promotion TO authenticated;

COMMENT ON FUNCTION public.initiate_stylist_promotion IS 
'Public wrapper for private.initiate_stylist_promotion. Starts the stylist onboarding workflow.';

-- =====================================================================
-- PUBLIC WRAPPER: complete_stylist_promotion
-- =====================================================================

CREATE OR REPLACE FUNCTION public.complete_stylist_promotion(
  p_promotion_id UUID,
  p_admin_id UUID,
  p_profile_data JSONB
)
RETURNS JSONB
SECURITY DEFINER
SET search_path = 'public', 'private', 'pg_temp'
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN private.complete_stylist_promotion(
    p_promotion_id,
    p_admin_id,
    p_profile_data
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.complete_stylist_promotion TO authenticated;

COMMENT ON FUNCTION public.complete_stylist_promotion IS 
'Public wrapper for private.complete_stylist_promotion. Finalizes stylist onboarding and creates profile.';

-- =====================================================================
-- VERIFICATION
-- =====================================================================

-- Test that functions are accessible
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc 
    WHERE proname IN ('update_promotion_checks', 'initiate_stylist_promotion', 'complete_stylist_promotion')
      AND pronamespace = 'public'::regnamespace
  ) THEN
    RAISE NOTICE 'Public promotion RPCs created successfully';
  END IF;
END $$;
