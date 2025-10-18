-- ============================================================================
-- SUBMIT VENDOR APPLICATION RPC
-- Version: 1.0 (Growth Engine - Phase 2: API Layer)
-- Date: October 15, 2025
-- Purpose: Secure RPC for submitting vendor applications from frontend
-- Security: SECURITY DEFINER (bypasses RLS for controlled access)
-- Pattern: Follows create_vendor_product(p_product_data jsonb) pattern
-- ============================================================================

BEGIN;

-- ============================================================================
-- FUNCTION: submit_vendor_application_secure
-- Purpose: Accept vendor application data and create vendor_profile
-- Security: SECURITY DEFINER, validates user auth, prevents duplicate submissions
-- Input: JSONB with all application fields
-- Returns: { success: boolean, message?: string, error?: string }
-- ============================================================================

CREATE OR REPLACE FUNCTION public.submit_vendor_application_secure(
    p_application_data JSONB
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, private, pg_temp
SET statement_timeout = '10s'
AS $$
DECLARE
    v_user_id UUID;
    v_business_name TEXT;
    v_business_type TEXT;
    v_email TEXT;
    v_phone TEXT;
    v_website TEXT;
    v_payout_method TEXT;
    v_bank_name TEXT;
    v_bank_account_name TEXT;
    v_bank_account_number TEXT;
    v_bank_branch TEXT;
    v_esewa_number TEXT;
    v_khalti_number TEXT;
    v_existing_state TEXT;
    v_result_state TEXT;
BEGIN
    -- ========================================================================
    -- STEP 1: AUTHENTICATION
    -- ========================================================================
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Unauthorized: You must be logged in to submit an application',
            'error_code', 'AUTH_REQUIRED'
        );
    END IF;
    
    -- ========================================================================
    -- STEP 2: EXTRACT AND SANITIZE INPUT
    -- ========================================================================
    v_business_name := TRIM(p_application_data->>'business_name');
    v_business_type := TRIM(p_application_data->>'business_type');
    v_email := TRIM(LOWER(p_application_data->>'email'));
    v_phone := TRIM(REPLACE(REPLACE(p_application_data->>'phone', ' ', ''), '-', ''));
    v_website := TRIM(p_application_data->>'website');
    v_payout_method := LOWER(TRIM(p_application_data->>'payout_method'));
    v_bank_name := TRIM(p_application_data->>'bank_name');
    v_bank_account_name := TRIM(p_application_data->>'bank_account_name');
    v_bank_account_number := TRIM(p_application_data->>'bank_account_number');
    v_bank_branch := TRIM(p_application_data->>'bank_branch');
    v_esewa_number := TRIM(p_application_data->>'esewa_number');
    v_khalti_number := TRIM(p_application_data->>'khalti_number');
    
    -- ========================================================================
    -- STEP 3: VALIDATE REQUIRED FIELDS
    -- ========================================================================
    
    -- Validate business_name
    IF v_business_name IS NULL OR LENGTH(v_business_name) < 3 THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Business name must be at least 3 characters',
            'error_code', 'INVALID_BUSINESS_NAME'
        );
    END IF;
    
    IF LENGTH(v_business_name) > 200 THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Business name must be less than 200 characters',
            'error_code', 'BUSINESS_NAME_TOO_LONG'
        );
    END IF;
    
    -- Validate business_type
    IF v_business_type IS NULL OR v_business_type NOT IN ('Boutique', 'Salon', 'Designer', 'Manufacturer', 'Other') THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Invalid business type. Must be one of: Boutique, Salon, Designer, Manufacturer, Other',
            'error_code', 'INVALID_BUSINESS_TYPE'
        );
    END IF;
    
    -- Validate email format (RFC 5322 simplified)
    IF v_email IS NULL OR v_email !~ '^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$' THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Invalid email format. Please enter a valid email address.',
            'error_code', 'INVALID_EMAIL'
        );
    END IF;
    
    -- Validate Nepal phone number format (98XXXXXXXX or 97XXXXXXXX or 96XXXXXXXX)
    IF v_phone IS NULL OR v_phone !~ '^9[678][0-9]{8}$' THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Invalid phone number. Must be a valid Nepal mobile number (98XXXXXXXX, 97XXXXXXXX, or 96XXXXXXXX)',
            'error_code', 'INVALID_PHONE'
        );
    END IF;
    
    -- ========================================================================
    -- STEP 4: VALIDATE PAYOUT METHOD AND DETAILS
    -- ========================================================================
    IF v_payout_method IS NULL OR v_payout_method NOT IN ('bank', 'esewa', 'khalti') THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Invalid payout method. Must be one of: bank, esewa, khalti',
            'error_code', 'INVALID_PAYOUT_METHOD'
        );
    END IF;
    
    -- Validate bank details if bank method selected
    IF v_payout_method = 'bank' THEN
        IF v_bank_name IS NULL OR LENGTH(v_bank_name) < 2 THEN
            RETURN jsonb_build_object(
                'success', false,
                'error', 'Bank name is required when selecting bank payout method',
                'error_code', 'BANK_NAME_REQUIRED'
            );
        END IF;
        IF v_bank_account_name IS NULL OR LENGTH(v_bank_account_name) < 2 THEN
            RETURN jsonb_build_object(
                'success', false,
                'error', 'Bank account name is required',
                'error_code', 'BANK_ACCOUNT_NAME_REQUIRED'
            );
        END IF;
        IF v_bank_account_number IS NULL OR LENGTH(v_bank_account_number) < 5 THEN
            RETURN jsonb_build_object(
                'success', false,
                'error', 'Bank account number is required',
                'error_code', 'BANK_ACCOUNT_NUMBER_REQUIRED'
            );
        END IF;
    END IF;
    
    -- Validate eSewa details if eSewa method selected
    IF v_payout_method = 'esewa' THEN
        IF v_esewa_number IS NULL OR LENGTH(v_esewa_number) < 10 THEN
            RETURN jsonb_build_object(
                'success', false,
                'error', 'eSewa number is required when selecting eSewa payout method',
                'error_code', 'ESEWA_NUMBER_REQUIRED'
            );
        END IF;
    END IF;
    
    -- Validate Khalti details if Khalti method selected
    IF v_payout_method = 'khalti' THEN
        IF v_khalti_number IS NULL OR LENGTH(v_khalti_number) < 10 THEN
            RETURN jsonb_build_object(
                'success', false,
                'error', 'Khalti number is required when selecting Khalti payout method',
                'error_code', 'KHALTI_NUMBER_REQUIRED'
            );
        END IF;
    END IF;
    
    -- ========================================================================
    -- STEP 5: CHECK FOR EXISTING APPLICATION
    -- ========================================================================
    SELECT application_state INTO v_existing_state
    FROM vendor_profiles
    WHERE user_id = v_user_id;
    
    IF FOUND THEN
        -- User already has a vendor profile
        IF v_existing_state IN ('submitted', 'under_review', 'info_requested') THEN
            RETURN jsonb_build_object(
                'success', false,
                'error', 'You already have a pending application. Please wait for admin review.',
                'error_code', 'APPLICATION_PENDING',
                'current_state', v_existing_state
            );
        ELSIF v_existing_state = 'approved' THEN
            RETURN jsonb_build_object(
                'success', false,
                'error', 'You are already an approved vendor.',
                'error_code', 'ALREADY_VENDOR',
                'current_state', v_existing_state
            );
        ELSIF v_existing_state = 'rejected' THEN
            -- Allow re-submission for rejected applications
            -- Update existing profile instead of inserting new
            UPDATE vendor_profiles
            SET
                application_state = 'submitted',
                business_name = v_business_name,
                business_type = v_business_type,
                bank_account_name = v_bank_account_name,
                bank_account_number = v_bank_account_number,
                bank_name = v_bank_name,
                bank_branch = v_bank_branch,
                esewa_number = v_esewa_number,
                khalti_number = v_khalti_number,
                application_submitted_at = NOW(),
                application_notes = NULL,  -- Clear previous rejection notes
                updated_at = NOW()
            WHERE user_id = v_user_id;
            
            RETURN jsonb_build_object(
                'success', true,
                'message', 'Application re-submitted successfully. Our team will review it soon.'
            );
        END IF;
    END IF;
    
    -- ========================================================================
    -- STEP 6: INSERT NEW VENDOR PROFILE (WITH RACE CONDITION PROTECTION)
    -- ========================================================================
    
    -- Use INSERT ... ON CONFLICT to handle race conditions
    -- If two requests come simultaneously, only one will succeed
    INSERT INTO vendor_profiles (
        user_id,
        business_name,
        business_type,
        application_state,
        application_submitted_at,
        bank_account_name,
        bank_account_number,
        bank_name,
        bank_branch,
        esewa_number,
        khalti_number,
        verification_status,  -- For backward compatibility
        created_at,
        updated_at
    ) VALUES (
        v_user_id,
        v_business_name,
        v_business_type,
        'submitted',  -- Initial state
        NOW(),
        v_bank_account_name,
        v_bank_account_number,
        v_bank_name,
        v_bank_branch,
        v_esewa_number,
        v_khalti_number,
        'pending',  -- For backward compatibility
        NOW(),
        NOW()
    )
    ON CONFLICT (user_id) DO UPDATE
    SET 
        business_name = EXCLUDED.business_name,
        business_type = EXCLUDED.business_type,
        application_state = CASE 
            WHEN vendor_profiles.application_state = 'rejected' THEN 'submitted'
            WHEN vendor_profiles.application_state = 'draft' THEN 'submitted'
            ELSE vendor_profiles.application_state  -- Don't override approved/pending
        END,
        bank_account_name = EXCLUDED.bank_account_name,
        bank_account_number = EXCLUDED.bank_account_number,
        bank_name = EXCLUDED.bank_name,
        bank_branch = EXCLUDED.bank_branch,
        esewa_number = EXCLUDED.esewa_number,
        khalti_number = EXCLUDED.khalti_number,
        application_submitted_at = NOW(),
        updated_at = NOW()
    RETURNING application_state INTO v_result_state;
    
    -- Verify the final state is 'submitted'
    IF v_result_state != 'submitted' THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', format('Application submission failed. Current state: %s', v_result_state),
            'error_code', 'INVALID_STATE',
            'current_state', v_result_state
        );
    END IF;
    
    -- ========================================================================
    -- STEP 7: SUCCESS - RETURN CONFIRMATION
    -- ========================================================================
    RETURN jsonb_build_object(
        'success', true,
        'message', 'Application submitted successfully! Our team will review and contact you within 1-2 business days.',
        'application_state', 'submitted'
    );
    
EXCEPTION
    WHEN OTHERS THEN
        -- Catch any unexpected errors and return user-friendly message
        RAISE WARNING 'Error in submit_vendor_application_secure: %', SQLERRM;
        RETURN jsonb_build_object(
            'success', false,
            'error', 'An unexpected error occurred. Please try again or contact support.',
            'error_code', 'INTERNAL_ERROR'
        );
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.submit_vendor_application_secure TO authenticated;

-- Add helpful comment
COMMENT ON FUNCTION public.submit_vendor_application_secure IS 
'Secure RPC for submitting vendor applications. Validates all input, prevents duplicates, handles re-submissions. v1.0';

COMMIT;

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================
-- Function: submit_vendor_application_secure created
-- Security: SECURITY DEFINER, auth.uid() validated
-- Validation: Email, phone, business name, payout details
-- Race Condition: Protected via ON CONFLICT
-- Re-submissions: Supported for rejected applications
-- Error Handling: User-friendly error messages with error codes
-- ============================================================================
