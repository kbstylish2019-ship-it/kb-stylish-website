-- Migration: Add combo quantity update function
-- This allows updating all items in a combo proportionally

CREATE OR REPLACE FUNCTION public.update_combo_quantity_secure(
  p_combo_group_id UUID,
  p_new_quantity INTEGER,
  p_user_id UUID DEFAULT NULL,
  p_guest_token TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_cart_id UUID;
  v_item RECORD;
  v_base_quantity INTEGER;
  v_multiplier NUMERIC;
  v_new_item_quantity INTEGER;
  v_available_stock INTEGER;
  v_updated_count INTEGER := 0;
BEGIN
  -- Get or create cart
  v_cart_id := public.get_or_create_cart_secure(p_user_id, p_guest_token);
  
  -- Validate new quantity
  IF p_new_quantity < 1 THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Quantity must be at least 1'
    );
  END IF;
  
  -- Get the first item to determine base quantity (the combo's "unit")
  SELECT quantity INTO v_base_quantity
  FROM cart_items
  WHERE cart_id = v_cart_id
    AND combo_group_id = p_combo_group_id
  ORDER BY created_at
  LIMIT 1;
  
  IF v_base_quantity IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Combo not found in cart'
    );
  END IF;
  
  -- Calculate multiplier (how many times to multiply each item's base quantity)
  -- If base quantity is 1 and new quantity is 2, multiplier is 2
  -- If base quantity is 2 and new quantity is 4, multiplier is 2
  v_multiplier := p_new_quantity::NUMERIC / v_base_quantity::NUMERIC;
  
  -- Update each item in the combo proportionally
  FOR v_item IN
    SELECT 
      ci.id,
      ci.variant_id,
      ci.quantity as current_quantity,
      COALESCE(inv.quantity_available, 0) as available_stock
    FROM cart_items ci
    LEFT JOIN (
      SELECT variant_id, SUM(quantity_available) as quantity_available
      FROM inventory
      GROUP BY variant_id
    ) inv ON inv.variant_id = ci.variant_id
    WHERE ci.cart_id = v_cart_id
      AND ci.combo_group_id = p_combo_group_id
  LOOP
    -- Calculate new quantity for this item (proportional to its original quantity)
    v_new_item_quantity := CEIL(v_item.current_quantity * v_multiplier)::INTEGER;
    
    -- Check inventory
    IF v_new_item_quantity > v_item.available_stock THEN
      RETURN jsonb_build_object(
        'success', false,
        'message', format('Insufficient stock for one or more items. Only %s available.', v_item.available_stock)
      );
    END IF;
    
    -- Update the item
    UPDATE cart_items
    SET 
      quantity = v_new_item_quantity,
      updated_at = NOW()
    WHERE id = v_item.id;
    
    v_updated_count := v_updated_count + 1;
  END LOOP;
  
  -- Return success
  RETURN jsonb_build_object(
    'success', true,
    'message', format('Updated %s items in combo', v_updated_count),
    'updated_count', v_updated_count
  );
END;
$$;

-- Grant execute permission to service_role only
GRANT EXECUTE ON FUNCTION public.update_combo_quantity_secure(UUID, INTEGER, UUID, TEXT) TO service_role;

-- Add comment
COMMENT ON FUNCTION public.update_combo_quantity_secure(UUID, INTEGER, UUID, TEXT) IS 
'Updates all items in a combo group proportionally. Checks inventory before updating. Only callable by service_role via Edge Functions.';
