-- KB Stylish: Fix create_vendor_product to handle variant attributes
-- Migration: 20251021000000
-- Purpose: Enable Size/Color attribute assignment to product variants
-- Risk: LOW (backwards compatible)

BEGIN;

-- Drop old version
DROP FUNCTION IF EXISTS public.create_vendor_product(jsonb);

-- Create enhanced version with attribute support
CREATE OR REPLACE FUNCTION public.create_vendor_product(p_product_data jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'private', 'pg_temp'
SET statement_timeout TO '30s'
AS $function$
DECLARE
  v_vendor_id uuid;
  v_product_id uuid;
  v_variant_id uuid;
  v_location_id uuid;
  v_variant jsonb;
  v_image jsonb;
  v_slug text;
  v_seo_title text;
  v_seo_description text;
  v_image_counter integer := 0;
  v_attr_value_id uuid;
BEGIN
  -- Authentication check
  v_vendor_id := auth.uid();
  IF v_vendor_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: Must be authenticated';
  END IF;
  
  -- Role check
  IF NOT public.user_has_role(v_vendor_id, 'vendor') THEN
    RAISE EXCEPTION 'Unauthorized: Must be a vendor';
  END IF;
  
  -- Validate product name
  IF p_product_data->>'name' IS NULL OR LENGTH(TRIM(p_product_data->>'name')) = 0 THEN
    RAISE EXCEPTION 'Product name is required';
  END IF;
  
  IF LENGTH(p_product_data->>'name') > 200 THEN
    RAISE EXCEPTION 'Product name too long (max 200 characters)';
  END IF;
  
  -- Validate description length
  IF LENGTH(COALESCE(p_product_data->>'description', '')) > 5000 THEN
    RAISE EXCEPTION 'Description too long (max 5000 characters)';
  END IF;
  
  -- Validate category
  IF p_product_data->>'category_id' IS NULL THEN
    RAISE EXCEPTION 'Category is required';
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM categories 
    WHERE id = (p_product_data->>'category_id')::uuid 
      AND is_active = true
  ) THEN
    RAISE EXCEPTION 'Invalid or inactive category';
  END IF;
  
  -- Validate variants exist
  IF NOT (p_product_data ? 'variants') OR jsonb_array_length(p_product_data->'variants') = 0 THEN
    RAISE EXCEPTION 'Product must have at least one variant';
  END IF;
  
  -- Generate slug and SEO metadata
  v_slug := private.generate_product_slug(p_product_data->>'name', v_vendor_id);
  v_seo_title := LEFT(p_product_data->>'name', 60);
  v_seo_description := LEFT(
    COALESCE(p_product_data->>'short_description', p_product_data->>'description', ''), 
    155
  );
  
  -- Create product record
  INSERT INTO products (
    vendor_id, category_id, brand_id, name, slug, description, short_description,
    material, care_instructions, country_of_origin, is_active, is_featured,
    seo_title, seo_description
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
  
  -- Get or create default inventory location
  SELECT id INTO v_location_id
  FROM inventory_locations
  WHERE vendor_id = v_vendor_id AND is_default = true AND is_active = true
  LIMIT 1;
  
  IF v_location_id IS NULL THEN
    INSERT INTO inventory_locations (vendor_id, name, is_default, is_active)
    VALUES (v_vendor_id, 'Default Warehouse', true, true)
    RETURNING id INTO v_location_id;
  END IF;
  
  -- Create variants with attribute assignments
  FOR v_variant IN SELECT * FROM jsonb_array_elements(p_product_data->'variants')
  LOOP
    -- Validate variant price
    IF COALESCE((v_variant->>'price')::decimal, 0) <= 0 THEN
      RAISE EXCEPTION 'Variant price must be greater than 0';
    END IF;
    
    -- Validate SKU
    IF v_variant->>'sku' IS NULL OR LENGTH(TRIM(v_variant->>'sku')) = 0 THEN
      RAISE EXCEPTION 'Variant SKU is required';
    END IF;
    
    -- Create variant
    INSERT INTO product_variants (
      product_id, sku, price, compare_at_price, cost_price, weight_grams, is_active
    ) VALUES (
      v_product_id,
      TRIM(v_variant->>'sku'),
      (v_variant->>'price')::decimal,
      NULLIF(v_variant->>'compare_at_price', '')::decimal,
      NULLIF(v_variant->>'cost_price', '')::decimal,
      NULLIF(v_variant->>'weight_grams', '')::integer,
      COALESCE((v_variant->>'is_active')::boolean, true)
    ) RETURNING id INTO v_variant_id;
    
    -- ⭐ NEW: Link variant to attribute values
    IF v_variant ? 'attribute_value_ids' AND 
       jsonb_array_length(v_variant->'attribute_value_ids') > 0 THEN
      
      -- Iterate through attribute value IDs and create junction records
      FOR v_attr_value_id IN 
        SELECT (value::text)::uuid 
        FROM jsonb_array_elements_text(v_variant->'attribute_value_ids')
      LOOP
        -- Validate attribute value exists
        IF NOT EXISTS (
          SELECT 1 FROM attribute_values WHERE id = v_attr_value_id AND is_active = true
        ) THEN
          RAISE EXCEPTION 'Invalid attribute value ID: %', v_attr_value_id;
        END IF;
        
        -- Create junction record
        INSERT INTO variant_attribute_values (variant_id, attribute_value_id)
        VALUES (v_variant_id, v_attr_value_id)
        ON CONFLICT DO NOTHING; -- Prevent duplicate attribute assignments
      END LOOP;
    END IF;
    
    -- Create inventory record
    INSERT INTO inventory (variant_id, location_id, quantity_available, reorder_point, reorder_quantity)
    VALUES (
      v_variant_id,
      v_location_id,
      COALESCE((v_variant->>'quantity')::integer, 0),
      COALESCE((v_variant->>'reorder_point')::integer, 5),
      COALESCE((v_variant->>'reorder_quantity')::integer, 20)
    );
  END LOOP;
  
  -- Insert product images
  IF p_product_data ? 'images' AND jsonb_array_length(p_product_data->'images') > 0 THEN
    FOR v_image IN SELECT * FROM jsonb_array_elements(p_product_data->'images')
    LOOP
      -- Validate image URL (ensure it's from product-images bucket)
      IF (v_image->>'image_url') NOT LIKE '%/storage/v1/object/public/product-images/%' THEN
        RAISE WARNING 'Image URL does not match expected pattern: %', (v_image->>'image_url');
        -- Continue anyway for flexibility (e.g., external CDN in future)
      END IF;
      
      INSERT INTO product_images (product_id, image_url, alt_text, sort_order, is_primary)
      VALUES (
        v_product_id,
        v_image->>'image_url',
        COALESCE(v_image->>'alt_text', v_seo_title),
        COALESCE((v_image->>'sort_order')::integer, v_image_counter),
        COALESCE((v_image->>'is_primary')::boolean, v_image_counter = 0)
      );
      v_image_counter := v_image_counter + 1;
    END LOOP;
  END IF;
  
  -- Log change
  INSERT INTO product_change_log (product_id, changed_by, change_type, new_values)
  VALUES (v_product_id, v_vendor_id, 'created', p_product_data);
  
  -- Notify cache invalidation system
  PERFORM pg_notify('product_changed', json_build_object(
    'product_id', v_product_id,
    'vendor_id', v_vendor_id,
    'action', 'created',
    'slug', v_slug
  )::text);
  
  -- Return success with product details
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
    RAISE EXCEPTION 'Invalid reference: Category, brand, or attribute not found.';
  WHEN OTHERS THEN
    RAISE EXCEPTION 'Product creation failed: %', SQLERRM;
END;
$function$;

-- Add comment
COMMENT ON FUNCTION public.create_vendor_product(jsonb) IS 
'Creates a new product with variants, attributes, images, and inventory. 
Enhanced version supports variant-attribute linking via attribute_value_ids array.
Example payload: {"variants": [{"sku": "...", "price": 2999, "attribute_value_ids": ["uuid1", "uuid2"]}]}';

COMMIT;
