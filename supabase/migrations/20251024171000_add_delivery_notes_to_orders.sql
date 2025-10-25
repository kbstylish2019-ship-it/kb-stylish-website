-- Add delivery notes support to process_order_with_occ function
-- This ensures notes from checkout are saved to orders table

CREATE OR REPLACE FUNCTION public.process_order_with_occ(
    p_payment_intent_id text,
    p_webhook_event_id uuid DEFAULT NULL::uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'private', 'metrics', 'pg_temp'
AS $function$
DECLARE
    v_order_id UUID;
    v_payment_intent RECORD;
    v_total_amount DECIMAL(12,2);
    v_product_items_needed INT;
    v_booking_items_needed INT;
    v_items_needed INT;
    v_product_items_processed INT;
    v_booking_items_processed INT;
    v_items_processed INT;
    v_cart_id UUID;
    v_user_id UUID;
    v_product_total_cents INT;
    v_booking_total_cents INT;
    v_booking_reservation RECORD;
    v_confirm_result JSONB;
    v_order_number TEXT;
    v_subtotal_cents INT;
    v_tax_cents INT;
    v_shipping_cents INT;
    v_shipping_address JSONB;
BEGIN
    SELECT id INTO v_order_id FROM orders WHERE payment_intent_id = p_payment_intent_id;
    IF v_order_id IS NOT NULL THEN
        IF p_webhook_event_id IS NOT NULL THEN
            UPDATE webhook_events SET status = 'completed', processed_at = NOW(), updated_at = NOW() WHERE id = p_webhook_event_id;
        END IF;
        RETURN jsonb_build_object('success', true, 'order_id', v_order_id, 'message', 'Order already exists (idempotent)', 'idempotent', true);
    END IF;
    
    SELECT * INTO v_payment_intent FROM payment_intents WHERE payment_intent_id = p_payment_intent_id AND status = 'succeeded';
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'message', 'Payment intent not found or not succeeded');
    END IF;
    
    v_cart_id := v_payment_intent.cart_id;
    v_user_id := v_payment_intent.user_id;
    v_subtotal_cents := COALESCE((v_payment_intent.metadata->>'subtotal_cents')::INTEGER, 0);
    v_tax_cents := COALESCE((v_payment_intent.metadata->>'tax_cents')::INTEGER, 0);
    v_shipping_cents := COALESCE((v_payment_intent.metadata->>'shipping_cents')::INTEGER, 0);
    v_shipping_address := v_payment_intent.metadata->'shipping_address';
    v_order_number := 'ORD-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || LPAD(FLOOR(RANDOM() * 99999)::TEXT, 5, '0');
    
    SELECT COUNT(*) INTO v_product_items_needed FROM cart_items WHERE cart_id = v_cart_id;
    SELECT COUNT(*) INTO v_booking_items_needed FROM booking_reservations WHERE customer_user_id = v_user_id AND status = 'reserved' AND expires_at > NOW();
    v_items_needed := v_product_items_needed + v_booking_items_needed;
    
    SELECT COALESCE(SUM(ci.quantity * pv.price) * 100, 0) INTO v_product_total_cents
    FROM cart_items ci JOIN product_variants pv ON pv.id = ci.variant_id WHERE ci.cart_id = v_cart_id;
    
    SELECT COALESCE(SUM(price_cents), 0) INTO v_booking_total_cents FROM booking_reservations WHERE customer_user_id = v_user_id AND status = 'reserved' AND expires_at > NOW();
    v_total_amount := v_product_total_cents + v_booking_total_cents;
    
    -- FIXED: Added notes field to INSERT statement
    INSERT INTO orders (
        order_number, user_id, status, subtotal_cents, tax_cents, shipping_cents, discount_cents, total_cents, payment_intent_id,
        shipping_name, shipping_phone, shipping_address_line1, shipping_address_line2, shipping_city, shipping_state, shipping_postal_code, shipping_country, 
        notes, metadata
    ) VALUES (
        v_order_number, v_user_id, 'pending', v_subtotal_cents, v_tax_cents, v_shipping_cents, 0, v_total_amount::INTEGER, p_payment_intent_id,
        COALESCE(v_shipping_address->>'name', 'N/A'), COALESCE(v_shipping_address->>'phone', 'N/A'), COALESCE(v_shipping_address->>'address_line1', 'N/A'),
        v_shipping_address->>'address_line2', COALESCE(v_shipping_address->>'city', 'N/A'), COALESCE(v_shipping_address->>'state', 'N/A'),
        COALESCE(v_shipping_address->>'postal_code', 'N/A'), COALESCE(v_shipping_address->>'country', 'NP'),
        v_shipping_address->>'notes',
        jsonb_build_object('webhook_event_id', p_webhook_event_id, 'payment_provider', v_payment_intent.provider, 'payment_metadata', v_payment_intent.provider_response,
            'product_items_count', v_product_items_needed, 'booking_items_count', v_booking_items_needed)
    ) RETURNING id INTO v_order_id;
    
    IF v_product_items_needed > 0 THEN
        WITH cart_demand AS (
            SELECT ci.variant_id, ci.quantity as needed, pv.price * 100 as unit_price_cents, p.id as product_id, p.name as product_name, p.slug as product_slug, pv.sku as variant_sku, p.vendor_id
            FROM cart_items ci JOIN product_variants pv ON pv.id = ci.variant_id JOIN products p ON p.id = pv.product_id
            WHERE ci.cart_id = v_cart_id ORDER BY ci.variant_id
        ),
        inventory_update AS (
            UPDATE inventory i SET 
                quantity_available = i.quantity_available - cd.needed,
                quantity_reserved = GREATEST(i.quantity_reserved - cd.needed, 0),
                updated_at = NOW()
            FROM cart_demand cd WHERE i.variant_id = cd.variant_id AND i.quantity_available >= cd.needed
            RETURNING i.variant_id, cd.needed, cd.unit_price_cents, cd.product_id, cd.product_name, cd.product_slug, cd.variant_sku, cd.vendor_id
        ),
        items_created AS (
            INSERT INTO order_items (order_id, variant_id, product_id, vendor_id, product_name, product_slug, variant_sku, quantity, unit_price_cents, total_price_cents, fulfillment_status)
            SELECT v_order_id, variant_id, product_id, vendor_id, product_name, product_slug, variant_sku, needed, unit_price_cents, unit_price_cents * needed, 'pending'
            FROM inventory_update
            RETURNING variant_id
        )
        SELECT COUNT(*) INTO v_product_items_processed FROM items_created;
        IF v_product_items_processed != v_product_items_needed THEN
            RAISE EXCEPTION 'Insufficient inventory: only % of % product items could be processed', v_product_items_processed, v_product_items_needed;
        END IF;
    ELSE
        v_product_items_processed := 0;
    END IF;
    
    v_booking_items_processed := 0;
    IF v_booking_items_needed > 0 THEN
        FOR v_booking_reservation IN
            SELECT id, price_cents FROM booking_reservations WHERE customer_user_id = v_user_id AND status = 'reserved' AND expires_at > NOW() ORDER BY id
        LOOP
            SELECT public.confirm_booking_reservation(v_booking_reservation.id, p_payment_intent_id) INTO v_confirm_result;
            IF NOT (v_confirm_result->>'success')::boolean THEN
                RAISE EXCEPTION 'Failed to confirm booking reservation %: %', v_booking_reservation.id, v_confirm_result->>'error';
            END IF;
            v_booking_items_processed := v_booking_items_processed + 1;
        END LOOP;
        IF v_booking_items_processed != v_booking_items_needed THEN
            RAISE EXCEPTION 'Failed to confirm all bookings: only % of % booking items could be processed', v_booking_items_processed, v_booking_items_needed;
        END IF;
    END IF;
    
    v_items_processed := v_product_items_processed + v_booking_items_processed;
    UPDATE orders SET status = 'confirmed', confirmed_at = NOW() WHERE id = v_order_id;
    DELETE FROM cart_items WHERE cart_id = v_cart_id;
    DELETE FROM booking_reservations WHERE customer_user_id = v_user_id AND status = 'confirmed';
    
    IF v_product_items_processed > 0 THEN
        INSERT INTO inventory_movements (variant_id, location_id, movement_type, quantity_change, quantity_after, reference_id, reference_type, notes, created_by)
        SELECT oi.variant_id, (SELECT location_id FROM inventory WHERE variant_id = oi.variant_id LIMIT 1), 'sale', -oi.quantity,
            (SELECT quantity_available FROM inventory WHERE variant_id = oi.variant_id), v_order_id, 'order', 'Order #' || v_order_id::TEXT, v_user_id
        FROM order_items oi WHERE oi.order_id = v_order_id AND oi.variant_id IS NOT NULL;
    END IF;
    
    IF p_webhook_event_id IS NOT NULL THEN
        UPDATE webhook_events SET status = 'completed', processed_at = NOW(), updated_at = NOW() WHERE id = p_webhook_event_id;
    END IF;
    UPDATE payment_intents SET status = 'succeeded', updated_at = NOW() WHERE payment_intent_id = p_payment_intent_id;
    
    RETURN jsonb_build_object('success', true, 'order_id', v_order_id, 'order_number', v_order_number, 'items_processed', v_items_processed,
        'product_items_processed', v_product_items_processed, 'booking_items_processed', v_booking_items_processed, 'total_cents', v_total_amount::INTEGER, 'user_id', v_user_id);
EXCEPTION
    WHEN OTHERS THEN
        IF v_order_id IS NOT NULL THEN
            UPDATE orders SET status = 'canceled', metadata = jsonb_build_object('error', SQLERRM, 'error_detail', SQLSTATE, 'original_metadata', metadata) WHERE id = v_order_id;
        END IF;
        IF p_webhook_event_id IS NOT NULL THEN
            UPDATE webhook_events SET status = 'failed', error_message = SQLERRM, updated_at = NOW() WHERE id = p_webhook_event_id;
        END IF;
        RAISE;
END;
$function$;

COMMENT ON FUNCTION public.process_order_with_occ IS 
'Processes orders with OCC inventory management. Updated 2025-10-24 to include delivery notes from checkout.';
