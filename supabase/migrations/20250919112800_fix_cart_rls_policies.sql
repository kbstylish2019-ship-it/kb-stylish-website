-- SECURITY REMEDIATION: Fix Critical RLS Policies for Cart System
-- Created: 2025-09-19 11:28:00
-- 
-- This migration fixes the critical security vulnerability where the cart RLS policies
-- allowed any authenticated user to access ANY guest cart by using the flawed
-- "OR session_id IS NOT NULL" condition.
-- 
-- CRITICAL SECURITY ISSUE ADDRESSED:
-- The original policies allowed privilege escalation where authenticated users could
-- read/modify any guest cart, completely bypassing intended access controls.

-- =============================================================================
-- PART 1: DROP INSECURE RLS POLICIES
-- =============================================================================

-- Drop all existing cart policies that contain the security vulnerability
DROP POLICY IF EXISTS "Users can view their own carts" ON carts;
DROP POLICY IF EXISTS "Users can create their own carts" ON carts;
DROP POLICY IF EXISTS "Users can update their own carts" ON carts;
DROP POLICY IF EXISTS "Users can delete their own carts" ON carts;
DROP POLICY IF EXISTS "Users can view cart items" ON cart_items;
DROP POLICY IF EXISTS "Users can manage cart items" ON cart_items;

-- =============================================================================
-- PART 2: CREATE SECURE RLS POLICIES
-- =============================================================================

-- Secure Cart Policies
-- Users can only access carts that belong to them (authenticated users)
CREATE POLICY "Authenticated users can view their own carts" ON carts
    FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Authenticated users can create their own carts" ON carts
    FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "Authenticated users can update their own carts" ON carts
    FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "Authenticated users can delete their own carts" ON carts
    FOR DELETE USING (user_id = auth.uid());

-- Guest cart policies (service role only - no direct user access)
-- Guest carts are managed exclusively through secure Edge Functions
-- that use service role with proper session validation
CREATE POLICY "Service role can manage guest carts" ON carts
    FOR ALL USING (
        -- Only allow service role operations on guest carts
        auth.jwt() ->> 'role' = 'service_role' 
        AND user_id IS NULL 
        AND session_id IS NOT NULL
    );

