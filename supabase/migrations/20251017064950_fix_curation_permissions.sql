-- Migration: Fix Curation Engine Permissions
-- Issue: anon role needs access to execute RPC functions and read from metrics schema
-- Issue 2: service_role also needs metrics schema access for Edge Function serviceClient
-- Date: 2025-10-17

BEGIN;

-- Grant EXECUTE on all curation RPC functions to anon and authenticated roles
GRANT EXECUTE ON FUNCTION public.get_trending_products(integer) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_featured_brands(integer) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_product_recommendations(uuid, integer) TO anon, authenticated;

-- Grant access to metrics schema (needed by get_trending_products)
GRANT USAGE ON SCHEMA metrics TO anon, authenticated, service_role;
GRANT SELECT ON metrics.product_trending_scores TO anon, authenticated, service_role;

-- Grant SELECT on all metrics tables (for future-proofing)
GRANT SELECT ON ALL TABLES IN SCHEMA metrics TO anon, authenticated, service_role;

-- Ensure default privileges for future tables in metrics schema
ALTER DEFAULT PRIVILEGES IN SCHEMA metrics GRANT SELECT ON TABLES TO anon, authenticated, service_role;

COMMIT;
