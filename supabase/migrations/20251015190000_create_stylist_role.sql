-- =====================================================================
-- KB STYLISH BLUEPRINT V3.1 - PHASE 4: STYLIST PORTAL
-- Migration 1: Create Stylist Role
-- =====================================================================

-- Insert stylist role if it doesn't exist
INSERT INTO public.roles (name, description, is_system_role)
VALUES (
  'stylist',
  'Access to stylist portal with booking management and context-rich customer data.',
  true
)
ON CONFLICT (name) DO NOTHING;

-- Verify role was created
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.roles WHERE name = 'stylist') THEN
    RAISE NOTICE 'Stylist role created successfully';
  END IF;
END $$;

-- =====================================================================
-- VERIFICATION
-- =====================================================================

-- Test query (run after migration):
-- SELECT * FROM public.roles WHERE name = 'stylist';
