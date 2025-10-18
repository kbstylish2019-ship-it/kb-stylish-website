-- ============================================================================
-- ADMIN VENDORS MANAGEMENT MIGRATION
-- Version: 2.0 (Post-Expert Review)
-- Date: October 12, 2025
-- Purpose: Enable admin UI for vendor management with approval workflow,
--          commission updates, suspension, and performance metrics
-- ============================================================================

BEGIN;

-- ============================================================================
-- PERFORMANCE INDICES (Expert Feedback)
-- ============================================================================

-- Enable trigram extension for fuzzy search
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Trigram index for vendor business name search
CREATE INDEX IF NOT EXISTS idx_vendor_profiles_search_trgm 
ON public.vendor_profiles USING gin(business_name gin_trgm_ops);

-- Composite index for status filtering and sorting
CREATE INDEX IF NOT EXISTS idx_vendor_profiles_status_created 
ON public.vendor_profiles(verification_status, created_at DESC);

-- Index for vendor product counts
CREATE INDEX IF NOT EXISTS idx_products_vendor_active 
ON public.products(vendor_id, is_active);

-- Index for vendor revenue calculations
CREATE INDEX IF NOT EXISTS idx_order_items_vendor 
ON public.order_items(vendor_id);

-- ============================================================================
-- FUNCTION 1: GET ADMIN VENDORS LIST
-- Purpose: Paginated vendor list with search, filters, and metrics
-- Security: SECURITY INVOKER (inherits admin's RLS)
-- Performance: 10s timeout, indexed search
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_admin_vendors_list(
  p_page integer DEFAULT 1,
  p_per_page integer DEFAULT 20,
  p_search text DEFAULT NULL,
  p_status_filter text DEFAULT NULL,
  p_business_type_filter text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, auth, private, pg_temp
SET statement_timeout = '10s'
AS $$
DECLARE
  v_offset integer;
  v_total integer;
  v_vendors jsonb;
BEGIN
  -- Verify admin access
  IF NOT private.assert_admin() THEN
    RAISE EXCEPTION 'Unauthorized: Admin access required';
  END IF;

  -- Validate pagination
  IF p_per_page > 100 THEN
    p_per_page := 100;
  END IF;

  v_offset := (p_page - 1) * p_per_page;
  
  -- Build query with filters
  WITH filtered_vendors AS (
    SELECT 
      vp.user_id,
      vp.business_name,
      vp.business_type,
      vp.tax_id,
      vp.verification_status,
      vp.commission_rate,
      vp.created_at,
      vp.updated_at,
      up.display_name,
      up.username,
      up.avatar_url,
      up.is_verified,
      au.email,
      au.last_sign_in_at,
      au.banned_until,
      -- Get vendor metrics
      (SELECT COUNT(*) FROM products WHERE vendor_id = vp.user_id) as total_products,
      (SELECT COUNT(*) FROM products WHERE vendor_id = vp.user_id AND is_active = true) as active_products,
      -- Total revenue from completed orders
      COALESCE(
        (SELECT SUM(oi.quantity * oi.price_at_purchase)
         FROM order_items oi
         JOIN orders o ON oi.order_id = o.id
         WHERE oi.vendor_id = vp.user_id
         AND o.status = 'completed'),
        0
      ) as total_revenue_cents,
      -- Total orders
      (SELECT COUNT(DISTINCT o.id)
       FROM orders o
       JOIN order_items oi ON o.id = oi.order_id
       WHERE oi.vendor_id = vp.user_id
       AND o.status = 'completed') as total_orders,
      -- Pending orders (for suspension warning)
      (SELECT COUNT(DISTINCT o.id)
       FROM orders o
       JOIN order_items oi ON o.id = oi.order_id
       WHERE oi.vendor_id = vp.user_id
       AND o.status IN ('pending', 'processing', 'confirmed')) as pending_orders
    FROM vendor_profiles vp
    LEFT JOIN user_profiles up ON vp.user_id = up.id
    LEFT JOIN auth.users au ON vp.user_id = au.id
    WHERE 
      au.deleted_at IS NULL
      AND (
        p_search IS NULL OR 
        vp.business_name ILIKE '%' || p_search || '%' OR
        up.display_name ILIKE '%' || p_search || '%' OR
        au.email ILIKE '%' || p_search || '%'
      )
      AND (p_status_filter IS NULL OR vp.verification_status = p_status_filter)
      AND (p_business_type_filter IS NULL OR vp.business_type = p_business_type_filter)
  )
  SELECT COUNT(*) INTO v_total FROM filtered_vendors;
  
  -- Get paginated results
  SELECT jsonb_agg(row_to_json(fv)::jsonb ORDER BY created_at DESC)
  INTO v_vendors
  FROM (
    SELECT * FROM filtered_vendors
    ORDER BY created_at DESC
    LIMIT p_per_page
    OFFSET v_offset
  ) fv;
  
  -- Return response
  RETURN jsonb_build_object(
    'vendors', COALESCE(v_vendors, '[]'::jsonb),
    'total', v_total,
    'page', p_page,
    'per_page', p_per_page,
    'total_pages', CEIL(v_total::numeric / p_per_page::numeric)
  );
END;
$$;

COMMENT ON FUNCTION public.get_admin_vendors_list IS 
'Admin function to list all vendors with metrics. v2.0: Added pending_orders, performance indices.';

-- ============================================================================
-- FUNCTION 2: APPROVE VENDOR
-- Purpose: Approve vendor application and assign vendor role
-- Security: SECURITY INVOKER, idempotent role assignment
-- Audit: Logs to user_audit_log
-- ============================================================================

CREATE OR REPLACE FUNCTION public.approve_vendor(
  p_vendor_id uuid,
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, private, pg_temp
SET statement_timeout = '5s'
AS $$
DECLARE
  v_admin_id uuid;
BEGIN
  v_admin_id := auth.uid();
  
  -- Verify admin
  IF NOT private.assert_admin() THEN
    RAISE EXCEPTION 'Unauthorized: Admin access required';
  END IF;
  
  -- Check vendor exists and is pending
  IF NOT EXISTS (
    SELECT 1 FROM vendor_profiles 
    WHERE user_id = p_vendor_id 
    AND verification_status = 'pending'
  ) THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Vendor not found or already processed'
    );
  END IF;
  
  -- Update verification status
  UPDATE vendor_profiles
  SET 
    verification_status = 'verified',
    updated_at = now()
  WHERE user_id = p_vendor_id;
  
  -- Ensure vendor has vendor role (idempotent)
  INSERT INTO user_roles (user_id, role_id, assigned_by)
  SELECT 
    p_vendor_id,
    r.id,
    v_admin_id
  FROM roles r
  WHERE r.name = 'vendor'
  ON CONFLICT (user_id, role_id) DO UPDATE
  SET is_active = true, assigned_by = v_admin_id, assigned_at = now();
  
  -- Increment role_version to trigger JWT refresh
  UPDATE user_profiles 
  SET role_version = role_version + 1 
  WHERE id = p_vendor_id;
  
  -- Audit log
  INSERT INTO user_audit_log (user_id, action, resource_type, resource_id, new_values)
  VALUES (
    v_admin_id,
    'vendor_approved',
    'vendor_profile',
    p_vendor_id,
    jsonb_build_object(
      'vendor_id', p_vendor_id,
      'notes', p_notes
    )
  );
  
  RETURN jsonb_build_object(
    'success', true,
    'message', 'Vendor approved successfully'
  );
END;
$$;

COMMENT ON FUNCTION public.approve_vendor IS 
'Approve vendor application and assign vendor role. Idempotent.';

-- ============================================================================
-- FUNCTION 3: REJECT VENDOR
-- Purpose: Reject vendor application and revoke vendor role
-- Security: SECURITY INVOKER
-- Audit: Logs to user_audit_log
-- ============================================================================

CREATE OR REPLACE FUNCTION public.reject_vendor(
  p_vendor_id uuid,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, private, pg_temp
SET statement_timeout = '5s'
AS $$
DECLARE
  v_admin_id uuid;
BEGIN
  v_admin_id := auth.uid();
  
  -- Verify admin
  IF NOT private.assert_admin() THEN
    RAISE EXCEPTION 'Unauthorized: Admin access required';
  END IF;
  
  -- Check vendor exists
  IF NOT EXISTS (SELECT 1 FROM vendor_profiles WHERE user_id = p_vendor_id) THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Vendor not found'
    );
  END IF;
  
  -- Update verification status
  UPDATE vendor_profiles
  SET 
    verification_status = 'rejected',
    updated_at = now()
  WHERE user_id = p_vendor_id;
  
  -- Revoke vendor role if exists
  UPDATE user_roles
  SET is_active = false
  WHERE user_id = p_vendor_id
  AND role_id = (SELECT id FROM roles WHERE name = 'vendor');
  
  -- Increment role_version
  UPDATE user_profiles 
  SET role_version = role_version + 1 
  WHERE id = p_vendor_id;
  
  -- Audit log
  INSERT INTO user_audit_log (user_id, action, resource_type, resource_id, old_values)
  VALUES (
    v_admin_id,
    'vendor_rejected',
    'vendor_profile',
    p_vendor_id,
    jsonb_build_object(
      'vendor_id', p_vendor_id,
      'reason', p_reason
    )
  );
  
  RETURN jsonb_build_object(
    'success', true,
    'message', 'Vendor application rejected'
  );
END;
$$;

COMMENT ON FUNCTION public.reject_vendor IS 
'Reject vendor application and revoke vendor role.';

-- ============================================================================
-- FUNCTION 4: UPDATE VENDOR COMMISSION
-- Purpose: Update vendor commission rate
-- Security: SECURITY INVOKER, validates range
-- Audit: Logs old and new values
-- ============================================================================

CREATE OR REPLACE FUNCTION public.update_vendor_commission(
  p_vendor_id uuid,
  p_commission_rate numeric
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, private, pg_temp
SET statement_timeout = '5s'
AS $$
DECLARE
  v_admin_id uuid;
  v_old_rate numeric;
BEGIN
  v_admin_id := auth.uid();
  
  -- Verify admin
  IF NOT private.assert_admin() THEN
    RAISE EXCEPTION 'Unauthorized: Admin access required';
  END IF;
  
  -- Validate commission rate (0-1 = 0-100%)
  IF p_commission_rate < 0 OR p_commission_rate > 1 THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Commission rate must be between 0 and 1 (0-100%)'
    );
  END IF;
  
  -- Get current rate
  SELECT commission_rate INTO v_old_rate
  FROM vendor_profiles
  WHERE user_id = p_vendor_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Vendor not found'
    );
  END IF;
  
  -- Update commission rate
  UPDATE vendor_profiles
  SET 
    commission_rate = p_commission_rate,
    updated_at = now()
  WHERE user_id = p_vendor_id;
  
  -- Audit log
  INSERT INTO user_audit_log (user_id, action, resource_type, resource_id, old_values, new_values)
  VALUES (
    v_admin_id,
    'vendor_commission_updated',
    'vendor_profile',
    p_vendor_id,
    jsonb_build_object('commission_rate', v_old_rate),
    jsonb_build_object('commission_rate', p_commission_rate)
  );
  
  RETURN jsonb_build_object(
    'success', true,
    'message', 'Commission rate updated successfully',
    'old_rate', v_old_rate,
    'new_rate', p_commission_rate
  );
END;
$$;

COMMENT ON FUNCTION public.update_vendor_commission IS 
'Update vendor commission rate. Logs old and new values.';

-- ============================================================================
-- FUNCTION 5: SUSPEND VENDOR
-- Purpose: Suspend vendor account and deactivate products
-- Security: SECURITY DEFINER (needs to modify auth.users)
-- Side Effects: Deactivates all vendor products
-- ============================================================================

CREATE OR REPLACE FUNCTION public.suspend_vendor(
  p_vendor_id uuid,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, private, pg_temp
SET statement_timeout = '5s'
AS $$
DECLARE
  v_admin_id uuid;
  v_products_deactivated integer;
BEGIN
  v_admin_id := auth.uid();
  
  -- Verify admin
  IF NOT private.assert_admin() THEN
    RAISE EXCEPTION 'Unauthorized: Admin access required';
  END IF;
  
  -- Check vendor exists
  IF NOT EXISTS (SELECT 1 FROM vendor_profiles WHERE user_id = p_vendor_id) THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Vendor not found'
    );
  END IF;
  
  -- Suspend user account (indefinite ban)
  UPDATE auth.users
  SET banned_until = 'infinity'::timestamptz
  WHERE id = p_vendor_id AND deleted_at IS NULL;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'User not found'
    );
  END IF;
  
  -- Deactivate all vendor products
  UPDATE products
  SET is_active = false
  WHERE vendor_id = p_vendor_id AND is_active = true;
  
  GET DIAGNOSTICS v_products_deactivated = ROW_COUNT;
  
  -- Audit log
  INSERT INTO user_audit_log (user_id, action, resource_type, resource_id, new_values)
  VALUES (
    v_admin_id,
    'vendor_suspended',
    'vendor_profile',
    p_vendor_id,
    jsonb_build_object(
      'vendor_id', p_vendor_id,
      'reason', p_reason,
      'products_deactivated', v_products_deactivated
    )
  );
  
  RETURN jsonb_build_object(
    'success', true,
    'message', 'Vendor suspended successfully',
    'products_deactivated', v_products_deactivated
  );
