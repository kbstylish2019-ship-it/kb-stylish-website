-- Migration: Fix add_to_cart_secure after removing unique constraint
-- Replace ON CONFLICT with manual check-and-update logic

CREATE OR REPLACE FUNCTION public.add_to_cart_secure(
  p_variant_id UUID,
  p_quantity INTEGER,
  p_user_id UUID DEFAULT NULL,
  p_guest_token TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_cart_id UUID;
  v_available INT;
  v_item_id UUID;
  v_variant_price NUMERIC;
  v_final_qty INT;
  v_existing_qty INT;
  v_existing_item_id UUID;
BEGIN
  -- Note: NO auth.uid() check here because edge function uses service_role
  -- Edge function already verified the user's JWT before calling this RPC
  -- This RPC trusts the parameters passed by the edge function
  
  v_cart_id := public.get_or_create_cart_secure(p_user_id, p_guest_token);

  -- Check stock availability
  SELECT COALESCE(SUM(quantity_available), 0) 
  INTO v_available 
  FROM inventory 
  WHERE variant_id = p_variant_id;
  
  IF v_available <= 0 THEN
    RETURN jsonb_build_object('success', false, 'message', 'Out of stock');
  END IF;

  -- Get current price
  SELECT price 
  INTO v_variant_price 
  FROM product_variants 
  WHERE id = p_variant_id;
  
  IF v_variant_price IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Invalid product variant');
  END IF;

  -- 🔥 NEW: Manual check for existing item (since we removed UNIQUE constraint)
  -- Only check for NON-COMBO items (combo_group_id IS NULL)
  SELECT id, quantity 
  INTO v_existing_item_id, v_existing_qty 
  FROM cart_items 
  WHERE cart_id = v_cart_id 
    AND variant_id = p_variant_id
    AND combo_group_id IS NULL  -- Only merge regular items, not combo items
  LIMIT 1;

  -- Calculate final quantity
  v_final_qty := LEAST(
    COALESCE(v_existing_qty, 0) + p_quantity,
    v_available,
    99
  );

  -- 🔥 NEW: Manual INSERT or UPDATE (no ON CONFLICT)
  IF v_existing_item_id IS NOT NULL THEN
    -- Item exists, update quantity
    UPDATE cart_items 
    SET 
      quantity = v_final_qty,
      price_snapshot = v_variant_price,
      updated_at = NOW()
    WHERE id = v_existing_item_id
    RETURNING id INTO v_item_id;
  ELSE
    -- Item doesn't exist, insert new
    INSERT INTO cart_items (cart_id, variant_id, quantity, price_snapshot)
    VALUES (v_cart_id, p_variant_id, LEAST(p_quantity, v_available, 99), v_variant_price)
    RETURNING id INTO v_item_id;
  END IF;

  RETURN jsonb_build_object(
    'success', true, 
    'message', 'Item added to cart',
    'cart_id', v_cart_id,
    'item_id', v_item_id,
    'final_quantity', v_final_qty
  );
END;
$$;

-- No permission changes needed - function already restricted to service_role

COMMENT ON FUNCTION public.add_to_cart_secure(UUID, INTEGER, UUID, TEXT) IS 
'Adds a regular product to cart. Merges with existing non-combo items. Only callable by service_role via Edge Functions.';
