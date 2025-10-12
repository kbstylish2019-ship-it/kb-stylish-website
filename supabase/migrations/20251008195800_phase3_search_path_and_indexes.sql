-- =====================================================================
-- PHASE 3: SECURITY & PERFORMANCE POLISH
-- =====================================================================
-- Migration: Pin search_path on SECURITY DEFINER functions + Add FK indexes
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Pin search_path on SECURITY DEFINER functions (defense-in-depth)
-- ---------------------------------------------------------------------
-- Advisors flagged these functions. We pin to avoid object shadowing.
-- Order: public first, then private and metrics, and pg_temp last.

ALTER FUNCTION public.confirm_booking_reservation(uuid, text)
  SET search_path TO public, private, metrics, pg_temp;

ALTER FUNCTION public.process_order_with_occ(text, uuid)
  SET search_path TO public, private, metrics, pg_temp;

ALTER FUNCTION public.requeue_stale_jobs()
  SET search_path TO public, private, metrics, pg_temp;

ALTER FUNCTION public.reserve_inventory_for_payment(uuid, text)
  SET search_path TO public, private, metrics, pg_temp;

ALTER FUNCTION public.trigger_order_worker()
  SET search_path TO public, private, metrics, pg_temp;

-- ---------------------------------------------------------------------
-- 2) Add covering indexes for unindexed foreign keys (performance)
-- ---------------------------------------------------------------------
-- moderation_queue.reviewed_by
CREATE INDEX IF NOT EXISTS idx_moderation_queue_reviewed_by
  ON public.moderation_queue(reviewed_by);

-- product_images.product_id, product_images.variant_id
CREATE INDEX IF NOT EXISTS idx_product_images_product_id
  ON public.product_images(product_id);
CREATE INDEX IF NOT EXISTS idx_product_images_variant_id
  ON public.product_images(variant_id);

-- product_tag_assignments.tag_id
CREATE INDEX IF NOT EXISTS idx_product_tag_assignments_tag_id
  ON public.product_tag_assignments(tag_id);

-- products.brand_id
CREATE INDEX IF NOT EXISTS idx_products_brand_id
  ON public.products(brand_id);

-- review_flags.reporter_user_id, review_flags.resolved_by
CREATE INDEX IF NOT EXISTS idx_review_flags_reporter_user_id
  ON public.review_flags(reporter_user_id);
CREATE INDEX IF NOT EXISTS idx_review_flags_resolved_by
  ON public.review_flags(resolved_by);

-- stylist_services.service_id
CREATE INDEX IF NOT EXISTS idx_stylist_services_service_id
  ON public.stylist_services(service_id);

-- user_addresses.user_id
CREATE INDEX IF NOT EXISTS idx_user_addresses_user_id
  ON public.user_addresses(user_id);

-- user_audit_log.user_id
CREATE INDEX IF NOT EXISTS idx_user_audit_log_user_id
  ON public.user_audit_log(user_id);

-- user_roles.assigned_by, user_roles.role_id
CREATE INDEX IF NOT EXISTS idx_user_roles_assigned_by
  ON public.user_roles(assigned_by);
CREATE INDEX IF NOT EXISTS idx_user_roles_role_id
  ON public.user_roles(role_id);

-- vendor_profiles.business_address_id
CREATE INDEX IF NOT EXISTS idx_vendor_profiles_business_address_id
  ON public.vendor_profiles(business_address_id);

-- =====================================================================
-- NOTES
-- - Extension migration (pgjwt, btree_gist) to 'extensions' schema is
--   scheduled separately for a maintenance window to avoid function moves
--   that could break references. We'll ship wrappers if needed.
-- =====================================================================
