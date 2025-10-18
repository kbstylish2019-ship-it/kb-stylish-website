-- =====================================================================
-- MIGRATION: Add Featured Stylist Support
-- Following proven brands.is_featured pattern from Fortress Architecture
-- Phase 5 of UNIVERSAL_AI_EXCELLENCE_PROTOCOL
-- =====================================================================

BEGIN;

-- Add featured columns to stylist_profiles
ALTER TABLE public.stylist_profiles 
  ADD COLUMN IF NOT EXISTS is_featured BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS featured_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS featured_by UUID REFERENCES auth.users(id);

-- Create index for fast featured stylist queries
-- WHERE clause makes this a partial index (only indexes featured+active rows)
CREATE INDEX IF NOT EXISTS idx_stylist_profiles_featured 
ON public.stylist_profiles (is_featured, is_active, total_bookings DESC, rating_average DESC) 
WHERE is_featured = TRUE AND is_active = TRUE;

-- Add comments for documentation
COMMENT ON COLUMN public.stylist_profiles.is_featured IS 'Admin-controlled flag for homepage featured stylists';
COMMENT ON COLUMN public.stylist_profiles.featured_at IS 'Timestamp when stylist was featured';
COMMENT ON COLUMN public.stylist_profiles.featured_by IS 'Admin user who featured this stylist';

COMMIT;

-- Rollback plan (if needed):
-- ALTER TABLE public.stylist_profiles 
--   DROP COLUMN IF EXISTS is_featured, 
--   DROP COLUMN IF EXISTS featured_at, 
--   DROP COLUMN IF EXISTS featured_by CASCADE;
