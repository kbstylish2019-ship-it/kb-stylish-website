-- Enhancement: Add variant attributes and product images to cart details
-- This improves the cart/checkout UX by showing size badges, color swatches, and product images

CREATE OR REPLACE FUNCTION public.get_cart_details_secure(
  p_user_id UUID DEFAULT NULL,
  p_guest_token TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_cart_id UUID;
  v_result JSONB;
BEGIN
  v_cart_id := public.get_or_create_cart_secure(p_user_id, p_guest_token);

  SELECT jsonb_build_object(
    'id', c.id,
    'user_id', c.user_id,
    'session_id', c.session_id,
    'items', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', ci.id, -- cart_items.id for frontend
        'variant_id', ci.variant_id,
        'quantity', ci.quantity,
        'price_snapshot', ci.price_snapshot,
        'variant_sku', pv.sku, -- ⭐ NEW: SKU for display
        'product_name', p.name, -- ⭐ NEW: Direct product name
        'product_image', ( -- ⭐ NEW: Primary product image
          SELECT pi.image_url 
          FROM product_images pi 
          WHERE pi.product_id = p.id 
            AND pi.is_primary = true 
          LIMIT 1
        ),
        'variant_attributes', ( -- ⭐ NEW: Structured variant attributes with color hex
          SELECT jsonb_agg(jsonb_build_object(
            'attribute_name', pa.name,
            'value', pav.value,
            'hex_code', pav.hex_code,
            'display_order', pa.display_order
          ) ORDER BY pa.display_order)
          FROM variant_attribute_values vav
          JOIN product_attribute_values pav ON vav.attribute_value_id = pav.id
          JOIN product_attributes pa ON pav.attribute_id = pa.id
          WHERE vav.variant_id = pv.id
        ),
        'product', jsonb_build_object(
          'id', p.id,
          'name', p.name,
          'slug', p.slug,
          'vendor_id', p.vendor_id
        ),
        'inventory', jsonb_build_object(
          'quantity_available', COALESCE(inv.quantity_available, 0),
          'quantity_reserved', COALESCE(inv.quantity_reserved, 0)
        ),
        'current_price', pv.price
      ))
      FROM cart_items ci
      JOIN product_variants pv ON pv.id = ci.variant_id
      JOIN products p ON p.id = pv.product_id
      LEFT JOIN (
        -- Aggregate inventory across all locations for this variant
        SELECT 
          variant_id,
          SUM(quantity_available) as quantity_available,
          SUM(quantity_reserved) as quantity_reserved
        FROM inventory
        GROUP BY variant_id
      ) inv ON inv.variant_id = pv.id
      WHERE ci.cart_id = c.id
      ORDER BY ci.created_at DESC -- Show newest items first
    ), '[]'::jsonb),
    'subtotal', COALESCE((
      SELECT SUM(ci.quantity * COALESCE(ci.price_snapshot, pv.price))
      FROM cart_items ci JOIN product_variants pv ON pv.id = ci.variant_id
      WHERE ci.cart_id = c.id
    ), 0),
    'item_count', COALESCE((
      SELECT SUM(ci.quantity) FROM cart_items ci WHERE ci.cart_id = c.id
    ), 0)
  )
  INTO v_result
  FROM carts c
  WHERE c.id = v_cart_id;

  RETURN v_result;
END;
$$;

-- No permission changes needed - function already restricted to service_role

-- Comment for documentation
COMMENT ON FUNCTION public.get_cart_details_secure(UUID, TEXT) IS 
'Returns cart details with enhanced variant attributes (size, color with hex codes) and product images for better UX in cart/checkout displays. Only callable by service_role via Edge Functions.';