-- Secure Cart Items Policies
-- Users can only access cart items in their own carts
CREATE POLICY "Authenticated users can view their cart items" ON cart_items
    FOR SELECT USING (
        cart_id IN (
            SELECT id FROM carts WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "Authenticated users can manage their cart items" ON cart_items
    FOR ALL USING (
        cart_id IN (
            SELECT id FROM carts WHERE user_id = auth.uid()
        )
    );

-- Service role can manage guest cart items
CREATE POLICY "Service role can manage guest cart items" ON cart_items
    FOR ALL USING (
        auth.jwt() ->> 'role' = 'service_role' 
        AND cart_id IN (
            SELECT id FROM carts 
            WHERE user_id IS NULL 
            AND session_id IS NOT NULL
        )
    );

-- =============================================================================
-- PART 3: ADDITIONAL SECURITY ENHANCEMENTS
-- =============================================================================

-- Add function to validate guest session tokens (future enhancement)
-- This can be used later to implement signed guest session tokens
CREATE OR REPLACE FUNCTION public.validate_guest_session(
    p_session_id TEXT,
    p_signature TEXT DEFAULT NULL
) RETURNS BOOLEAN AS $$
BEGIN
    -- Future implementation: validate HMAC signature of session token
    -- For now, just check basic format
    IF p_session_id IS NULL OR NOT p_session_id LIKE 'guest_%' THEN
        RETURN FALSE;
    END IF;
    
    -- Additional validation can be added here:
    -- - Check session expiry
    -- - Validate HMAC signature
    -- - Check against allowlist/blocklist
    
    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Add audit logging for cart access (security monitoring)
CREATE TABLE IF NOT EXISTS public.cart_audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cart_id UUID REFERENCES public.carts(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    session_id TEXT,
    action TEXT NOT NULL, -- 'create', 'read', 'update', 'delete', 'add_item', 'remove_item'
    ip_address INET,
    user_agent TEXT,
    success BOOLEAN NOT NULL DEFAULT TRUE,
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for audit queries
CREATE INDEX idx_cart_audit_log_cart_id ON cart_audit_log (cart_id);
CREATE INDEX idx_cart_audit_log_user_id ON cart_audit_log (user_id);
CREATE INDEX idx_cart_audit_log_created_at ON cart_audit_log (created_at DESC);

-- RLS for audit log (admins only)
ALTER TABLE cart_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Only admins can view cart audit logs" ON cart_audit_log
    FOR SELECT USING (public.user_has_role(auth.uid(), 'admin'));

-- Function to log cart actions (callable by Edge Functions)
CREATE OR REPLACE FUNCTION public.log_cart_action(
    p_cart_id UUID,
    p_user_id UUID DEFAULT NULL,
    p_session_id TEXT DEFAULT NULL,
    p_action TEXT,
    p_success BOOLEAN DEFAULT TRUE,
    p_error_message TEXT DEFAULT NULL
) RETURNS VOID AS $$
BEGIN
    INSERT INTO public.cart_audit_log (
        cart_id,
        user_id,
        session_id,
        action,
        success,
        error_message
    ) VALUES (
        p_cart_id,
        p_user_id,
        p_session_id,
        p_action,
        p_success,
        p_error_message
    );
EXCEPTION
    WHEN OTHERS THEN
        -- Don't fail the main operation if audit logging fails
        NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================================================
-- PART 4: SECURE CART HELPER FUNCTIONS UPDATE
-- =============================================================================

-- Update get_or_create_cart function to be more secure
CREATE OR REPLACE FUNCTION public.get_or_create_cart(
    p_user_id UUID DEFAULT NULL,
    p_session_id TEXT DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
    v_cart_id UUID;
    v_current_role TEXT;
BEGIN
    -- Get the current JWT role
    v_current_role := auth.jwt() ->> 'role';
    
    -- Validate input
    IF p_user_id IS NULL AND p_session_id IS NULL THEN
        RAISE EXCEPTION 'Either user_id or session_id must be provided';
    END IF;
    
    IF p_user_id IS NOT NULL AND p_session_id IS NOT NULL THEN
        RAISE EXCEPTION 'Cannot provide both user_id and session_id';
    END IF;
    
    -- For guest carts, ensure only service role can create them
    IF p_session_id IS NOT NULL AND v_current_role != 'service_role' THEN
        RAISE EXCEPTION 'Guest cart operations require service role';
    END IF;
    
    -- For authenticated users, ensure they can only create their own cart
    IF p_user_id IS NOT NULL AND p_user_id != auth.uid() AND v_current_role != 'service_role' THEN
        RAISE EXCEPTION 'Cannot create cart for different user';
    END IF;
    
    -- Validate guest session format
    IF p_session_id IS NOT NULL AND NOT validate_guest_session(p_session_id) THEN
        RAISE EXCEPTION 'Invalid guest session format';
    END IF;
    
    -- Try to get existing cart
    IF p_user_id IS NOT NULL THEN
        SELECT id INTO v_cart_id FROM carts WHERE user_id = p_user_id;
    ELSE
        SELECT id INTO v_cart_id FROM carts WHERE session_id = p_session_id;
    END IF;
    
    -- Create new cart if not exists
    IF v_cart_id IS NULL THEN
        INSERT INTO carts (user_id, session_id)
        VALUES (p_user_id, p_session_id)
        RETURNING id INTO v_cart_id;
        
        -- Log cart creation
        PERFORM log_cart_action(
            v_cart_id,
            p_user_id,
            p_session_id,
            'create',
            TRUE
        );
    END IF;
    
    RETURN v_cart_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update merge_carts function with additional security checks
CREATE OR REPLACE FUNCTION public.merge_carts(
    p_user_id UUID,
    p_session_id TEXT
) RETURNS JSONB AS $$
DECLARE
    v_user_cart_id UUID;
    v_guest_cart_id UUID;
    v_merged_count INT := 0;
    v_clamped_count INT := 0;
    v_current_role TEXT;
BEGIN
    -- Get the current JWT role
    v_current_role := auth.jwt() ->> 'role';
    
    -- Security check: ensure user can only merge into their own cart
    IF p_user_id != auth.uid() AND v_current_role != 'service_role' THEN
        RAISE EXCEPTION 'Cannot merge carts for different user';
    END IF;
    
    -- Validate guest session
    IF NOT validate_guest_session(p_session_id) THEN
        RAISE EXCEPTION 'Invalid guest session format';
    END IF;
    
    -- Lock both carts in deterministic order (user cart first)
    SELECT id INTO v_user_cart_id 
    FROM carts 
    WHERE user_id = p_user_id 
    FOR UPDATE;
    
    SELECT id INTO v_guest_cart_id 
    FROM carts 
    WHERE session_id = p_session_id 
    FOR UPDATE;
    
    -- Nothing to merge if guest cart doesn't exist
    IF v_guest_cart_id IS NULL THEN
        RETURN jsonb_build_object(
            'success', true,
            'merged_items', 0,
            'clamped_items', 0
        );
    END IF;
    
    -- Create user cart if doesn't exist
    IF v_user_cart_id IS NULL THEN
        INSERT INTO carts (user_id)
        VALUES (p_user_id)
        RETURNING id INTO v_user_cart_id;
    END IF;
    
    -- Merge items with quantity clamping to available stock
    WITH guest_items AS (
        SELECT 
            ci.variant_id,
            ci.quantity,
            pv.price as current_price
        FROM cart_items ci
        JOIN product_variants pv ON pv.id = ci.variant_id
        WHERE ci.cart_id = v_guest_cart_id
    ),
    stock_check AS (
        SELECT 
            gi.variant_id,
            gi.quantity,
            gi.current_price,
            COALESCE(SUM(i.quantity_available), 0) as stock_available,
            COALESCE(uci.quantity, 0) as existing_quantity
        FROM guest_items gi
        LEFT JOIN inventory i ON i.variant_id = gi.variant_id
        LEFT JOIN cart_items uci ON uci.cart_id = v_user_cart_id 
            AND uci.variant_id = gi.variant_id
        GROUP BY gi.variant_id, gi.quantity, gi.current_price, uci.quantity
    ),
    merge_result AS (
        INSERT INTO cart_items (cart_id, variant_id, quantity, price_snapshot)
        SELECT 
            v_user_cart_id,
            variant_id,
            LEAST(quantity + existing_quantity, stock_available, 99), -- Cap at 99 items
            current_price
        FROM stock_check
        WHERE stock_available > 0
        ON CONFLICT (cart_id, variant_id) 
        DO UPDATE SET 
            quantity = LEAST(
                cart_items.quantity + EXCLUDED.quantity, 
                (SELECT stock_available FROM stock_check WHERE variant_id = EXCLUDED.variant_id),
                99
            ),
            price_snapshot = EXCLUDED.price_snapshot,
            updated_at = NOW()
        RETURNING 
            variant_id,
            quantity,
            CASE 
                WHEN quantity < (
                    SELECT quantity + existing_quantity 
                    FROM stock_check 
                    WHERE variant_id = cart_items.variant_id
                )
                THEN 1 ELSE 0 
            END as was_clamped
    )
    SELECT 
        COUNT(*) as merged,
        SUM(was_clamped) as clamped
    INTO v_merged_count, v_clamped_count
    FROM merge_result;
    
    -- Delete guest cart items and cart
    DELETE FROM cart_items WHERE cart_id = v_guest_cart_id;
    DELETE FROM carts WHERE id = v_guest_cart_id;
    
    -- Update user cart timestamp
    UPDATE carts SET updated_at = NOW() WHERE id = v_user_cart_id;
    
    -- Log merge operation
    PERFORM log_cart_action(
        v_user_cart_id,
        p_user_id,
        NULL,
        'merge',
        TRUE,
        'Merged ' || v_merged_count || ' items, clamped ' || v_clamped_count
    );
    
    RETURN jsonb_build_object(
        'success', true,
        'merged_items', v_merged_count,
        'clamped_items', v_clamped_count,
        'user_cart_id', v_user_cart_id
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================================================
-- Migration Complete - Security Vulnerabilities Remediated
-- =============================================================================

-- This migration addresses the critical security issues:
-- 1. Removed "OR session_id IS NOT NULL" from RLS policies
-- 2. Implemented proper separation between authenticated and guest cart access
-- 3. Added service role restrictions for guest cart operations
-- 4. Enhanced security validation in helper functions
-- 5. Added audit logging for security monitoring
-- 6. Validated guest session formats

-- Next steps:
-- 1. Update Edge Function to use anon key instead of service role key
-- 2. Implement proper JWT authentication in cart-manager
-- 3. Add session signature validation for enhanced guest cart security
