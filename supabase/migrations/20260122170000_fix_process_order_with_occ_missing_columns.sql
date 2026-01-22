-- Migration: Fix process_order_with_occ to include vendor_id, product_slug, combo_id, combo_group_id
-- Date: 2026-01-22
-- Author: AI Engineering Assistant
-- Issue: COD orders failing due to NOT NULL constraint violations on order_items table
-- 
-- Root Cause:
-- The INSERT INTO order_items statement was missing required NOT NULL columns:
-- - vendor_id (required by schema)
-- - product_slug (required by schema)
-- 
-- Additionally, combo tracking columns were not being carried through:
-- - combo_id
-- - combo_group_id
--
-- This caused all COD orders to fail silently after the user saw a success message.
--
-- Fixes Applied:
-- 1. Add vendor_id from products table (p.vendor_id)
-- 2. Add product_slug from products table (p.slug)
-- 3. Add combo_id from cart_items (ci.combo_id)
-- 4. Add combo_group_id from cart_items (ci.combo_group_id)
-- 5. Fixed booking items to also include vendor_id (stylist_user_id) and product_slug ('booking-service')

CREATE OR REPLACE FUNCTION public.process_order_with_occ(p_payment_intent_id text, p_webhook_event_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
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
    v_order_number TEXT;
    v_subtotal_cents INT;
    v_tax_cents INT;
    v_shipping_cents INT;
    v_shipping_address JSONB;
BEGIN
    -- Idempotency check: Does order already exist?
    SELECT id INTO v_order_id FROM orders WHERE payment_intent_id = p_payment_intent_id;
    IF v_order_id IS NOT NULL THEN
        IF p_webhook_event_id IS NOT NULL THEN
            UPDATE webhook_events SET status = 'completed', processed_at = NOW(), updated_at = NOW() WHERE id = p_webhook_event_id;
        END IF;
        RETURN jsonb_build_object('success', true, 'order_id', v_order_id, 'message', 'Order already exists (idempotent)', 'idempotent', true);
    END IF;
    
    -- Get payment intent details
    SELECT * INTO v_payment_intent FROM payment_intents WHERE payment_intent_id = p_payment_intent_id AND status = 'succeeded';
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'message', 'Payment intent not found or not succeeded');
    END IF;
    
    v_cart_id := v_payment_intent.cart_id;
    v_user_id := v_payment_intent.user_id;
    
    -- Extract values from metadata
    v_subtotal_cents := COALESCE((v_payment_intent.metadata->>'subtotal_cents')::INTEGER, 0);
    v_tax_cents := COALESCE((v_payment_intent.metadata->>'tax_cents')::INTEGER, 0);
    v_shipping_cents := COALESCE((v_payment_intent.metadata->>'shipping_cents')::INTEGER, 0);
    v_shipping_address := v_payment_intent.metadata->'shipping_address';
    
    v_order_number := 'ORD-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || LPAD(FLOOR(RANDOM() * 99999)::TEXT, 5, '0');
    
    SELECT COUNT(*) INTO v_product_items_needed FROM cart_items WHERE cart_id = v_cart_id;
    SELECT COUNT(*) INTO v_booking_items_needed FROM booking_reservations WHERE customer_user_id = v_user_id AND status = 'reserved' AND expires_at > NOW();
    v_items_needed := v_product_items_needed + v_booking_items_needed;
    
    -- Final total from payment intent
    v_total_amount := v_payment_intent.amount_cents;
    
    IF v_total_amount <= 0 THEN
        RAISE EXCEPTION 'Order total must be greater than zero. Calculated amount: %', v_total_amount;
    END IF;

    -- Create order record with 'confirmed' status (matching constraints)
    INSERT INTO orders (
        order_number, user_id, status, subtotal_cents, tax_cents, shipping_cents, discount_cents, total_cents, 
        payment_intent_id, payment_method,
        shipping_name, shipping_phone, shipping_address_line1, shipping_address_line2, 
        shipping_city, shipping_state, shipping_postal_code, shipping_country, 
        notes, metadata, created_at, confirmed_at
    ) VALUES (
        v_order_number, v_user_id, 'confirmed', 
        v_subtotal_cents, v_tax_cents, v_shipping_cents, 0, v_total_amount::INTEGER, p_payment_intent_id,
        v_payment_intent.provider,
        COALESCE(v_shipping_address->>'name', 'N/A'), COALESCE(v_shipping_address->>'phone', 'N/A'), 
        COALESCE(v_shipping_address->>'address_line1', 'N/A'), v_shipping_address->>'address_line2', 
        COALESCE(v_shipping_address->>'city', 'N/A'), COALESCE(v_shipping_address->>'state', 'N/A'),
        COALESCE(v_shipping_address->>'postal_code', 'N/A'), COALESCE(v_shipping_address->>'country', 'Nepal'),
        COALESCE(v_payment_intent.metadata->>'notes', ''),
        jsonb_build_object(
            'payment_provider', v_payment_intent.provider,
            'processed_at', NOW()
        ),
        NOW(), NOW()
    ) RETURNING id INTO v_order_id;
    
    -- Process products with all required columns including vendor_id, product_slug, combo_id, combo_group_id
    v_product_items_processed := 0;
    IF v_product_items_needed > 0 THEN
        WITH product_insert AS (
            INSERT INTO order_items (
                order_id, product_id, variant_id, vendor_id, product_name, product_slug,
                variant_sku, quantity, unit_price_cents, total_price_cents, fulfillment_status,
                combo_id, combo_group_id
            )
            SELECT 
                v_order_id, 
                pv.product_id, 
                ci.variant_id, 
                p.vendor_id,           -- FIX: Include vendor_id (required NOT NULL)
                p.name, 
                p.slug,                -- FIX: Include product_slug (required NOT NULL)
                pv.sku, 
                ci.quantity,
                (pv.price * 100)::INTEGER, 
                (ci.quantity * pv.price * 100)::INTEGER, 
                'pending',
                ci.combo_id,           -- FIX: Include combo tracking
                ci.combo_group_id      -- FIX: Include combo group tracking
            FROM cart_items ci
            JOIN product_variants pv ON pv.id = ci.variant_id
            JOIN products p ON p.id = pv.product_id
            WHERE ci.cart_id = v_cart_id
            RETURNING id
        )
        SELECT COUNT(*) INTO v_product_items_processed FROM product_insert;
    END IF;
    
    -- Process bookings
    v_booking_items_processed := 0;
    IF v_booking_items_needed > 0 THEN
        FOR v_booking_reservation IN 
            SELECT * FROM booking_reservations 
            WHERE customer_user_id = v_user_id AND status = 'reserved' AND expires_at > NOW()
        LOOP
            INSERT INTO order_items (
                order_id, product_id, variant_id, vendor_id, product_name, product_slug, quantity, 
                unit_price_cents, total_price_cents, fulfillment_status, 
                metadata
            ) VALUES (
                v_order_id, NULL, NULL, v_booking_reservation.stylist_user_id, 
                v_booking_reservation.service_name, 'booking-service', 1,
                v_booking_reservation.price_cents, v_booking_reservation.price_cents, 'fulfilled',
                jsonb_build_object('booking_id', v_booking_reservation.id)
            );
            
            UPDATE booking_reservations SET status = 'confirmed', updated_at = NOW() WHERE id = v_booking_reservation.id;
            v_booking_items_processed := v_booking_items_processed + 1;
        END LOOP;
    END IF;
    
    v_items_processed := v_product_items_processed + v_booking_items_processed;
    
    IF v_items_processed != v_items_needed THEN
        RAISE EXCEPTION 'Item processing mismatch: Expected %, Processed %', v_items_needed, v_items_processed;
    END IF;
    
    -- Clear cart items after successful order creation
    DELETE FROM cart_items WHERE cart_id = v_cart_id;
    
    -- Record inventory movements
    IF v_product_items_processed > 0 THEN
        INSERT INTO inventory_movements (variant_id, location_id, movement_type, quantity_change, quantity_after, reference_id, reference_type, notes, created_by)
        SELECT oi.variant_id, (SELECT location_id FROM inventory WHERE variant_id = oi.variant_id LIMIT 1), 'sale', -oi.quantity,
            (SELECT quantity_available FROM inventory WHERE variant_id = oi.variant_id), v_order_id, 'order', 'Order #' || v_order_id::TEXT, v_user_id
        FROM order_items oi WHERE oi.order_id = v_order_id AND oi.variant_id IS NOT NULL;
    END IF;
    
    -- Update webhook event status if provided
    IF p_webhook_event_id IS NOT NULL THEN
        UPDATE webhook_events SET status = 'completed', processed_at = NOW(), updated_at = NOW() WHERE id = p_webhook_event_id;
    END IF;
    
    -- Update payment intent status
    UPDATE payment_intents SET status = 'succeeded', updated_at = NOW() WHERE payment_intent_id = p_payment_intent_id;
    
    RETURN jsonb_build_object(
        'success', true, 
        'order_id', v_order_id, 
        'order_number', v_order_number, 
        'items_processed', v_items_processed,
        'total_cents', v_total_amount::INTEGER, 
        'user_id', v_user_id
    );
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
