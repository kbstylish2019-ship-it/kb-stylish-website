-- Fix: update_order_status_on_item_change function uses invalid action values
-- Date: 2026-01-22
-- Issue: audit_log constraint only allows: 'INSERT', 'UPDATE', 'DELETE'
-- Current code uses: 'STATUS_AUTO_UPDATE', 'TRIGGER_ERROR' - which violate the constraint
-- Fix: Use 'UPDATE' with action_type stored in the jsonb values field

CREATE OR REPLACE FUNCTION public.update_order_status_on_item_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_total_items INTEGER;
  v_delivered_items INTEGER;
  v_cancelled_items INTEGER;
  v_latest_delivery_date TIMESTAMPTZ;
  v_new_order_status TEXT;
  v_old_order_status TEXT;
BEGIN
  -- Get current order status
  SELECT status INTO v_old_order_status
  FROM orders
  WHERE id = NEW.order_id;

  -- Count items by status (using FOR UPDATE for concurrency safety)
  SELECT 
    COUNT(*) as total,
    COUNT(*) FILTER (WHERE fulfillment_status = 'delivered') as delivered,
    COUNT(*) FILTER (WHERE fulfillment_status = 'cancelled') as cancelled,
    MAX(delivered_at) as latest_delivery
  INTO v_total_items, v_delivered_items, v_cancelled_items, v_latest_delivery_date
  FROM order_items
  WHERE order_id = NEW.order_id
  FOR UPDATE;

  -- Determine new order status
  IF v_cancelled_items = v_total_items THEN
    v_new_order_status := 'canceled';  -- Note: American spelling matches constraint
    v_latest_delivery_date := NULL;
  ELSIF v_delivered_items + v_cancelled_items = v_total_items THEN
    v_new_order_status := 'delivered';
  ELSE
    v_new_order_status := 'confirmed';
    v_latest_delivery_date := NULL;
  END IF;

  -- Update only if status changed
  IF v_old_order_status != v_new_order_status THEN
    UPDATE orders
    SET 
      status = v_new_order_status,
      delivered_at = v_latest_delivery_date
    WHERE id = NEW.order_id;

    -- Audit log - FIX: Use 'UPDATE' instead of 'STATUS_AUTO_UPDATE'
    INSERT INTO private.audit_log (
      table_name,
      record_id,
      action,
      old_values,
      new_values,
      user_id,
      created_at
    ) VALUES (
      'orders',
      NEW.order_id,
      'UPDATE',  -- FIX: Changed from 'STATUS_AUTO_UPDATE' to 'UPDATE'
      jsonb_build_object(
        'status', v_old_order_status,
        'action_type', 'status_auto_update'
      ),
      jsonb_build_object(
        'status', v_new_order_status,
        'delivered_at', v_latest_delivery_date,
        'total_items', v_total_items,
        'delivered_items', v_delivered_items,
        'cancelled_items', v_cancelled_items,
        'action_type', 'status_auto_update'
      ),
      auth.uid(),
      NOW()
    );
  END IF;

  RETURN NEW;

EXCEPTION
  WHEN OTHERS THEN
    -- Log error but don't block item update
    -- FIX: Use 'UPDATE' instead of 'TRIGGER_ERROR'
    INSERT INTO private.audit_log (
      table_name,
      record_id,
      action,
      new_values,
      created_at
    ) VALUES (
      'orders',
      NEW.order_id,
      'UPDATE',  -- FIX: Changed from 'TRIGGER_ERROR' to 'UPDATE'
      jsonb_build_object(
        'error_message', SQLERRM,
        'triggered_by_item', NEW.id,
        'action_type', 'trigger_error'
      ),
      NOW()
    );
    RETURN NEW;
END;
$function$;
