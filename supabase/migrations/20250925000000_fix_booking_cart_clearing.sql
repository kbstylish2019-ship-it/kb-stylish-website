-- =====================================================================================
-- FIX BOOKING CART CLEARING
-- =====================================================================================
-- Author: Principal Backend Engineer
-- Date: 2025-09-25
-- Purpose: Update process_order_with_occ to handle booking reservations
-- 
-- ISSUE: When a mixed cart (products + bookings) is checked out, only products
-- are being processed and cleared. Booking reservations remain in the cart.
-- 
-- SOLUTION: Update process_order_with_occ to:
-- 1. Count booking reservations in addition to cart items
-- 2. Include booking totals in the order total
-- 3. Confirm booking reservations (convert to bookings table)
-- 4. Clear booking_reservations after successful confirmation
-- =====================================================================================

CREATE OR REPLACE FUNCTION public.process_order_with_occ(
    p_payment_intent_id TEXT,
    p_webhook_event_id UUID DEFAULT NULL
) RETURNS JSONB AS $$
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
    -- Check if order already exists (idempotency)
    SELECT id INTO v_order_id 
    FROM orders 
    WHERE payment_intent_id = p_payment_intent_id;
    
    IF v_order_id IS NOT NULL THEN
        -- Mark webhook event as processed if provided
        IF p_webhook_event_id IS NOT NULL THEN
            UPDATE webhook_events
            SET 
                status = 'completed',
                processed_at = NOW(),
                updated_at = NOW()
            WHERE id = p_webhook_event_id;
        END IF;
        
        RETURN jsonb_build_object(
            'success', true,
            'order_id', v_order_id,
            'message', 'Order already exists (idempotent)',
            'idempotent', true
        );
    END IF;
    
    -- Get payment intent details
    SELECT * INTO v_payment_intent
    FROM payment_intents
    WHERE payment_intent_id = p_payment_intent_id
        AND status = 'succeeded';
    
    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'message', 'Payment intent not found or not succeeded'
        );
    END IF;
    
    v_cart_id := v_payment_intent.cart_id;
    v_user_id := v_payment_intent.user_id;
    
    -- Extract pricing components from payment intent metadata
    v_subtotal_cents := COALESCE((v_payment_intent.metadata->>'subtotal_cents')::INTEGER, 0);
    v_tax_cents := COALESCE((v_payment_intent.metadata->>'tax_cents')::INTEGER, 0);
    v_shipping_cents := COALESCE((v_payment_intent.metadata->>'shipping_cents')::INTEGER, 0);
    v_shipping_address := v_payment_intent.metadata->'shipping_address';
    
    -- Generate order number (format: ORD-YYYYMMDD-XXXXX)
    v_order_number := 'ORD-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || 
                      LPAD(FLOOR(RANDOM() * 99999)::TEXT, 5, '0');
    
    -- Count items we need to process (BOTH products AND bookings)
    SELECT COUNT(*) INTO v_product_items_needed
    FROM cart_items
    WHERE cart_id = v_cart_id;
    
    -- Count booking reservations for this user
    SELECT COUNT(*) INTO v_booking_items_needed
    FROM booking_reservations
    WHERE customer_user_id = v_user_id
        AND status = 'reserved'
        AND expires_at > NOW();
    
    v_items_needed := v_product_items_needed + v_booking_items_needed;
    
    -- Calculate total from cart (products)
    SELECT COALESCE(SUM(ci.quantity * pv.price) * 100, 0)
    INTO v_product_total_cents
    FROM cart_items ci
    JOIN product_variants pv ON pv.id = ci.variant_id
    WHERE ci.cart_id = v_cart_id;
    
    -- Calculate total from booking reservations
    SELECT COALESCE(SUM(price_cents), 0)
    INTO v_booking_total_cents
    FROM booking_reservations
    WHERE customer_user_id = v_user_id
        AND status = 'reserved'
        AND expires_at > NOW();
    
    v_total_amount := v_product_total_cents + v_booking_total_cents;
    
    -- Create order record (using user_id to match actual schema)
    INSERT INTO orders (
        order_number,
        user_id,
        status, 
        subtotal_cents,
        tax_cents,
        shipping_cents,
        discount_cents,
        total_cents,
        payment_intent_id,
        shipping_name,
        shipping_phone,
        shipping_address_line1,
        shipping_address_line2,
        shipping_city,
        shipping_state,
        shipping_postal_code,
        shipping_country,
        metadata
    )
    VALUES (
        v_order_number,
        v_user_id,
        'pending',
        v_subtotal_cents,
        v_tax_cents,
        v_shipping_cents,
        0, -- discount_cents
        v_total_amount::INTEGER,
        p_payment_intent_id,
        COALESCE(v_shipping_address->>'name', 'N/A'),
        COALESCE(v_shipping_address->>'phone', 'N/A'),
        COALESCE(v_shipping_address->>'address_line1', 'N/A'),
        v_shipping_address->>'address_line2', -- Nullable
        COALESCE(v_shipping_address->>'city', 'N/A'),
        COALESCE(v_shipping_address->>'state', 'N/A'),
        COALESCE(v_shipping_address->>'postal_code', 'N/A'),
        COALESCE(v_shipping_address->>'country', 'NP'),
        jsonb_build_object(
            'webhook_event_id', p_webhook_event_id,
            'payment_provider', v_payment_intent.provider,
            'payment_metadata', v_payment_intent.provider_response,
            'product_items_count', v_product_items_needed,
            'booking_items_count', v_booking_items_needed
        )
    )
    RETURNING id INTO v_order_id;
    
    -- PART A: Process Products (existing logic)
    IF v_product_items_needed > 0 THEN
        WITH cart_demand AS (
            SELECT 
                ci.variant_id,
                ci.quantity as needed,
                pv.price * 100 as price_cents,
                p.vendor_id
            FROM cart_items ci
            JOIN product_variants pv ON pv.id = ci.variant_id
            JOIN products p ON p.id = pv.product_id
            WHERE ci.cart_id = v_cart_id
            ORDER BY ci.variant_id
        ),
        inventory_update AS (
            UPDATE inventory i
            SET 
                quantity_available = i.quantity_available - cd.needed,
                quantity_reserved = GREATEST(i.quantity_reserved - cd.needed, 0),
                version = i.version + 1,
                updated_at = NOW()
            FROM cart_demand cd
            WHERE i.variant_id = cd.variant_id
                AND i.quantity_available >= cd.needed
            RETURNING i.variant_id, cd.needed, cd.price_cents, cd.vendor_id
        ),
        items_created AS (
            INSERT INTO order_items (
                order_id,
                variant_id,
                vendor_id,
                quantity,
                price_cents
            )
            SELECT 
                v_order_id,
                variant_id,
                vendor_id,
                needed,
                price_cents
            FROM inventory_update
            RETURNING variant_id
        )
        SELECT COUNT(*) INTO v_product_items_processed
        FROM items_created;
        
        -- Validate all products were processed
        IF v_product_items_processed != v_product_items_needed THEN
            RAISE EXCEPTION 'Insufficient inventory: only % of % product items could be processed', 
                v_product_items_processed, v_product_items_needed;
        END IF;
    ELSE
        v_product_items_processed := 0;
    END IF;
    
    -- PART B: Process Booking Reservations (NEW LOGIC)
    v_booking_items_processed := 0;
    IF v_booking_items_needed > 0 THEN
        -- Confirm each booking reservation
        FOR v_booking_reservation IN
            SELECT id, price_cents
            FROM booking_reservations
            WHERE customer_user_id = v_user_id
                AND status = 'reserved'
                AND expires_at > NOW()
            ORDER BY id
        LOOP
            -- Call confirm_booking_reservation function to create the booking
            SELECT public.confirm_booking_reservation(
                v_booking_reservation.id,
                p_payment_intent_id
            ) INTO v_confirm_result;
            
            IF NOT (v_confirm_result->>'success')::boolean THEN
                RAISE EXCEPTION 'Failed to confirm booking reservation %: %', 
                    v_booking_reservation.id,
                    v_confirm_result->>'error';
            END IF;
            
            v_booking_items_processed := v_booking_items_processed + 1;
        END LOOP;
        
        -- Validate all bookings were processed
        IF v_booking_items_processed != v_booking_items_needed THEN
            RAISE EXCEPTION 'Failed to confirm all bookings: only % of % booking items could be processed', 
                v_booking_items_processed, v_booking_items_needed;
        END IF;
    END IF;
    
    v_items_processed := v_product_items_processed + v_booking_items_processed;
    
    UPDATE orders 
    SET 
        status = 'confirmed',
        confirmed_at = NOW(),
        updated_at = NOW()
    WHERE id = v_order_id;
    
    -- PART C: Clear the cart (products)
    DELETE FROM cart_items WHERE cart_id = v_cart_id;
    -- PART D: Clear booking reservations (they're now confirmed bookings)
    -- The confirm_booking_reservation function already marks them as 'confirmed'
    -- We can optionally delete them or leave them for audit trail
    -- For now, we'll delete them to match the product behavior
    DELETE FROM booking_reservations 
    WHERE customer_user_id = v_user_id 
        AND status = 'confirmed';
    
    -- Record inventory movements for audit trail (products only)
    IF v_product_items_processed > 0 THEN
        INSERT INTO inventory_movements (
            variant_id,
            location_id,
            movement_type,
            quantity_change,
            quantity_after,
            reference_id,
            reference_type,
            notes,
            created_by
        )
        SELECT 
            oi.variant_id,
            (SELECT location_id FROM inventory WHERE variant_id = oi.variant_id LIMIT 1),
            'sale',
            -oi.quantity,
            (SELECT quantity_available FROM inventory WHERE variant_id = oi.variant_id),
            v_order_id,
            'order',
            'Order #' || v_order_id::TEXT,
            v_user_id
        FROM order_items oi
        WHERE oi.order_id = v_order_id
            AND oi.variant_id IS NOT NULL; -- Only product items have variant_id
    END IF;
    
    -- Mark webhook event as processed
    IF p_webhook_event_id IS NOT NULL THEN
        UPDATE webhook_events
        SET 
            status = 'completed',
            processed_at = NOW(),
            updated_at = NOW()
        WHERE id = p_webhook_event_id;
    END IF;
    
    -- Mark payment intent as completed
    UPDATE payment_intents
    SET 
        status = 'succeeded',
        updated_at = NOW()
    WHERE payment_intent_id = p_payment_intent_id;
    
    RETURN jsonb_build_object(
        'success', true,
        'order_id', v_order_id,
        'items_processed', v_items_processed,
        'product_items_processed', v_product_items_processed,
        'booking_items_processed', v_booking_items_processed,
        'total_cents', v_total_amount::INTEGER,
        'user_id', v_user_id
    );
    
EXCEPTION
    WHEN OTHERS THEN
        -- Mark order as failed if it was created
        IF v_order_id IS NOT NULL THEN
            UPDATE orders 
            SET 
                status = 'failed',
                metadata = jsonb_build_object(
                    'error', SQLERRM,
                    'error_detail', SQLSTATE,
                    'original_metadata', metadata
                )
            WHERE id = v_order_id;
        END IF;
        
        -- Mark webhook event as failed
        IF p_webhook_event_id IS NOT NULL THEN
            UPDATE webhook_events
            SET 
                status = 'failed',
                error_message = SQLERRM,
                updated_at = NOW()
            WHERE id = p_webhook_event_id;
        END IF;
        
        -- Re-raise for proper error handling
        RAISE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant permissions
GRANT EXECUTE ON FUNCTION public.process_order_with_occ(TEXT, UUID) TO service_role;

-- =====================================================================================
-- MIGRATION COMPLETE: Booking Cart Clearing Fixed
-- =====================================================================================
-- 
-- Changes made:
-- 1. ✅ Added booking reservation counting
-- 2. ✅ Added booking total calculation
-- 3. ✅ Added booking confirmation logic (converts reservations to bookings)
-- 4. ✅ Added booking_reservations cleanup (deletes confirmed reservations)
-- 5. ✅ Updated metadata to track both product and booking item counts
-- 6. ✅ Improved error messages to distinguish between product and booking failures
-- 
-- Result: Mixed carts (products + bookings) now properly clear both products and
-- booking reservations after successful checkout.
-- =====================================================================================
