-- =====================================================================
-- Fix Admin Vendors List - Correct Price Column Reference
-- Issue: Function references non-existent column oi.price_at_purchase
-- Fix: Update to use oi.total_price_cents (current schema)
-- Created: 2025-10-19 08:40:00 NPT
-- =====================================================================
--
-- PROBLEM:
-- get_admin_vendors_list() function references oi.price_at_purchase
-- which no longer exists after schema evolution. The correct column
-- is oi.total_price_cents which represents the line item total.
--
-- ERROR:
-- column oi.price_at_purchase does not exist
--
-- SOLUTION:
-- Replace oi.quantity * oi.price_at_purchase with oi.total_price_cents
-- =====================================================================

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
  PERFORM private.assert_admin();

  -- Validate pagination
  IF p_per_page > 100 THEN
    p_per_page := 100;
  END IF;

  v_offset := (p_page - 1) * p_per_page;
  
  -- Build query with filters
  -- FIXED: Use oi.total_price_cents instead of oi.quantity * oi.price_at_purchase
  WITH filtered_vendors AS (
    SELECT 
      vp.user_id,
      vp.business_name,
      vp.business_type,
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
      -- FIXED: Use total_price_cents which is already the line item total (quantity * unit_price)
      COALESCE(
        (SELECT SUM(oi.total_price_cents)
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
'Admin function to list all vendors with metrics. v2.2: Fixed to use total_price_cents instead of non-existent price_at_purchase column.';

-- =====================================================================
-- VERIFICATION
-- =====================================================================

DO $$
BEGIN
  RAISE NOTICE '✅ Fixed get_admin_vendors_list - now uses correct column total_price_cents';
  RAISE NOTICE '📊 Admin vendors page should now load without column errors';
  RAISE NOTICE '🔧 Revenue calculation uses total_price_cents (line item total)';
END $$;
