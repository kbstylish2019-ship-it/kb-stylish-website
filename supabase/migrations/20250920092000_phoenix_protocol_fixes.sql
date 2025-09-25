-- =====================================================================================
-- PHOENIX PROTOCOL: Live Order Pipeline Fixes (Corrected)
-- Author: Principal Backend Engineer
-- Date: 2025-09-20
-- Version: 2.0
-- 
-- CRITICAL: This migration fixes launch-blocking failures identified in audit v3
-- Accounts for existing schema differences (user_id vs customer_id)
-- =====================================================================================

-- =====================================================================================
-- PHASE 1: ADD MISSING COLUMNS TO PAYMENT_INTENTS
-- =====================================================================================

-- Add missing columns to existing payment_intents table
ALTER TABLE payment_intents 
ADD COLUMN IF NOT EXISTS client_secret TEXT,
ADD COLUMN IF NOT EXISTS provider_response JSONB,
ADD COLUMN IF NOT EXISTS inventory_reserved BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS reserved_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS reservation_expires_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS shipping_address JSONB,
ADD COLUMN IF NOT EXISTS billing_address JSONB;

-- Add unique constraint for provider-specific payment intent IDs
ALTER TABLE payment_intents 
DROP CONSTRAINT IF EXISTS unique_payment_intent_provider;

ALTER TABLE payment_intents 
ADD CONSTRAINT unique_payment_intent_provider UNIQUE (provider, payment_intent_id);

-- Add missing indexes
CREATE INDEX IF NOT EXISTS idx_payment_intents_user ON payment_intents (user_id);
CREATE INDEX IF NOT EXISTS idx_payment_intents_cart ON payment_intents (cart_id);
CREATE INDEX IF NOT EXISTS idx_payment_intents_status ON payment_intents (status);
CREATE INDEX IF NOT EXISTS idx_payment_intents_expires ON payment_intents (expires_at) WHERE status = 'pending';

-- =====================================================================================
-- PHASE 2: FIX ACQUIRE_NEXT_JOB FUNCTION - Critical for Worker Operation
-- =====================================================================================

-- Drop existing function to recreate with correct signature
DROP FUNCTION IF EXISTS public.acquire_next_job(TEXT, INT);

-- Recreate with correct parameter name that matches Edge Function call
CREATE OR REPLACE FUNCTION public.acquire_next_job(
    p_worker_id TEXT,
    p_lock_timeout_seconds INTEGER DEFAULT 30
) RETURNS TABLE (
    id UUID,
    job_type TEXT,
    payload JSONB,  -- Changed from job_data to match Edge Function expectation
    attempts INTEGER,  -- Changed from retry_count to match Edge Function
    max_attempts INTEGER  -- Changed from max_retries to match Edge Function
) AS $$
BEGIN
    RETURN QUERY
    UPDATE job_queue jq
    SET 
        status = 'processing',
        locked_by = p_worker_id,
        locked_at = NOW(),
        updated_at = NOW()
    WHERE jq.id = (
        SELECT jq2.id 
        FROM job_queue jq2
        WHERE jq2.status = 'pending'
            AND jq2.scheduled_for <= NOW()
            AND (jq2.locked_at IS NULL OR jq2.locked_at < NOW() - (p_lock_timeout_seconds || ' seconds')::INTERVAL)
        ORDER BY jq2.priority, jq2.created_at
        FOR UPDATE SKIP LOCKED
        LIMIT 1
    )
    RETURNING 
        jq.id,
        jq.job_type,
        jq.job_data AS payload,  -- Alias to match Edge Function expectation
        jq.retry_count AS attempts,  -- Alias to match Edge Function expectation
        jq.max_retries AS max_attempts;  -- Alias to match Edge Function expectation
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================================================
-- PHASE 3: CREATE SOFT RESERVATION FUNCTION WITH ATOMICITY
-- =====================================================================================

CREATE OR REPLACE FUNCTION public.reserve_inventory_for_payment(
    p_cart_id UUID,
    p_payment_intent_id TEXT
) RETURNS JSONB AS $$
DECLARE
    v_reserved_items INT := 0;
    v_total_items INT := 0;
    v_insufficiency_details JSONB := '[]'::JSONB;
    v_item RECORD;
    v_variant_id_result UUID;