END;
$$;

COMMENT ON FUNCTION public.suspend_vendor IS 
'Suspend vendor account and deactivate all products.';

-- ============================================================================
-- FUNCTION 6: ACTIVATE VENDOR
-- Purpose: Remove vendor suspension
-- Security: SECURITY DEFINER
-- Note: Products remain deactivated (vendor must reactivate manually)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.activate_vendor(p_vendor_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, private, pg_temp
SET statement_timeout = '5s'
AS $$
DECLARE
  v_admin_id uuid;
BEGIN
  v_admin_id := auth.uid();
  
  -- Verify admin
  IF NOT private.assert_admin() THEN
    RAISE EXCEPTION 'Unauthorized: Admin access required';
  END IF;
  
  -- Clear ban
  UPDATE auth.users
  SET banned_until = NULL
  WHERE id = p_vendor_id AND deleted_at IS NULL;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Vendor not found'
    );
  END IF;
  
  -- Audit log
  INSERT INTO user_audit_log (user_id, action, resource_type, resource_id, new_values)
  VALUES (
    v_admin_id,
    'vendor_activated',
    'vendor_profile',
    p_vendor_id,
    jsonb_build_object('vendor_id', p_vendor_id)
  );
  
  RETURN jsonb_build_object(
    'success', true,
    'message', 'Vendor activated successfully (products remain inactive)'
  );
END;
$$;

COMMENT ON FUNCTION public.activate_vendor IS 
'Remove vendor suspension. Products remain deactivated.';

-- ============================================================================
-- GRANT PERMISSIONS
-- ============================================================================

GRANT EXECUTE ON FUNCTION public.get_admin_vendors_list TO authenticated;
GRANT EXECUTE ON FUNCTION public.approve_vendor TO authenticated;
GRANT EXECUTE ON FUNCTION public.reject_vendor TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_vendor_commission TO authenticated;
GRANT EXECUTE ON FUNCTION public.suspend_vendor TO authenticated;
GRANT EXECUTE ON FUNCTION public.activate_vendor TO authenticated;

COMMIT;

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================
-- Version: 2.0
-- Functions: 6 created
-- Indices: 4 created
-- Security: Admin-only with audit logging
-- Performance: Optimized with GIN and composite indices
-- ============================================================================
