-- ============================================================================
-- KB Stylish Trust Engine - Part 4: Vendor Reply Secure RPC
-- Migration: Create secure vendor reply function using unified review_replies
-- Created: 2025-09-25 09:33:00
-- Author: Principal Backend Architect
-- ============================================================================

-- FUNCTION: submit_vendor_reply_secure - Vendor-owned secure reply creation
CREATE OR REPLACE FUNCTION public.submit_vendor_reply_secure(
    p_review_id UUID,
    p_comment TEXT
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_vendor_id UUID;
    v_review RECORD;
    v_reply_id UUID;
    v_comment TEXT;
BEGIN
    -- Authentication
    v_vendor_id := auth.uid();
    IF v_vendor_id IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Authentication required',
            'error_code', 'AUTH_REQUIRED'
        );
    END IF;

    -- Validate input
    v_comment := NULLIF(TRIM(p_comment), '');
    IF v_comment IS NULL OR length(v_comment) < 10 THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Reply must be at least 10 characters',
            'error_code', 'COMMENT_TOO_SHORT'
        );
    END IF;
    IF length(v_comment) > 2000 THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Reply must be less than 2000 characters',
            'error_code', 'COMMENT_TOO_LONG'
        );
    END IF;

    -- Validate review exists and vendor owns the product
    SELECT r.id, p.vendor_id
    INTO v_review
    FROM public.reviews r
    JOIN public.products p ON p.id = r.product_id
    WHERE r.id = p_review_id
      AND r.deleted_at IS NULL;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Review not found',
            'error_code', 'REVIEW_NOT_FOUND'
        );
    END IF;

    IF v_review.vendor_id != v_vendor_id THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'You can only reply to reviews of your own products',
            'error_code', 'NOT_PRODUCT_VENDOR'
        );
    END IF;

    -- Insert reply (one vendor reply per review enforced by unique index)
    BEGIN
        INSERT INTO public.review_replies (
            review_id,
            user_id,
            comment,
            reply_type,
            is_visible,
            is_approved
        ) VALUES (
            p_review_id,
            v_vendor_id,
            v_comment,
            'vendor',
            true,
            true
        ) RETURNING id INTO v_reply_id;
    EXCEPTION
        WHEN unique_violation THEN
            RETURN jsonb_build_object(
                'success', false,
                'error', 'You have already replied to this review',
                'error_code', 'REPLY_EXISTS'
            );
    END;

    -- Increment reply_count best-effort
    UPDATE public.reviews
    SET reply_count = reply_count + 1
    WHERE id = p_review_id;

    RETURN jsonb_build_object(
        'success', true,
        'reply_id', v_reply_id,
        'message', 'Reply submitted successfully'
    );

EXCEPTION
    WHEN OTHERS THEN
        RAISE LOG 'Vendor reply error for vendor % review %: % %', v_vendor_id, p_review_id, SQLERRM, SQLSTATE;
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Unable to submit reply at this time',
            'error_code', 'INTERNAL_ERROR'
        );
END;
$$;

COMMENT ON FUNCTION public.submit_vendor_reply_secure IS
'Creates a vendor reply for a review with strict ownership verification.\n- Uses unified review_replies table with reply_type=vendor\n- Enforces one reply per review with unique index\n- Increments reply_count on reviews best-effort';

GRANT EXECUTE ON FUNCTION public.submit_vendor_reply_secure TO authenticated;
