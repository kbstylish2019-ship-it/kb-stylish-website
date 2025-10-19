-- =====================================================================
-- CRITICAL FIX: Update submit_vendor_application_secure RPC
-- Issue: Still writing to dropped columns (bank_account_number, etc.)
-- Solution: Write to encrypted columns using pgp_sym_encrypt
-- =====================================================================

BEGIN;

-- Drop old function
DROP FUNCTION IF EXISTS public.submit_vendor_application_secure(UUID, jsonb);

-- Recreate with encryption support
CREATE OR REPLACE FUNCTION public.submit_vendor_application_secure(
    p_user_id UUID,
    p_application_data jsonb
)
RETURNS jsonb
SECURITY DEFINER
SET search_path = public, private, extensions, pg_temp
LANGUAGE plpgsql
AS $$
DECLARE
    v_user_id UUID;
    v_business_name TEXT;
    v_business_type TEXT;
    v_bank_account_name TEXT;
    v_bank_account_number TEXT;
    v_bank_name TEXT;
    v_bank_branch TEXT;
    v_esewa_number TEXT;
    v_khalti_number TEXT;
    v_existing_state TEXT;
    v_encryption_key TEXT;
BEGIN
    -- ========================================================================
    -- AUTHENTICATION: Validate user_id
    -- ========================================================================
    IF current_setting('request.jwt.claims', true)::jsonb->>'role' = 'service_role' THEN
        -- Called by service_role (Edge Function) - use provided user_id
        IF p_user_id IS NULL THEN
            RETURN jsonb_build_object(
                'success', false,
                'error', 'User ID is required',
                'error_code', 'MISSING_USER_ID'
            );
        END IF;
        
        v_user_id := p_user_id;
        RAISE LOG 'submit_vendor_application_secure: Called by service_role for user %', v_user_id;
    ELSE
        -- Called directly by client - verify user is acting for themselves
        IF p_user_id != auth.uid() OR auth.uid() IS NULL THEN
            RETURN jsonb_build_object(
                'success', false,
                'error', 'Unauthorized access',
                'error_code', 'UNAUTHORIZED'
            );
        END IF;
        
        v_user_id := auth.uid();
        RAISE LOG 'submit_vendor_application_secure: Called by authenticated user %', v_user_id;
    END IF;
    
    -- ========================================================================
    -- EXTRACT AND VALIDATE DATA
    -- ========================================================================
    v_business_name := p_application_data->>'business_name';
    v_business_type := p_application_data->>'business_type';
    v_bank_account_name := p_application_data->>'bank_account_name';
    v_bank_account_number := p_application_data->>'bank_account_number';
    v_bank_name := p_application_data->>'bank_name';
    v_bank_branch := p_application_data->>'bank_branch';
    v_esewa_number := p_application_data->>'esewa_number';
    v_khalti_number := p_application_data->>'khalti_number';
    
    -- Validate required fields
    IF v_business_name IS NULL OR v_business_name = '' THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Business name is required',
            'error_code', 'MISSING_BUSINESS_NAME'
        );
    END IF;
    
    IF v_business_type IS NULL OR v_business_type = '' THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Business type is required',
            'error_code', 'MISSING_BUSINESS_TYPE'
        );
    END IF;
    
    -- Validate at least one payment method is provided
    IF (v_bank_account_number IS NULL OR v_bank_account_number = '') AND
       (v_esewa_number IS NULL OR v_esewa_number = '') AND
       (v_khalti_number IS NULL OR v_khalti_number = '') THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'At least one payment method is required',
            'error_code', 'MISSING_PAYMENT_METHOD'
        );
    END IF;
    
    -- Get encryption key
    v_encryption_key := private.get_encryption_key();
    
    -- ========================================================================
    -- CHECK EXISTING APPLICATION
    -- ========================================================================
    SELECT application_state 
    INTO v_existing_state 
    FROM vendor_profiles 
    WHERE user_id = v_user_id;
    
    IF FOUND THEN
        IF v_existing_state IN ('submitted', 'under_review', 'info_requested') THEN
            RETURN jsonb_build_object(
                'success', false,
                'error', 'You already have a pending application',
                'error_code', 'APPLICATION_PENDING',
                'current_state', v_existing_state
            );
        ELSIF v_existing_state = 'approved' THEN
            RETURN jsonb_build_object(
                'success', false,
                'error', 'You are already an approved vendor',
                'error_code', 'ALREADY_VENDOR'
            );
        ELSIF v_existing_state = 'rejected' THEN
            -- Allow re-submission from rejected state (with encryption)
            UPDATE vendor_profiles
            SET 
                application_state = 'submitted',
                business_name = v_business_name,
                business_type = v_business_type,
                bank_account_name = v_bank_account_name,
                bank_name = v_bank_name,
                bank_branch = v_bank_branch,
                -- Encrypt sensitive fields
                bank_account_number_enc = CASE 
                    WHEN v_bank_account_number IS NOT NULL AND v_bank_account_number <> ''
                    THEN extensions.pgp_sym_encrypt(v_bank_account_number, v_encryption_key)
                    ELSE NULL
                END,
                esewa_number_enc = CASE 
                    WHEN v_esewa_number IS NOT NULL AND v_esewa_number <> ''
                    THEN extensions.pgp_sym_encrypt(v_esewa_number, v_encryption_key)
                    ELSE NULL
                END,
                khalti_number_enc = CASE 
                    WHEN v_khalti_number IS NOT NULL AND v_khalti_number <> ''
                    THEN extensions.pgp_sym_encrypt(v_khalti_number, v_encryption_key)
                    ELSE NULL
                END,
                application_submitted_at = NOW(),
                application_notes = NULL,
                updated_at = NOW()
            WHERE user_id = v_user_id;
            
            RAISE LOG 'submit_vendor_application_secure: Re-submitted application for user %', v_user_id;
            
            RETURN jsonb_build_object(
                'success', true,
                'message', 'Application re-submitted successfully! Our team will review it soon.',
                'application_state', 'submitted'
            );
        END IF;
    END IF;
    
    -- ========================================================================
    -- INSERT NEW APPLICATION (with encryption)
    -- ========================================================================
    INSERT INTO vendor_profiles (
        user_id,
        business_name,
        business_type,
        application_state,
        application_submitted_at,
        bank_account_name,
        bank_name,
        bank_branch,
        bank_account_number_enc,
        esewa_number_enc,
        khalti_number_enc,
        verification_status,
        created_at,
        updated_at
    )
    VALUES (
        v_user_id,
        v_business_name,
        v_business_type,
        'submitted',
        NOW(),
        v_bank_account_name,
        v_bank_name,
        v_bank_branch,
        -- Encrypt sensitive fields
        CASE 
            WHEN v_bank_account_number IS NOT NULL AND v_bank_account_number <> ''
            THEN extensions.pgp_sym_encrypt(v_bank_account_number, v_encryption_key)
            ELSE NULL
        END,
        CASE 
            WHEN v_esewa_number IS NOT NULL AND v_esewa_number <> ''
            THEN extensions.pgp_sym_encrypt(v_esewa_number, v_encryption_key)
            ELSE NULL
        END,
        CASE 
            WHEN v_khalti_number IS NOT NULL AND v_khalti_number <> ''
            THEN extensions.pgp_sym_encrypt(v_khalti_number, v_encryption_key)
            ELSE NULL
        END,
        'pending',
        NOW(),
        NOW()
    )
    ON CONFLICT (user_id) DO UPDATE
    SET 
        business_name = EXCLUDED.business_name,
        business_type = EXCLUDED.business_type,
        application_state = CASE 
            WHEN vendor_profiles.application_state IN ('rejected', 'draft') 
            THEN 'submitted'
            ELSE vendor_profiles.application_state
        END,
        bank_account_name = EXCLUDED.bank_account_name,
        bank_name = EXCLUDED.bank_name,
        bank_branch = EXCLUDED.bank_branch,
        bank_account_number_enc = EXCLUDED.bank_account_number_enc,
        esewa_number_enc = EXCLUDED.esewa_number_enc,
        khalti_number_enc = EXCLUDED.khalti_number_enc,
        application_submitted_at = NOW(),
        updated_at = NOW()
    WHERE vendor_profiles.application_state NOT IN ('submitted', 'under_review', 'info_requested', 'approved');
    
    RAISE LOG 'submit_vendor_application_secure: Successfully submitted application for user %', v_user_id;
    
    RETURN jsonb_build_object(
        'success', true,
        'message', 'Application submitted successfully! Our team will review it soon.',
        'application_state', 'submitted'
    );
    
EXCEPTION
    WHEN OTHERS THEN
        RAISE LOG 'submit_vendor_application_secure: Error for user %: %', v_user_id, SQLERRM;
        RETURN jsonb_build_object(
            'success', false,
            'error', 'An unexpected error occurred. Please try again or contact support.',
            'error_code', 'INTERNAL_ERROR'
        );
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION public.submit_vendor_application_secure(UUID, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.submit_vendor_application_secure(UUID, jsonb) TO authenticated;

-- Add documentation
COMMENT ON FUNCTION public.submit_vendor_application_secure IS 
'Submit vendor application with encrypted payment data. Writes to bank_account_number_enc, esewa_number_enc, khalti_number_enc columns. Uses Supabase Vault encryption key.';

-- Verification
DO $$
BEGIN
  RAISE NOTICE '✅ Vendor application RPC updated with encryption support';
  RAISE NOTICE '✅ Now writes to _enc columns instead of dropped columns';
END $$;

COMMIT;