BEGIN
    -- Count total items in cart
    SELECT COUNT(*) INTO v_total_items
    FROM cart_items
    WHERE cart_id = p_cart_id;
    
    IF v_total_items = 0 THEN
        RETURN jsonb_build_object(
            'success', false,
            'message', 'Cart is empty',
            'reserved_items', 0
        );
    END IF;
    
    -- Process each cart item in deterministic order (prevent deadlocks)
    FOR v_item IN 
        SELECT ci.variant_id, ci.quantity, pv.sku
        FROM cart_items ci
        JOIN product_variants pv ON pv.id = ci.variant_id
        WHERE ci.cart_id = p_cart_id
        ORDER BY ci.variant_id  -- Deterministic order
    LOOP
        -- Attempt to reserve inventory
        UPDATE inventory
        SET 
            quantity_reserved = quantity_reserved + v_item.quantity,
            updated_at = NOW()
        WHERE variant_id = v_item.variant_id
            AND quantity_available >= v_item.quantity
        RETURNING variant_id INTO v_variant_id_result;
        
        -- Check if reservation succeeded
        IF v_variant_id_result IS NOT NULL THEN
            v_reserved_items := v_reserved_items + 1;
        ELSE
            -- Build insufficiency details for error reporting
            v_insufficiency_details := v_insufficiency_details || 
                jsonb_build_object(
                    'variant_id', v_item.variant_id,
                    'sku', v_item.sku,
                    'requested', v_item.quantity
                );
        END IF;
    END LOOP;
    
    -- CRITICAL: Check if all items were reserved
    IF v_reserved_items < v_total_items THEN
        -- ATOMICITY FIX: Raise exception to rollback all reservations
        RAISE EXCEPTION 'Insufficient inventory for % item(s): %', 
            v_total_items - v_reserved_items,
            v_insufficiency_details::TEXT;
    END IF;
    
    -- Mark payment intent as having reserved inventory
    UPDATE payment_intents
    SET 
        inventory_reserved = true,
        reserved_at = NOW(),
        reservation_expires_at = NOW() + INTERVAL '15 minutes',
        updated_at = NOW()
    WHERE payment_intent_id = p_payment_intent_id;
    
    RETURN jsonb_build_object(
        'success', true,
        'message', 'Inventory reserved successfully',
        'reserved_items', v_reserved_items,
        'payment_intent_id', p_payment_intent_id
    );
    
EXCEPTION
    WHEN OTHERS THEN
        -- Any exception will automatically rollback the transaction
        -- This ensures atomicity - all or nothing
        RAISE;  -- Re-raise the exception for proper error handling
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================================================
-- PHASE 4: FIX PROCESS_ORDER_WITH_OCC - Add True OCC Predicates
-- Note: Adapted for user_id instead of customer_id
-- =====================================================================================

