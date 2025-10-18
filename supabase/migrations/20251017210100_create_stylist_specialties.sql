-- =====================================================================
-- MIGRATION: Create Stylist Specialties Junction Table
-- Purpose: Many-to-many relationship between stylists and specialty types
-- Follows: Excellence Protocol Phase 8
-- Date: 2025-10-17 21:01:00 UTC
-- =====================================================================

BEGIN;

-- =====================================================================
-- PART 1: CREATE JUNCTION TABLE
-- =====================================================================

-- Links stylists to their specialties (1-5 per stylist)
CREATE TABLE IF NOT EXISTS public.stylist_specialties (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    stylist_user_id UUID NOT NULL REFERENCES public.stylist_profiles(user_id) ON DELETE CASCADE,
    specialty_type_id UUID NOT NULL REFERENCES public.specialty_types(id) ON DELETE RESTRICT,
    is_primary BOOLEAN DEFAULT FALSE,  -- Highlight as main specialty
    display_order INTEGER DEFAULT 0,   -- Order for display on profile
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Prevent duplicate specialty assignments
    UNIQUE(stylist_user_id, specialty_type_id)
);

-- Indexes for fast lookups
CREATE INDEX idx_stylist_specialties_stylist ON public.stylist_specialties(stylist_user_id);
CREATE INDEX idx_stylist_specialties_specialty ON public.stylist_specialties(specialty_type_id);
CREATE INDEX idx_stylist_specialties_primary ON public.stylist_specialties(stylist_user_id, is_primary) WHERE is_primary = TRUE;

-- Comments for documentation
COMMENT ON TABLE public.stylist_specialties IS 'Junction table linking stylists to their specialty types';
COMMENT ON COLUMN public.stylist_specialties.is_primary IS 'Mark as primary/featured specialty (max 1 per stylist)';
COMMENT ON COLUMN public.stylist_specialties.display_order IS 'Order for displaying specialties on profile (lower = higher priority)';

-- =====================================================================
-- PART 2: VALIDATION CONSTRAINT
-- =====================================================================

-- Ensure only ONE primary specialty per stylist
CREATE UNIQUE INDEX idx_stylist_specialties_one_primary 
ON public.stylist_specialties(stylist_user_id) 
WHERE is_primary = TRUE;

-- =====================================================================
-- PART 3: RLS POLICIES
-- =====================================================================

ALTER TABLE public.stylist_specialties ENABLE ROW LEVEL SECURITY;

-- Public read access (anyone can see stylist specialties)
CREATE POLICY "stylist_specialties_public_read" ON public.stylist_specialties
    FOR SELECT
    USING (TRUE);

-- Stylists can see their own specialties
CREATE POLICY "stylist_specialties_owner_read" ON public.stylist_specialties
    FOR SELECT
    USING (stylist_user_id = auth.uid());

-- Admin-only write access (managed during onboarding)
CREATE POLICY "stylist_specialties_admin_all" ON public.stylist_specialties
    FOR ALL
    USING (public.user_has_role(auth.uid(), 'admin'))
    WITH CHECK (public.user_has_role(auth.uid(), 'admin'));

-- =====================================================================
-- PART 4: GRANT PERMISSIONS
-- =====================================================================

GRANT SELECT ON public.stylist_specialties TO anon, authenticated;
GRANT ALL ON public.stylist_specialties TO authenticated;  -- RLS will restrict to admins

-- =====================================================================
-- PART 5: HELPER FUNCTION - Get Stylist Specialties
-- =====================================================================

CREATE OR REPLACE FUNCTION public.get_stylist_specialties(p_stylist_user_id UUID)
RETURNS TABLE(
    specialty_id UUID,
    specialty_name TEXT,
    specialty_slug TEXT,
    specialty_category TEXT,
    specialty_icon TEXT,
    is_primary BOOLEAN
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
    RETURN QUERY
    SELECT
        st.id as specialty_id,
        st.name as specialty_name,
        st.slug as specialty_slug,
        st.category as specialty_category,
        st.icon as specialty_icon,
        ss.is_primary
    FROM public.stylist_specialties ss
    JOIN public.specialty_types st ON ss.specialty_type_id = st.id
    WHERE ss.stylist_user_id = p_stylist_user_id
      AND st.is_active = TRUE
    ORDER BY ss.is_primary DESC, ss.display_order ASC, st.name ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_stylist_specialties TO anon, authenticated;

COMMENT ON FUNCTION public.get_stylist_specialties IS 
'Returns all active specialties for a given stylist, ordered by primary flag and display order';

COMMIT;
