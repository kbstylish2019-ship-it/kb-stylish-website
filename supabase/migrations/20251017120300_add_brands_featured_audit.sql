-- =====================================================================
-- CURATION ENGINE: Add audit columns to brands table
-- =====================================================================
-- Blueprint: Production-Grade Blueprint v2.1 (Fortress Architecture)
-- Purpose: Add audit trail for featured brands
-- Note: is_featured column already exists from initial schema
--       We're only adding audit tracking columns (featured_at, featured_by)
-- =====================================================================

BEGIN;

-- Add audit columns (is_featured already exists from 20250914223023_create_product_inventory_schema.sql line 70)
ALTER TABLE public.brands 
  ADD COLUMN IF NOT EXISTS featured_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS featured_by UUID REFERENCES auth.users(id);

-- Add partial index for featured brands (performance optimization)
CREATE INDEX IF NOT EXISTS idx_brands_featured_audit 
ON public.brands (id, name, logo_url, featured_at, featured_by) 
WHERE is_featured = TRUE AND is_active = TRUE;

COMMENT ON COLUMN public.brands.featured_at IS 
  'Timestamp when brand was featured. NULL if never featured or unfeatured.';

COMMENT ON COLUMN public.brands.featured_by IS 
  'Admin user ID who last toggled featured status. For audit trail and compliance.';

COMMIT;