CREATE OR REPLACE FUNCTION public.process_order_with_occ(
    p_payment_intent_id TEXT,
    p_webhook_event_id UUID DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
    v_order_id UUID;
    v_payment_intent RECORD;
    v_total_amount DECIMAL(12,2);
    v_items_needed INT;
    v_items_processed INT;
    v_cart_id UUID;
    v_user_id UUID;
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
    
    -- Count items we need to process
    SELECT COUNT(*) INTO v_items_needed
    FROM cart_items
    WHERE cart_id = v_cart_id;
    
    -- Calculate total from cart (convert to cents for orders table)
    SELECT SUM(ci.quantity * pv.price) * 100
    INTO v_total_amount
    FROM cart_items ci
    JOIN product_variants pv ON pv.id = ci.variant_id
    WHERE ci.cart_id = v_cart_id;
    
    -- Create order record (using user_id to match actual schema)
    INSERT INTO orders (
        user_id,  -- Note: using user_id not customer_id
        status, 
        total_cents,  -- Note: using total_cents not total_amount
        payment_intent_id,
        metadata
    )
    VALUES (
        v_user_id,
        'payment_authorized',
        v_total_amount::INTEGER,
        p_payment_intent_id,
        jsonb_build_object(
            'webhook_event_id', p_webhook_event_id,
            'payment_provider', v_payment_intent.provider,
            'payment_metadata', v_payment_intent.provider_response
        )
    )
    RETURNING id INTO v_order_id;
    
    -- CRITICAL FIX: Decrement inventory with OCC predicate and row count validation
    WITH cart_demand AS (
        SELECT 
            ci.variant_id,
            ci.quantity as needed,
            pv.price * 100 as price_cents,  -- Convert to cents
            p.vendor_id
        FROM cart_items ci
        JOIN product_variants pv ON pv.id = ci.variant_id
        JOIN products p ON p.id = pv.product_id
        WHERE ci.cart_id = v_cart_id
        ORDER BY ci.variant_id  -- Deterministic order
    ),
    inventory_update AS (
        UPDATE inventory i
        SET 
            quantity_available = i.quantity_available - cd.needed,
            -- Also reduce reserved quantity if it was reserved
            quantity_reserved = GREATEST(i.quantity_reserved - cd.needed, 0),
            version = i.version + 1,
            updated_at = NOW()
        FROM cart_demand cd
        WHERE i.variant_id = cd.variant_id
            -- CRITICAL OCC PREDICATE: Only update if sufficient quantity
            AND i.quantity_available >= cd.needed
        RETURNING i.variant_id, cd.needed, cd.price_cents, cd.vendor_id
    ),
    items_created AS (
        INSERT INTO order_items (
            order_id,
            variant_id,
            vendor_id,
            quantity,
            price_cents  -- Using price_cents to match actual schema
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
    SELECT COUNT(*) INTO v_items_processed
    FROM items_created;
    
    -- CRITICAL VALIDATION: Ensure ALL items were processed
    IF v_items_processed != v_items_needed THEN
        -- Some items couldn't be processed due to insufficient inventory
        -- This should trigger a full rollback
        RAISE EXCEPTION 'Insufficient inventory: only % of % items could be processed', 
            v_items_processed, v_items_needed;
    END IF;
    
    -- Update order status to confirmed
    UPDATE orders 
    SET 
        status = 'inventory_confirmed',
        confirmed_at = NOW()
    WHERE id = v_order_id;
    
    -- Clear the cart
    DELETE FROM cart_items WHERE cart_id = v_cart_id;
    
    -- Record inventory movements for audit trail
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
    WHERE oi.order_id = v_order_id;
    
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

-- =====================================================================================
-- PHASE 5: CREATE RELEASE INVENTORY RESERVATION FUNCTION
-- =====================================================================================

CREATE OR REPLACE FUNCTION public.release_inventory_reservation(
    p_payment_intent_id TEXT
) RETURNS JSONB AS $$
DECLARE
    v_payment_intent RECORD;
    v_released_count INT := 0;
BEGIN
    -- Get payment intent details
    SELECT * INTO v_payment_intent
    FROM payment_intents
    WHERE payment_intent_id = p_payment_intent_id
        AND inventory_reserved = true;
    
    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'message', 'No active reservation found'
        );
    END IF;
    
    -- Release all reserved inventory for this cart
    WITH released AS (
        UPDATE inventory i
        SET 
            quantity_reserved = GREATEST(i.quantity_reserved - ci.quantity, 0),
            updated_at = NOW()
        FROM cart_items ci
        WHERE ci.cart_id = v_payment_intent.cart_id
            AND i.variant_id = ci.variant_id
        RETURNING i.variant_id
    )
    SELECT COUNT(*) INTO v_released_count FROM released;
    
    -- Mark reservation as released
    UPDATE payment_intents
    SET 
        inventory_reserved = false,
        updated_at = NOW()
    WHERE payment_intent_id = p_payment_intent_id;
    
    RETURN jsonb_build_object(
        'success', true,
        'message', 'Inventory reservation released',
        'released_items', v_released_count
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================================================
-- PHASE 6: RLS POLICIES FOR PAYMENT_INTENTS (using user_id)
-- =====================================================================================

-- Enable RLS on payment_intents
ALTER TABLE payment_intents ENABLE ROW LEVEL SECURITY;

-- Drop any existing policies
DROP POLICY IF EXISTS "Users can view own payment intents" ON payment_intents;
DROP POLICY IF EXISTS "Service role manages payment intents" ON payment_intents;

-- Policy: Users can only view their own payment intents (using user_id)
CREATE POLICY "Users can view own payment intents" ON payment_intents
    FOR SELECT USING (auth.uid() = user_id);

-- Policy: Only service role can create/update payment intents
CREATE POLICY "Service role manages payment intents" ON payment_intents
    FOR ALL USING (auth.role() = 'service_role');

-- =====================================================================================
-- PHASE 7: GRANT NECESSARY PERMISSIONS
-- =====================================================================================

-- Grant execute permissions on functions to service role
GRANT EXECUTE ON FUNCTION public.acquire_next_job(TEXT, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION public.reserve_inventory_for_payment(UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_inventory_reservation(TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.process_order_with_occ(TEXT, UUID) TO service_role;

-- Grant necessary table permissions
GRANT ALL ON payment_intents TO service_role;
GRANT SELECT ON payment_intents TO authenticated;

-- =====================================================================================
-- PHASE 8: CREATE HELPER FUNCTION FOR EXPIRED RESERVATION CLEANUP
-- =====================================================================================

CREATE OR REPLACE FUNCTION public.cleanup_expired_reservations() 
RETURNS INTEGER AS $$
DECLARE
    v_released_count INT := 0;
    v_intent RECORD;
BEGIN
    -- Find all expired reservations
    FOR v_intent IN 
        SELECT payment_intent_id
        FROM payment_intents
        WHERE inventory_reserved = true
            AND reservation_expires_at < NOW()
            AND status != 'succeeded'
    LOOP
        -- Release each expired reservation
        PERFORM release_inventory_reservation(v_intent.payment_intent_id);
        v_released_count := v_released_count + 1;
    END LOOP;
    
    RETURN v_released_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================================================
-- MIGRATION COMPLETE: Phoenix Protocol Remediation Applied
-- =====================================================================================

-- Summary of fixes:
-- 1. ✅ Updated existing payment_intents table with missing columns
-- 2. ✅ Fixed acquire_next_job function signature to match Edge Function calls
-- 3. ✅ Created atomic reserve_inventory_for_payment with RAISE EXCEPTION
-- 4. ✅ Fixed process_order_with_occ with proper OCC predicates and row validation
-- 5. ✅ Added release_inventory_reservation for cleanup
-- 6. ✅ Applied proper RLS policies (using user_id not customer_id)
-- 7. ✅ Created cleanup function for expired reservations
-- 8. ✅ Adapted all functions for existing schema (user_id, total_cents, price_cents)

-- The Live Order Pipeline has been resurrected from its ashes!
