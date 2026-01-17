-- Migration: Fix duplicate combo groups issue
-- When adding the same combo again, increment existing combo instead of creating new group

CREATE OR REPLACE FUNCTION public.add_combo_to_cart_secure(
  p_combo_id UUID,
  p_user_id UUID DEFAULT NULL,
  p_guest_token TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_cart_id UUID;
  v_combo RECORD;
  v_item RECORD;
  v_combo_group_id UUID;
  v_existing_combo_group_id UUID;
  v_total_original_price NUMERIC := 0;
  v_discount_ratio NUMERIC;
  v_discounted_price NUMERIC;
  v_available_qty INTEGER;
  v_combo_remaining INTEGER;
  v_base_quantity INTEGER;
BEGIN
  -- Validate auth
  IF p_user_id IS NULL AND p_guest_token IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'User ID or guest token required');
  END IF;

  -- Get combo details
  SELECT * INTO v_combo FROM products 
  WHERE id = p_combo_id AND is_combo = true AND is_active = true;
  
  IF v_combo IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Combo not found or inactive');
  END IF;
  
  -- Check combo quantity limit
  IF v_combo.combo_quantity_limit IS NOT NULL THEN
    v_combo_remaining := v_combo.combo_quantity_limit - COALESCE(v_combo.combo_quantity_sold, 0);
    IF v_combo_remaining <= 0 THEN
      RETURN jsonb_build_object('success', false, 'message', 'Combo sold out');
    END IF;
  END IF;
  
  -- Calculate total original price IN RUPEES
  FOR v_item IN 
    SELECT ci.*, pv.price, COALESCE(i.quantity_available, 0) as quantity_available, p.name as product_name
    FROM combo_items ci
    JOIN product_variants pv ON ci.constituent_variant_id = pv.id
    JOIN products p ON ci.constituent_product_id = p.id
    LEFT JOIN inventory i ON i.variant_id = pv.id
    WHERE ci.combo_product_id = p_combo_id
  LOOP
    -- Check inventory
    IF v_item.quantity_available < v_item.quantity THEN
      RETURN jsonb_build_object(
        'success', false, 
        'message', 'Insufficient inventory for ' || v_item.product_name
      );
    END IF;
    
    -- Sum original prices (variant price is in RUPEES)
    v_total_original_price := v_total_original_price + (v_item.price * v_item.quantity);
  END LOOP;
  
  -- CRITICAL FIX: Convert combo_price_cents to rupees before calculation
  IF v_total_original_price > 0 THEN
    v_discount_ratio := (v_combo.combo_price_cents::NUMERIC / 100) / v_total_original_price;
  ELSE
    RETURN jsonb_build_object('success', false, 'message', 'Invalid combo configuration');
  END IF;
  
  -- Get or create cart
  IF p_user_id IS NOT NULL THEN
    SELECT id INTO v_cart_id FROM carts WHERE user_id = p_user_id;
    IF v_cart_id IS NULL THEN
      INSERT INTO carts (user_id) VALUES (p_user_id) RETURNING id INTO v_cart_id;
    END IF;
  ELSE
    SELECT id INTO v_cart_id FROM carts WHERE session_id = p_guest_token;
    IF v_cart_id IS NULL THEN
      INSERT INTO carts (session_id) VALUES (p_guest_token) RETURNING id INTO v_cart_id;
    END IF;
  END IF;
  
  -- 🔥 NEW: Check if this combo already exists in cart
  SELECT combo_group_id, quantity INTO v_existing_combo_group_id, v_base_quantity
  FROM cart_items
  WHERE cart_id = v_cart_id
    AND combo_id = p_combo_id
    AND combo_group_id IS NOT NULL
  ORDER BY created_at DESC
  LIMIT 1;
  
  -- If combo already exists, increment its quantity instead of creating new group
  IF v_existing_combo_group_id IS NOT NULL THEN
    -- Call update_combo_quantity_secure to increment by 1
    RETURN public.update_combo_quantity_secure(
      v_existing_combo_group_id,
      v_base_quantity + 1,
      p_user_id,
      p_guest_token
    );
  END IF;
  
  -- Generate unique group ID (only if combo doesn't exist)
  v_combo_group_id := gen_random_uuid();
  
  -- Add items with CORRECT discounted prices
  FOR v_item IN 
    SELECT ci.*, pv.price
    FROM combo_items ci
    JOIN product_variants pv ON ci.constituent_variant_id = pv.id
    WHERE ci.combo_product_id = p_combo_id
    ORDER BY ci.display_order
  LOOP
    -- Apply discount ratio (now correct!)
    v_discounted_price := ROUND(v_item.price * v_discount_ratio, 2);
    
    INSERT INTO cart_items (cart_id, variant_id, quantity, price_snapshot, combo_id, combo_group_id)
    VALUES (v_cart_id, v_item.constituent_variant_id, v_item.quantity, v_discounted_price, p_combo_id, v_combo_group_id);
  END LOOP;
  
  -- Update cart timestamp
  UPDATE carts SET updated_at = now() WHERE id = v_cart_id;
  
  RETURN jsonb_build_object(
    'success', true, 
    'combo_group_id', v_combo_group_id,
    'combo_name', v_combo.name,
    'combo_price_cents', v_combo.combo_price_cents,
    'savings_cents', v_combo.combo_savings_cents,
    'merged', false
  );
END;
$$;

-- No permission changes needed - function already restricted to service_role

COMMENT ON FUNCTION public.add_combo_to_cart_secure(UUID, UUID, TEXT) IS 
'Adds a combo to cart. If the same combo already exists, increments its quantity instead of creating a duplicate group. Only callable by service_role via Edge Functions.';
