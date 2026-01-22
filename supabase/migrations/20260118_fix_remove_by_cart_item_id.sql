-- Fix: Remove cart items by cart_item_id instead of variant_id
-- This fixes the bug where removing a product removes the wrong item when there are multiple items with the same variant

-- Create new function to remove by cart_item_id
CREATE OR REPLACE FUNCTION public.remove_cart_item_by_id_secure(
  p_cart_item_id UUID,
  p_user_id UUID DEFAULT NULL,
  p_guest_token TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_cart_id UUID;
BEGIN
  -- Get the cart ID
  v_cart_id := public.get_or_create_cart_secure(p_user_id, p_guest_token);
  
  -- Delete the specific cart item (only if it belongs to this cart)
  DELETE FROM cart_items
  WHERE id = p_cart_item_id
    AND cart_id = v_cart_id;
  
  -- Return success
  RETURN jsonb_build_object(
    'success', true,
    'message', 'Item removed successfully'
  );
END;
$$;

-- Grant execute permission to service_role
GRANT EXECUTE ON FUNCTION public.remove_cart_item_by_id_secure(UUID, UUID, TEXT) TO service_role;

-- Add comment
COMMENT ON FUNCTION public.remove_cart_item_by_id_secure(UUID, UUID, TEXT) IS 
'Removes a specific cart item by its cart_items.id. This is more precise than removing by variant_id, especially for combo items where multiple cart items may have the same variant_id.';
