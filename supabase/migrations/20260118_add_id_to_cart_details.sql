-- Fix: Add cart_items.id to get_cart_details_secure response
-- This is critical for the remove functionality to work correctly

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
        'id', ci.id, -- ⭐ CRITICAL: cart_items.id for precise removal
        'variant_id', ci.variant_id,
        'quantity', ci.quantity,
        'price_snapshot', ci.price_snapshot,
        'variant_sku', pv.sku,
        'product_name', p.name,
        'product_image', (
          SELECT pi.image_url 
          FROM product_images pi 
          WHERE pi.product_id = p.id 
            AND pi.is_primary = true 
          LIMIT 1
        ),
        'variant_attributes', (
          SELECT jsonb_agg(jsonb_build_object(
            'name', pa.name,
            'value', pav.value,
            'color_hex', pav.hex_code,
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
        'current_price', pv.price,
        -- ⭐ Combo fields
        'combo_group_id', ci.combo_group_id,
        'combo_name', ci.combo_name,
        'combo_id', (
          SELECT combo_id 
          FROM combo_items 
          WHERE combo_items.combo_group_id = ci.combo_group_id 
          LIMIT 1
        ),
        'combo', CASE 
          WHEN ci.combo_group_id IS NOT NULL THEN (
            SELECT jsonb_build_object(
              'id', comb.id,
              'name', comb.name,
              'combo_price_cents', comb.combo_price_cents,
              'combo_savings_cents', comb.combo_savings_cents,
              'combo_quantity_limit', comb.combo_quantity_limit,
              'combo_quantity_sold', comb.combo_quantity_sold
            )
            FROM products comb
            WHERE comb.id = (
              SELECT combo_id 
              FROM combo_items 
              WHERE combo_items.combo_group_id = ci.combo_group_id 
              LIMIT 1
            )
          )
          ELSE NULL
        END
      ))
      FROM cart_items ci
      JOIN product_variants pv ON pv.id = ci.variant_id
      JOIN products p ON p.id = pv.product_id
      LEFT JOIN (
        SELECT 
          variant_id,
          SUM(quantity_available) as quantity_available,
          SUM(quantity_reserved) as quantity_reserved
        FROM inventory
        GROUP BY variant_id
      ) inv ON inv.variant_id = pv.id
      WHERE ci.cart_id = c.id
      ORDER BY ci.created_at DESC
    ), '[]'::jsonb),
    'subtotal', COALESCE((
      SELECT SUM(ci.quantity * COALESCE(ci.price_snapshot, pv.price))
      FROM cart_items ci JOIN product_variants pv ON pv.id = ci.variant_id
      WHERE ci.cart_id = c.id
    ), 0),
    'item_count', COALESCE((
      SELECT SUM(ci.quantity) FROM cart_items ci WHERE ci.cart_id = c.id
    ), 0),
    'combo_groups', COALESCE((
      SELECT jsonb_agg(DISTINCT jsonb_build_object(
        'combo_group_id', ci.combo_group_id,
        'combo_id', (
          SELECT combo_id 
          FROM combo_items 
          WHERE combo_items.combo_group_id = ci.combo_group_id 
          LIMIT 1
        ),
        'combo_name', ci.combo_name,
        'item_count', (
          SELECT COUNT(*) 
          FROM cart_items 
          WHERE combo_group_id = ci.combo_group_id AND cart_id = c.id
        ),
        'combo_price_cents', (
          SELECT combo_price_cents 
          FROM products 
          WHERE id = (
            SELECT combo_id 
            FROM combo_items 
            WHERE combo_items.combo_group_id = ci.combo_group_id 
            LIMIT 1
          )
        ),
        'combo_savings_cents', (
          SELECT combo_savings_cents 
          FROM products 
          WHERE id = (
            SELECT combo_id 
            FROM combo_items 
            WHERE combo_items.combo_group_id = ci.combo_group_id 
            LIMIT 1
          )
        )
      ))
      FROM cart_items ci
      WHERE ci.cart_id = c.id AND ci.combo_group_id IS NOT NULL
    ), '[]'::jsonb)
  )
  INTO v_result
  FROM carts c
  WHERE c.id = v_cart_id;

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.get_cart_details_secure(UUID, TEXT) IS 
'Returns cart details with cart_items.id field for precise removal, variant attributes, product images, and combo information.';
