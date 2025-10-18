-- =====================================================================
-- MIGRATION: Create Specialty Types Table
-- Purpose: Admin-managed specialty vocabulary (like services table)
-- Follows: Excellence Protocol Phase 8
-- Date: 2025-10-17 21:00:00 UTC
-- =====================================================================

BEGIN;

-- =====================================================================
-- PART 1: CREATE SPECIALTY TYPES TABLE
-- =====================================================================

-- Specialty types are admin-controlled categories of expertise
-- Examples: "Bridal Specialist", "Hair Coloring Expert", "Extensions Specialist"
CREATE TABLE IF NOT EXISTS public.specialty_types (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,  -- Display name: "Bridal Specialist"
    slug TEXT NOT NULL UNIQUE,  -- URL-friendly: "bridal-specialist"
    category TEXT NOT NULL CHECK (category IN ('hair', 'makeup', 'nails', 'spa', 'bridal', 'grooming')),
    description TEXT,
    icon TEXT,  -- Lucide icon name for UI (e.g., 'Crown', 'Scissors', 'Sparkles')
    is_active BOOLEAN DEFAULT TRUE,
    display_order INTEGER DEFAULT 0,  -- For sorting in dropdowns
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for fast lookups
CREATE INDEX idx_specialty_types_active ON public.specialty_types(is_active) WHERE is_active = TRUE;
CREATE INDEX idx_specialty_types_category ON public.specialty_types(category) WHERE is_active = TRUE;
CREATE INDEX idx_specialty_types_slug ON public.specialty_types(slug) WHERE is_active = TRUE;

-- Comments for documentation
COMMENT ON TABLE public.specialty_types IS 'Admin-managed specialty vocabulary for stylist expertise areas';
COMMENT ON COLUMN public.specialty_types.name IS 'Display name shown in UI (e.g., "Bridal Specialist")';
COMMENT ON COLUMN public.specialty_types.slug IS 'URL-friendly identifier for routing and filtering';
COMMENT ON COLUMN public.specialty_types.category IS 'High-level category matching service categories';
COMMENT ON COLUMN public.specialty_types.icon IS 'Lucide icon name for visual representation';

-- Updated_at trigger
CREATE TRIGGER update_specialty_types_updated_at
    BEFORE UPDATE ON public.specialty_types
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- =====================================================================
-- PART 2: RLS POLICIES
-- =====================================================================

ALTER TABLE public.specialty_types ENABLE ROW LEVEL SECURITY;

-- Public read access (anyone can see active specialties)
CREATE POLICY "specialty_types_public_read" ON public.specialty_types
    FOR SELECT
    USING (is_active = TRUE);

-- Admin-only write access
CREATE POLICY "specialty_types_admin_all" ON public.specialty_types
    FOR ALL
    USING (public.user_has_role(auth.uid(), 'admin'))
    WITH CHECK (public.user_has_role(auth.uid(), 'admin'));

-- =====================================================================
-- PART 3: GRANT PERMISSIONS
-- =====================================================================

GRANT SELECT ON public.specialty_types TO anon, authenticated;
GRANT ALL ON public.specialty_types TO authenticated;  -- RLS will restrict to admins

COMMIT;
