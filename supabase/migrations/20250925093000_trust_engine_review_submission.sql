-- ============================================================================
-- KB Stylish Trust Engine - Part 1: Review Submission Logic
-- Migration: Create secure review submission function
-- Created: 2025-09-25 09:30:00
-- Author: Principal Backend Architect
-- ============================================================================

-- This migration implements the Fort Knox of review submission with:
-- - Purchase verification with ownership validation
-- - Race condition protection via upsert pattern
-- - Reputation-based auto-moderation
-- - Intelligent job queueing for async processing

-- ============================================================================
-- FUNCTION: submit_review_secure - Purchase-Verified Review Submission
-- ============================================================================

CREATE OR REPLACE FUNCTION public.submit_review_secure(
    p_product_id UUID,
    p_order_id UUID,
    p_rating INTEGER,
    p_title TEXT DEFAULT NULL,
    p_comment TEXT DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID;
    v_order_item_id UUID;
    v_review_id UUID;
    v_user_reputation RECORD;
    v_order_status TEXT;
    v_days_since_delivery INTEGER;
    v_is_update BOOLEAN := false;
BEGIN
    -- DEFENSIVE LAYER 1: Authentication
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE LOG 'Unauthenticated review submission attempt for product %', p_product_id;
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Authentication required',
            'error_code', 'AUTH_REQUIRED'
        );
    END IF;

    -- DEFENSIVE LAYER 2: Input Validation
    IF p_rating IS NULL OR p_rating < 1 OR p_rating > 5 THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Rating must be between 1 and 5',
            'error_code', 'INVALID_RATING'
        );
    END IF;

    -- Sanitize text inputs
    p_title := NULLIF(TRIM(p_title), '');
    p_comment := NULLIF(TRIM(p_comment), '');

    -- DEFENSIVE LAYER 3: Comprehensive Order Validation (single atomic query)
    WITH order_validation AS (
        SELECT 
            oi.id AS order_item_id,
            o.status,
            o.delivered_at,
            EXTRACT(days FROM NOW() - o.delivered_at)::INTEGER AS days_since_delivery,
            EXISTS (
                SELECT 1 FROM reviews r 
                WHERE r.product_id = p_product_id 
                AND r.user_id = v_user_id 
                AND r.deleted_at IS NULL
            ) AS has_existing_review
        FROM orders o
        INNER JOIN order_items oi ON oi.order_id = o.id
        WHERE o.id = p_order_id
            AND o.user_id = v_user_id  -- CRITICAL: Verify ownership
            AND oi.product_id = p_product_id
        LIMIT 1
    )
    SELECT 
        order_item_id, 
        status, 
        days_since_delivery,
        has_existing_review
    INTO 
        v_order_item_id, 
        v_order_status, 
        v_days_since_delivery,
        v_is_update
    FROM order_validation;

    -- Validate order exists and is owned by user
    IF v_order_item_id IS NULL THEN
        -- Don't reveal whether order exists or not
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Unable to verify purchase',
            'error_code', 'PURCHASE_NOT_VERIFIED'
        );
    END IF;

    -- Check order status (must be delivered)
    IF v_order_status NOT IN ('delivered', 'completed') THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Review can only be submitted for delivered orders',
            'error_code', 'ORDER_NOT_DELIVERED'
        );
    END IF;

    -- Check review window (90 days)
    IF v_days_since_delivery > 90 THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Review period has expired',
            'error_code', 'REVIEW_PERIOD_EXPIRED'
        );
    END IF;

    -- DEFENSIVE LAYER 4: Get User Reputation for intelligent handling
    SELECT 
        overall_score,
        warnings_count,
        consecutive_approved
    INTO v_user_reputation
    FROM user_reputation
    WHERE user_id = v_user_id;

    -- Create default reputation if not exists
    IF NOT FOUND THEN
        INSERT INTO user_reputation (user_id, overall_score)
        VALUES (v_user_id, 50.00)
        RETURNING overall_score, warnings_count, consecutive_approved
        INTO v_user_reputation;
    END IF;

    -- DEFENSIVE LAYER 5: Upsert with Race Condition Protection
    BEGIN
        IF v_is_update THEN
            -- Update existing review
            UPDATE reviews 
            SET 
                rating = p_rating,
                title = COALESCE(SUBSTRING(p_title FROM 1 FOR 200), title),
                comment = COALESCE(p_comment, comment),
                is_edited = true,
                edit_count = edit_count + 1,
                last_edited_at = NOW(),
                updated_at = NOW(),
                -- Reset moderation based on reputation
                is_approved = CASE 
                    WHEN v_user_reputation.overall_score >= 80 THEN true
                    ELSE false 
                END,
                moderation_status = CASE
                    WHEN v_user_reputation.overall_score >= 80 THEN 'approved'
                    ELSE 'edited'
                END,
                moderated_at = CASE
                    WHEN v_user_reputation.overall_score >= 80 THEN NOW()
                    ELSE NULL
                END
            WHERE product_id = p_product_id 
                AND user_id = v_user_id
                AND deleted_at IS NULL
            RETURNING id INTO v_review_id;

            IF v_review_id IS NULL THEN
                -- Review was deleted between check and update
                RAISE EXCEPTION 'Review no longer exists';
            END IF;
        ELSE
            -- Insert new review
            INSERT INTO reviews (
                product_id,
                user_id,
                order_id,
                order_item_id,
                rating,
                title,
                comment,
                is_approved,
                moderation_status,
                moderated_at,
                moderated_by
            ) VALUES (
                p_product_id,
                v_user_id,
                p_order_id,
                v_order_item_id,
                p_rating,
                SUBSTRING(p_title FROM 1 FOR 200),
                p_comment,
                -- Auto-approve for highly trusted users
                CASE 
                    WHEN v_user_reputation.overall_score >= 80 
                     AND v_user_reputation.consecutive_approved >= 5 THEN true
                    ELSE false 
                END,
                CASE 
                    WHEN v_user_reputation.overall_score >= 80 
                     AND v_user_reputation.consecutive_approved >= 5 THEN 'approved'
                    ELSE 'pending' 
                END,
                CASE 
                    WHEN v_user_reputation.overall_score >= 80 
                     AND v_user_reputation.consecutive_approved >= 5 THEN NOW()
                    ELSE NULL 
                END,
                CASE 
                    WHEN v_user_reputation.overall_score >= 80 
                     AND v_user_reputation.consecutive_approved >= 5 THEN v_user_id
                    ELSE NULL 
                END
            )
            RETURNING id INTO v_review_id;
        END IF;
    EXCEPTION
        WHEN unique_violation THEN
            -- Race condition: another request created review first
            -- Try update instead
            UPDATE reviews 
            SET 
                rating = p_rating,
                title = COALESCE(SUBSTRING(p_title FROM 1 FOR 200), title),
                comment = COALESCE(p_comment, comment),
                is_edited = true,
                edit_count = edit_count + 1,
                last_edited_at = NOW(),
                updated_at = NOW()
            WHERE product_id = p_product_id 
                AND user_id = v_user_id
                AND deleted_at IS NULL
            RETURNING id INTO v_review_id;
            
            v_is_update := true;
    END;

    -- DEFENSIVE LAYER 6: Intelligent Job Queueing
    
    -- Queue moderation if not auto-approved
    IF v_user_reputation.overall_score < 80 OR v_user_reputation.consecutive_approved < 5 THEN
        INSERT INTO job_queue (
            job_type,
            priority,
            payload,
            idempotency_key,
            max_attempts
        ) VALUES (
            'moderate_review',
            CASE 
                WHEN v_user_reputation.warnings_count > 2 THEN 8  -- Low priority
                WHEN v_user_reputation.overall_score >= 70 THEN 3  -- High priority
                ELSE 5  -- Normal priority
            END,
            jsonb_build_object(
                'review_id', v_review_id,
                'user_reputation_score', v_user_reputation.overall_score,
                'is_edit', v_is_update
            ),
            'moderate_' || v_review_id::text || '_' || date_trunc('hour', NOW())::text,
            3
        ) ON CONFLICT (idempotency_key) DO NOTHING;
    END IF;

    -- Queue rating update (always, but deduplicated)
    INSERT INTO job_queue (
        job_type,
        priority,
        payload,
        idempotency_key,
        max_attempts
    ) VALUES (
        'update_product_rating',
        7,  -- Lower priority than moderation
        jsonb_build_object(
            'product_id', p_product_id,
            'trigger', 'new_review',
            'review_id', v_review_id
        ),
        'rating_' || p_product_id::text || '_' || date_trunc('minute', NOW())::text,
        5
    ) ON CONFLICT (idempotency_key) DO NOTHING;

    -- Return comprehensive response
    RETURN jsonb_build_object(
        'success', true,
        'review_id', v_review_id,
        'is_update', v_is_update,
        'status', CASE 
            WHEN v_user_reputation.overall_score >= 80 
             AND v_user_reputation.consecutive_approved >= 5 THEN 'approved'
            ELSE 'pending_moderation' 
        END,
        'message', CASE
            WHEN v_is_update THEN 'Review updated successfully'
            ELSE 'Review submitted successfully'
        END
    );

EXCEPTION
    WHEN OTHERS THEN
        -- Log detailed error for debugging, return safe error to client
        RAISE LOG 'Review submission error for user % product %: % %', 
            v_user_id, p_product_id, SQLERRM, SQLSTATE;
        
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Unable to process review at this time',
            'error_code', 'INTERNAL_ERROR'
        );
END;
$$;

-- Add comment
COMMENT ON FUNCTION public.submit_review_secure IS 
'Securely submits or updates a product review with comprehensive validation:
- Verifies purchase ownership (prevents fake reviews)
- Enforces review period limits (90 days after delivery)
- Handles race conditions gracefully (upsert pattern)
- Auto-approves trusted users based on reputation
- Queues moderation and rating update jobs
Returns structured JSON with success status and review details.';

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.submit_review_secure TO authenticated;

-- ============================================================================
-- Migration Complete - Part 1
-- ============================================================================

-- Review submission function deployed successfully.
-- This function is the gateway for all review operations, ensuring:
-- 1. Only verified purchasers can review products
-- 2. Reviews are tied to specific orders for audit trail
-- 3. High-reputation users get fast-track approval
-- 4. All reviews trigger async rating recalculation

-- Next: Deploy voting and aggregation functions in separate migrations
