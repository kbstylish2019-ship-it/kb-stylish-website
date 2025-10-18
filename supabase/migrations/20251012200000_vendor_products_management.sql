-- ============================================================================
-- VENDOR PRODUCTS MANAGEMENT - DATABASE FUNCTIONS v2.0
-- ============================================================================
-- Purpose: Enable vendors to manage their products with full CRUD operations
-- Security: All functions verify vendor_id matches authenticated user
-- Version: 2.0 (Post-Expert Panel Review)
-- Changes: Added validation, audit logging, cache invalidation, performance opts
-- ============================================================================

BEGIN;

-- ============================================================================
-- PERFORMANCE: Add indices for search and pagination
-- ============================================================================

-- Enable pg_trgm extension for fuzzy search
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Add trigram index for fast ILIKE searches
CREATE INDEX IF NOT EXISTS idx_products_name_trgm 
ON products USING gin (name gin_trgm_ops);

-- Add composite index for cursor-based pagination
CREATE INDEX IF NOT EXISTS idx_products_vendor_created 
ON products (vendor_id, created_at DESC, id);

-- ============================================================================
-- HELPER FUNCTION: Generate unique product slug
-- ============================================================================
CREATE OR REPLACE FUNCTION private.generate_product_slug(
  p_name text,
  p_vendor_id uuid
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_base_slug text;
  v_slug text;
  v_counter integer := 0;
BEGIN
  -- Sanitize name to slug format
  v_base_slug := lower(regexp_replace(p_name, '[^a-zA-Z0-9\s-]', '', 'g'));
  v_base_slug := regexp_replace(v_base_slug, '\s+', '-', 'g');
  v_base_slug := regexp_replace(v_base_slug, '-+', '-', 'g');
  v_base_slug := trim(both '-' from v_base_slug);
  
  -- Limit length
  v_base_slug := substr(v_base_slug, 1, 180);
  
  -- Ensure uniqueness for this vendor
  v_slug := v_base_slug;
  WHILE EXISTS (SELECT 1 FROM products WHERE vendor_id = p_vendor_id AND slug = v_slug) LOOP
    v_counter := v_counter + 1;
    v_slug := v_base_slug || '-' || v_counter;
  END LOOP;
  
  RETURN v_slug;
END;
$$;

COMMENT ON FUNCTION private.generate_product_slug IS 
'Generate unique URL-safe slug for product. Server-side to prevent collisions.';

-- ============================================================================
-- FUNCTION 1: Get Vendor Products List (Optimized v2)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_vendor_products_list(
  p_vendor_id uuid DEFAULT NULL,
  p_page integer DEFAULT 1,
  p_per_page integer DEFAULT 20,
  p_search text DEFAULT NULL,
  p_is_active boolean DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
SET statement_timeout = '10s'
AS $$
DECLARE
  v_offset integer;
  v_total_count integer;
  v_result jsonb;
  v_actual_vendor_id uuid;
BEGIN
  -- Validate inputs
  IF p_per_page > 100 THEN
    RAISE EXCEPTION 'per_page cannot exceed 100';
  END IF;
  
  IF p_search IS NOT NULL AND LENGTH(p_search) > 100 THEN
    RAISE EXCEPTION 'Search term too long (max 100 characters)';
  END IF;
  
  -- Use provided vendor_id or default to authenticated user
  v_actual_vendor_id := COALESCE(p_vendor_id, auth.uid());
  
  -- Verify user can only see their own products (unless admin)
  IF v_actual_vendor_id != auth.uid() AND NOT public.user_has_role('admin') THEN
    RAISE EXCEPTION 'Unauthorized: Cannot view other vendor products';
  END IF;
  
  -- Calculate offset
  v_offset := (p_page - 1) * p_per_page;
  
  -- Get total count
  SELECT COUNT(*) INTO v_total_count
  FROM products p
  WHERE p.vendor_id = v_actual_vendor_id
    AND (p_is_active IS NULL OR p.is_active = p_is_active)
    AND (p_search IS NULL OR p.name ILIKE '%' || p_search || '%');
  
  -- Get paginated products with optimized joins
  WITH product_data AS (
    SELECT 
      p.id,
      p.name,
      p.slug,
      p.description,
      p.short_description,
      p.is_active,
      p.is_featured,
      p.created_at,
      p.updated_at,
      c.name as category_name,
      c.slug as category_slug,
      b.name as brand_name,
      -- Aggregate variants
      COALESCE(
        jsonb_agg(DISTINCT jsonb_build_object(
          'id', pv.id,
          'sku', pv.sku,
          'price', pv.price,
          'compare_at_price', pv.compare_at_price,
          'is_active', pv.is_active
        )) FILTER (WHERE pv.id IS NOT NULL),
        '[]'::jsonb
      ) as variants,
      -- Aggregate images
      COALESCE(
        jsonb_agg(DISTINCT jsonb_build_object(
          'id', pi.id,
          'image_url', pi.image_url,
          'sort_order', pi.sort_order,
          'is_primary', pi.is_primary
        ) ORDER BY jsonb_build_object(
          'id', pi.id,
          'image_url', pi.image_url,
          'sort_order', pi.sort_order,
          'is_primary', pi.is_primary
        )->>'sort_order') FILTER (WHERE pi.id IS NOT NULL),
        '[]'::jsonb
      ) as images,
      -- Calculate total inventory
      COALESCE(SUM(i.quantity_available), 0) as total_inventory
    FROM products p
    LEFT JOIN categories c ON c.id = p.category_id
    LEFT JOIN brands b ON b.id = p.brand_id
    LEFT JOIN product_variants pv ON pv.product_id = p.id
    LEFT JOIN product_images pi ON pi.product_id = p.id
    LEFT JOIN inventory i ON i.variant_id = pv.id
    WHERE p.vendor_id = v_actual_vendor_id
      AND (p_is_active IS NULL OR p.is_active = p_is_active)
      AND (p_search IS NULL OR p.name ILIKE '%' || p_search || '%')
    GROUP BY p.id, c.name, c.slug, b.name
    ORDER BY p.created_at DESC, p.id
    LIMIT p_per_page
    OFFSET v_offset
  )
  SELECT jsonb_build_object(
    'products', COALESCE(jsonb_agg(row_to_jsonb(product_data)), '[]'::jsonb),
    'total_count', v_total_count,
    'page', p_page,
    'per_page', p_per_page,
    'total_pages', CEIL(v_total_count::float / p_per_page),
    'has_more', v_total_count > (p_page * p_per_page)
  ) INTO v_result
  FROM product_data;
  
  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.get_vendor_products_list IS 
'List all products for a vendor with pagination, search, and filtering. v2: Optimized joins, query timeout.';

-- ============================================================================
-- FUNCTION 2: Create Vendor Product (Hardened v2)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.create_vendor_product(
  p_product_data jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, private, pg_temp
SET statement_timeout = '30s'
AS $$
DECLARE
  v_vendor_id uuid;
  v_product_id uuid;
  v_variant_id uuid;
  v_location_id uuid;
  v_variant json;
  v_image json;
  v_slug text;
  v_seo_title text;
  v_seo_description text;
  v_image_counter integer := 0;
  v_result jsonb;
BEGIN
  -- Get authenticated user
  v_vendor_id := auth.uid();
  IF v_vendor_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: Must be authenticated';
  END IF;
  
  -- Verify user has vendor role
  IF NOT public.user_has_role('vendor') THEN
    RAISE EXCEPTION 'Unauthorized: Must be a vendor';
  END IF;
  
  -- ============================================================================
  -- VALIDATION: Input sanitization
  -- ============================================================================
  IF p_product_data->>'name' IS NULL OR LENGTH(TRIM(p_product_data->>'name')) = 0 THEN
    RAISE EXCEPTION 'Product name is required';
  END IF;
  
  IF LENGTH(p_product_data->>'name') > 200 THEN
    RAISE EXCEPTION 'Product name too long (max 200 characters)';
  END IF;
  
  IF LENGTH(COALESCE(p_product_data->>'description', '')) > 5000 THEN
    RAISE EXCEPTION 'Description too long (max 5000 characters)';
  END IF;
  
  IF p_product_data->>'category_id' IS NULL THEN
    RAISE EXCEPTION 'Category is required';
  END IF;
  
  -- Validate category exists and is active
  IF NOT EXISTS (
    SELECT 1 FROM categories 
    WHERE id = (p_product_data->>'category_id')::uuid 
      AND is_active = true
  ) THEN
    RAISE EXCEPTION 'Invalid or inactive category';
  END IF;
  
  -- Require at least one variant
  IF NOT (p_product_data ? 'variants') 
     OR jsonb_array_length(p_product_data->'variants') = 0 THEN
    RAISE EXCEPTION 'Product must have at least one variant with price';
  END IF;
  
  -- ============================================================================
  -- Generate unique slug
  -- ============================================================================
  v_slug := private.generate_product_slug(
    p_product_data->>'name',
    v_vendor_id
  );
  
  -- Generate SEO metadata
  v_seo_title := LEFT(p_product_data->>'name', 60);
  v_seo_description := LEFT(
    COALESCE(p_product_data->>'short_description', p_product_data->>'description', ''),
    155
  );
  
  -- ============================================================================
  -- ATOMIC TRANSACTION: Create product + variants + images + inventory
  -- ============================================================================
  
  -- Create product
  INSERT INTO products (
    vendor_id,
    category_id,
    brand_id,
    name,
    slug,
    description,
    short_description,
    material,
    care_instructions,
    country_of_origin,
    is_active,
    is_featured,
    seo_title,
    seo_description
  ) VALUES (
    v_vendor_id,
    (p_product_data->>'category_id')::uuid,
    NULLIF(p_product_data->>'brand_id', '')::uuid,
    TRIM(p_product_data->>'name'),
    v_slug,
    p_product_data->>'description',
    p_product_data->>'short_description',
    p_product_data->>'material',
    p_product_data->>'care_instructions',
    p_product_data->>'country_of_origin',
    COALESCE((p_product_data->>'is_active')::boolean, true),
    COALESCE((p_product_data->>'is_featured')::boolean, false),
    v_seo_title,
    v_seo_description
  ) RETURNING id INTO v_product_id;
  
  -- Get or create default inventory location for vendor
  SELECT id INTO v_location_id
  FROM inventory_locations
  WHERE vendor_id = v_vendor_id AND is_default = true AND is_active = true
  LIMIT 1;
  
  IF v_location_id IS NULL THEN
    INSERT INTO inventory_locations (vendor_id, name, is_default, is_active)
    VALUES (v_vendor_id, 'Default Warehouse', true, true)
    RETURNING id INTO v_location_id;
  END IF;
  
  -- Create variants
  FOR v_variant IN SELECT * FROM jsonb_array_elements(p_product_data->'variants')
  LOOP
    -- Validate variant data
    IF COALESCE((v_variant->>'price')::decimal, 0) <= 0 THEN
      RAISE EXCEPTION 'Variant price must be greater than 0';
    END IF;
    
    IF v_variant->>'sku' IS NULL OR LENGTH(TRIM(v_variant->>'sku')) = 0 THEN
      RAISE EXCEPTION 'Variant SKU is required';
    END IF;
    
    INSERT INTO product_variants (
      product_id,
      sku,
      price,
      compare_at_price,
      cost_price,
      weight_grams,
      is_active
    ) VALUES (
      v_product_id,
      TRIM(v_variant->>'sku'),
      (v_variant->>'price')::decimal,
      NULLIF(v_variant->>'compare_at_price', '')::decimal,
      NULLIF(v_variant->>'cost_price', '')::decimal,
      NULLIF(v_variant->>'weight_grams', '')::integer,
      COALESCE((v_variant->>'is_active')::boolean, true)
    ) RETURNING id INTO v_variant_id;
    
    -- Create inventory record
    INSERT INTO inventory (
      variant_id,
      location_id,
      quantity_available,
      reorder_point,
      reorder_quantity
    ) VALUES (
      v_variant_id,
      v_location_id,
      COALESCE((v_variant->>'quantity')::integer, 0),
      COALESCE((v_variant->>'reorder_point')::integer, 5),
      COALESCE((v_variant->>'reorder_quantity')::integer, 20)
    );
  END LOOP;
  
  -- Create product images
  IF p_product_data ? 'images' THEN
    FOR v_image IN SELECT * FROM jsonb_array_elements(p_product_data->'images')
    LOOP
      INSERT INTO product_images (
        product_id,
        image_url,
        alt_text,
        sort_order,
        is_primary
      ) VALUES (
        v_product_id,
        v_image->>'image_url',
        COALESCE(v_image->>'alt_text', v_seo_title),
        COALESCE((v_image->>'sort_order')::integer, v_image_counter),
        COALESCE((v_image->>'is_primary')::boolean, v_image_counter = 0)
      );
      v_image_counter := v_image_counter + 1;
    END LOOP;
  END IF;
  
  -- ============================================================================
  -- AUDIT LOGGING & CACHE INVALIDATION
  -- ============================================================================
  
  -- Log change to product_change_log
  INSERT INTO product_change_log (product_id, changed_by, change_type, changes)
  VALUES (v_product_id, v_vendor_id, 'created', p_product_data);
  
  -- Notify cache invalidator (triggers cache clear)
  PERFORM pg_notify('product_changed', json_build_object(
    'product_id', v_product_id,
    'vendor_id', v_vendor_id,
    'action', 'created',
    'slug', v_slug
  )::text);
  
  -- Return success
  RETURN jsonb_build_object(
    'success', true,
    'product_id', v_product_id,
    'slug', v_slug,
    'message', 'Product created successfully'
  );
  
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'Duplicate SKU detected. Each variant must have a unique SKU.';
  WHEN foreign_key_violation THEN
    RAISE EXCEPTION 'Invalid reference: Category or brand not found.';
  WHEN OTHERS THEN
    RAISE EXCEPTION 'Product creation failed: %', SQLERRM;
END;
$$;

COMMENT ON FUNCTION public.create_vendor_product IS 
'Create a new product with variants, images, and inventory in a single atomic transaction. v2: Added validation, audit logging, cache invalidation, SEO auto-generation.';

-- ============================================================================
-- FUNCTION 3: Update Vendor Product (Hardened v2)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.update_vendor_product(
  p_product_id uuid,
  p_product_data jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
SET statement_timeout = '10s'
AS $$
DECLARE
  v_vendor_id uuid;
  v_product_vendor_id uuid;
  v_old_data jsonb;
  v_slug text;
BEGIN
  -- Get authenticated user
  v_vendor_id := auth.uid();
  IF v_vendor_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: Must be authenticated';
  END IF;
  
  -- Get product's current data and vendor
  SELECT vendor_id, row_to_json(products.*)::jsonb 
  INTO v_product_vendor_id, v_old_data
  FROM products
  WHERE id = p_product_id;
  
  IF v_product_vendor_id IS NULL THEN
    RAISE EXCEPTION 'Product not found';
  END IF;
  
  -- Verify ownership
  IF v_product_vendor_id != v_vendor_id AND NOT public.user_has_role('admin') THEN
    RAISE EXCEPTION 'Unauthorized: Can only edit own products';
  END IF;
  
  -- Validation
  IF p_product_data ? 'name' AND LENGTH(p_product_data->>'name') > 200 THEN
    RAISE EXCEPTION 'Product name too long (max 200 characters)';
  END IF;
  
  IF p_product_data ? 'description' AND LENGTH(p_product_data->>'description') > 5000 THEN
    RAISE EXCEPTION 'Description too long (max 5000 characters)';
  END IF;
  
  -- Get current slug
  SELECT slug INTO v_slug FROM products WHERE id = p_product_id;
  
  -- Update product (only fields provided in p_product_data)
  UPDATE products SET
    name = COALESCE(p_product_data->>'name', name),
    description = COALESCE(p_product_data->>'description', description),
    short_description = COALESCE(p_product_data->>'short_description', short_description),
    material = COALESCE(p_product_data->>'material', material),
    care_instructions = COALESCE(p_product_data->>'care_instructions', care_instructions),
    is_active = COALESCE((p_product_data->>'is_active')::boolean, is_active),
    is_featured = COALESCE((p_product_data->>'is_featured')::boolean, is_featured),
    updated_at = NOW()
  WHERE id = p_product_id;
  
  -- Audit log
  INSERT INTO product_change_log (product_id, changed_by, change_type, changes)
  VALUES (p_product_id, v_vendor_id, 'updated', jsonb_build_object(
    'old', v_old_data,
    'new', p_product_data
  ));
  
  -- Notify cache invalidator
  PERFORM pg_notify('product_changed', json_build_object(
    'product_id', p_product_id,
    'vendor_id', v_vendor_id,
    'action', 'updated',
    'slug', v_slug
  )::text);
  
  RETURN jsonb_build_object(
    'success', true,
    'product_id', p_product_id,
    'message', 'Product updated successfully'
  );
  
EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION 'Product update failed: %', SQLERRM;
END;
$$;

COMMENT ON FUNCTION public.update_vendor_product IS 
'Update existing product. Only provided fields are updated. Includes audit logging and cache invalidation.';

-- ============================================================================
-- FUNCTION 4: Delete Vendor Product (Soft Delete)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.delete_vendor_product(
  p_product_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_vendor_id uuid;
  v_product_vendor_id uuid;
  v_slug text;
BEGIN
  v_vendor_id := auth.uid();
  IF v_vendor_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: Must be authenticated';
  END IF;
  
  SELECT vendor_id, slug INTO v_product_vendor_id, v_slug
  FROM products
  WHERE id = p_product_id;
  
  IF v_product_vendor_id IS NULL THEN
    RAISE EXCEPTION 'Product not found';
  END IF;
  
  IF v_product_vendor_id != v_vendor_id AND NOT public.user_has_role('admin') THEN
    RAISE EXCEPTION 'Unauthorized: Can only delete own products';
  END IF;
  
  -- Soft delete (set is_active = false)
  UPDATE products SET is_active = false, updated_at = NOW()
  WHERE id = p_product_id;
  
  -- Also deactivate all variants
  UPDATE product_variants SET is_active = false, updated_at = NOW()
  WHERE product_id = p_product_id;
  
  -- Audit log
  INSERT INTO product_change_log (product_id, changed_by, change_type, changes)
  VALUES (p_product_id, v_vendor_id, 'deleted', jsonb_build_object('soft_delete', true));
  
  -- Notify cache invalidator
  PERFORM pg_notify('product_changed', json_build_object(
    'product_id', p_product_id,
    'vendor_id', v_vendor_id,
    'action', 'deleted',
    'slug', v_slug
  )::text);
  
  RETURN jsonb_build_object(
    'success', true,
    'product_id', p_product_id,
    'message', 'Product deleted successfully'
  );
END;
$$;

COMMENT ON FUNCTION public.delete_vendor_product IS 
'Soft delete product by setting is_active=false. Preserves data for order history.';

-- ============================================================================
-- FUNCTION 5: Toggle Product Active Status
-- ============================================================================
CREATE OR REPLACE FUNCTION public.toggle_product_active(
  p_product_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_vendor_id uuid;
  v_product_vendor_id uuid;
  v_new_status boolean;
  v_slug text;
BEGIN
  v_vendor_id := auth.uid();
  IF v_vendor_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: Must be authenticated';
  END IF;
  
  SELECT vendor_id, NOT is_active, slug INTO v_product_vendor_id, v_new_status, v_slug
  FROM products
  WHERE id = p_product_id;
  
  IF v_product_vendor_id IS NULL THEN
    RAISE EXCEPTION 'Product not found';
  END IF;
  
  IF v_product_vendor_id != v_vendor_id AND NOT public.user_has_role('admin') THEN
    RAISE EXCEPTION 'Unauthorized: Can only modify own products';
  END IF;
  
  UPDATE products SET is_active = v_new_status, updated_at = NOW()
  WHERE id = p_product_id;
  
  -- Audit log
  INSERT INTO product_change_log (product_id, changed_by, change_type, changes)
  VALUES (p_product_id, v_vendor_id, 'toggled_active', jsonb_build_object('is_active', v_new_status));
  
  -- Notify cache
  PERFORM pg_notify('product_changed', json_build_object(
    'product_id', p_product_id,
    'vendor_id', v_vendor_id,
    'action', 'toggled_active',
    'slug', v_slug
  )::text);
  
  RETURN jsonb_build_object(
    'success', true,
    'product_id', p_product_id,
    'is_active', v_new_status,
    'message', CASE WHEN v_new_status THEN 'Product activated' ELSE 'Product deactivated' END
  );
END;
$$;

COMMENT ON FUNCTION public.toggle_product_active IS 
'Toggle product active status. Quick action for vendors to enable/disable products.';

-- ============================================================================
-- Grant Permissions
-- ============================================================================
GRANT EXECUTE ON FUNCTION public.get_vendor_products_list TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_vendor_product TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_vendor_product TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_vendor_product TO authenticated;
GRANT EXECUTE ON FUNCTION public.toggle_product_active TO authenticated;

COMMIT;
