-- =====================================================================
-- MIGRATION: Create Featured Stylist RPC Functions
-- Following proven patterns from get_featured_brands and get_trending_products
-- Phase 6 of UNIVERSAL_AI_EXCELLENCE_PROTOCOL
-- =====================================================================

BEGIN;

-- =====================================================================
-- FUNCTION 1: get_featured_stylists (Public Read Access)
-- =====================================================================

CREATE OR REPLACE FUNCTION public.get_featured_stylists(p_limit INTEGER DEFAULT 6)
RETURNS TABLE(
    stylist_id UUID,
    display_name TEXT,
    title TEXT,
    bio TEXT,
    years_experience INTEGER,
    specialties TEXT[],
    rating_average NUMERIC,
    total_bookings INTEGER,
    avatar_url TEXT,
    featured_at TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        sp.user_id as stylist_id,
        sp.display_name,
        sp.title,
        sp.bio,
        sp.years_experience,
        sp.specialties,
        sp.rating_average,
        sp.total_bookings,
        up.avatar_url,
        sp.featured_at
    FROM public.stylist_profiles sp
    LEFT JOIN public.user_profiles up ON sp.user_id = up.id
    WHERE sp.is_featured = TRUE
      AND sp.is_active = TRUE
    ORDER BY 
        sp.total_bookings DESC NULLS LAST, 
        sp.rating_average DESC NULLS LAST,
        sp.featured_at DESC NULLS LAST
    LIMIT p_limit;
END;
$$;

-- Grant public access (RLS not needed - already filtering by is_active)
GRANT EXECUTE ON FUNCTION public.get_featured_stylists TO anon, authenticated;

COMMENT ON FUNCTION public.get_featured_stylists IS 
'Returns featured stylists for homepage display. Uses SECURITY INVOKER (respects RLS if enabled). Joins with user_profiles for avatar_url.';

-- =====================================================================
-- FUNCTION 2: toggle_stylist_featured (Admin Only)
-- =====================================================================

CREATE OR REPLACE FUNCTION public.toggle_stylist_featured(
    p_user_id UUID,
    p_is_featured BOOLEAN
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
BEGIN
    -- Self-defense: Only admins can feature stylists
    -- This function requires private.assert_admin() from existing governance
    PERFORM private.assert_admin();
    
    -- Update stylist profile
    UPDATE public.stylist_profiles
    SET 
        is_featured = p_is_featured,
        featured_at = CASE WHEN p_is_featured THEN NOW() ELSE NULL END,
        featured_by = CASE WHEN p_is_featured THEN auth.uid() ELSE NULL END,
        updated_at = NOW()
    WHERE user_id = p_user_id;
    
    -- Verify stylist exists (FOUND is true if UPDATE affected >= 1 row)
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Stylist not found with user_id: %', p_user_id;
    END IF;
    
    -- Log action (optional - could add to audit_log if exists)
    RAISE NOTICE 'Stylist featured status changed: user_id=%, is_featured=%, by=%', 
                 p_user_id, p_is_featured, auth.uid();
END;
$$;

-- Restrict to authenticated users only (assert_admin will further restrict to admins)
REVOKE ALL ON FUNCTION public.toggle_stylist_featured FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.toggle_stylist_featured TO authenticated;

COMMENT ON FUNCTION public.toggle_stylist_featured IS 
'Admin-only function to toggle stylist featured status. Uses SECURITY DEFINER + assert_admin() for security. Updates featured_at and featured_by audit fields.';

COMMIT;

-- Test queries (run manually after migration):
-- SELECT * FROM public.get_featured_stylists(6);
-- CALL public.toggle_stylist_featured('19d02e52-4bb3-4bd6-ae4c-87e3f1543968', true); -- Sarah Johnson
