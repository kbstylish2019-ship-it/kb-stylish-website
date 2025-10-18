-- =====================================================================
-- MIGRATION: Migrate Existing Freeform Specialties
-- Purpose: Convert TEXT[] specialties to managed specialty_types
-- Follows: Excellence Protocol Phase 8
-- Date: 2025-10-17 21:03:00 UTC
-- =====================================================================

BEGIN;

-- =====================================================================
-- PART 1: FUZZY MATCH AND MIGRATE EXISTING DATA
-- =====================================================================

-- Create temp table for mapping old specialties to new specialty types
CREATE TEMP TABLE specialty_mapping AS
SELECT DISTINCT
    spec as old_specialty,
    sp.user_id as stylist_user_id,
    st.id as specialty_type_id,
    st.name as new_specialty_name
FROM public.stylist_profiles sp
CROSS JOIN LATERAL unnest(sp.specialties) AS spec
CROSS JOIN public.specialty_types st
WHERE sp.specialties IS NOT NULL 
  AND array_length(sp.specialties, 1) > 0
  AND (
    -- Exact match (case insensitive)
    LOWER(st.name) = LOWER(spec)
    OR LOWER(st.slug) = LOWER(spec)
    -- Fuzzy match (removing spaces and special chars)
    OR LOWER(REPLACE(REPLACE(st.name, ' ', ''), '''', '')) = LOWER(REPLACE(spec, ' ', ''))
    -- Partial match for common patterns
    OR LOWER(spec) LIKE '%' || LOWER(REPLACE(st.slug, '-', '%')) || '%'
  );

-- Insert mapped specialties into junction table
INSERT INTO public.stylist_specialties (stylist_user_id, specialty_type_id, display_order)
SELECT DISTINCT
    sm.stylist_user_id,
    sm.specialty_type_id,
    ROW_NUMBER() OVER (PARTITION BY sm.stylist_user_id ORDER BY sm.specialty_type_id) - 1 as display_order
FROM specialty_mapping sm
ON CONFLICT (stylist_user_id, specialty_type_id) DO NOTHING;

-- Mark first specialty as primary for each stylist
UPDATE public.stylist_specialties ss
SET is_primary = TRUE
WHERE ss.id IN (
    SELECT DISTINCT ON (stylist_user_id) id
    FROM public.stylist_specialties
    ORDER BY stylist_user_id, display_order
);

-- Log migration results
DO $$
DECLARE
    total_stylists INT;
    migrated_stylists INT;
    total_specialties INT;
BEGIN
    SELECT COUNT(DISTINCT user_id) INTO total_stylists 
    FROM public.stylist_profiles 
    WHERE specialties IS NOT NULL AND array_length(specialties, 1) > 0;
    
    SELECT COUNT(DISTINCT stylist_user_id) INTO migrated_stylists 
    FROM public.stylist_specialties;
    
    SELECT COUNT(*) INTO total_specialties 
    FROM public.stylist_specialties;
    
    RAISE NOTICE 'Migration complete: % of % stylists migrated, % specialty assignments created', 
                 migrated_stylists, total_stylists, total_specialties;
END $$;

-- =====================================================================
-- PART 2: ADD DEFAULT SPECIALTY FOR UNMIGRATED STYLISTS
-- =====================================================================

-- For stylists with services but no specialties, auto-assign based on services
INSERT INTO public.stylist_specialties (stylist_user_id, specialty_type_id, is_primary, display_order)
SELECT DISTINCT ON (sp.user_id)
    sp.user_id,
    st.id,
    TRUE,
    0
FROM public.stylist_profiles sp
JOIN public.stylist_services ss ON sp.user_id = ss.stylist_user_id
JOIN public.services s ON ss.service_id = s.id
JOIN public.specialty_types st ON st.category = s.category
WHERE NOT EXISTS (
    SELECT 1 FROM public.stylist_specialties 
    WHERE stylist_user_id = sp.user_id
)
AND sp.is_active = TRUE
AND st.is_active = TRUE
ORDER BY sp.user_id, s.category
ON CONFLICT (stylist_user_id, specialty_type_id) DO NOTHING;

-- =====================================================================
-- PART 3: DEPRECATION WARNING (DON'T DELETE OLD COLUMN YET)
-- =====================================================================

COMMENT ON COLUMN public.stylist_profiles.specialties IS 
'DEPRECATED: Migrated to stylist_specialties table. This column will be removed in future version. Do not use for new data.';

COMMIT;
