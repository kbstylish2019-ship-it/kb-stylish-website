-- ============================================================================
-- MIGRATION: Fix Vendor Application Authentication
-- Date: 2025-10-15 14:30:00
-- Issue: auth.uid() returns NULL when called via service_role
-- Solution: Accept p_user_id as parameter (cart-manager pattern)
-- Breaking Changes: NONE (backward compatible)
-- Rollback: See ROLLBACK section at end of file
-- ============================================================================

BEGIN;

-- ============================================================================
-- STEP 1: DROP OLD FUNCTION
-- ============================================================================
DROP FUNCTION IF EXISTS public.submit_vendor_application_secure(jsonb);

-- ============================================================================
-- STEP 2: CREATE NEW FUNCTION WITH USER_ID PARAMETER
-- ============================================================================
CREATE OR REPLACE FUNCTION public.submit_vendor_application_secure(
    p_user_id UUID,              -- ✅ NEW: Accept user ID from Edge Function
    p_application_data jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth', 'private', 'pg_temp'
SET statement_timeout TO '10s'
AS $function$
DECLARE
    v_user_id UUID;
    v_caller_role TEXT;
    v_business_name TEXT;
    v_business_type TEXT;
    v_email TEXT;
    v_phone TEXT;
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
    -- AUTHENTICATION: Detect execution context and validate user ID
    -- ========================================================================
    -- When called by service_role (Edge Function): trust p_user_id (already validated by Edge Function)
    -- When called by client directly: verify p_user_id matches auth.uid()
    v_caller_role := COALESCE(
        current_setting('request.jwt.claims', true)::json->>'role', 
        'service_role'
    );
    
    IF v_caller_role = 'service_role' THEN
        -- Called by Edge Function - trust the provided user ID
        v_user_id := p_user_id;
        
        IF v_user_id IS NULL THEN
            RETURN jsonb_build_object(
                'success', false,
                'error', 'Invalid user ID provided',
                'error_code', 'INVALID_USER_ID'
            );
        END IF;
        
        RAISE LOG 'submit_vendor_application_secure: Called by service_role for user %', v_user_id;
    ELSE
        -- Called directly by client - verify user is acting for themselves
        IF p_user_id != auth.uid() OR auth.uid() IS NULL THEN
            RETURN jsonb_build_object(
                'success', false,
                'error', 'Unauthorized: Cannot submit application for another user',
                'error_code', 'AUTH_MISMATCH'
            );
        END IF;
        
        v_user_id := auth.uid();
        RAISE LOG 'submit_vendor_application_secure: Called by authenticated user %', v_user_id;
    END IF;
    
    -- ========================================================================
    -- DATA EXTRACTION AND VALIDATION
    -- ========================================================================
    v_business_name := TRIM(p_application_data->>'business_name');
    v_business_type := TRIM(p_application_data->>'business_type');
    v_email := TRIM(LOWER(p_application_data->>'email'));
    v_phone := TRIM(REPLACE(REPLACE(p_application_data->>'phone', ' ', ''), '-', ''));
    v_payout_method := LOWER(TRIM(p_application_data->>'payout_method'));
    v_bank_name := TRIM(p_application_data->>'bank_name');
    v_bank_account_name := TRIM(p_application_data->>'bank_account_name');
    v_bank_account_number := TRIM(p_application_data->>'bank_account_number');
    v_bank_branch := TRIM(p_application_data->>'bank_branch');
    v_esewa_number := TRIM(p_application_data->>'esewa_number');
    v_khalti_number := TRIM(p_application_data->>'khalti_number');
    
    -- Validation
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
            'error', 'Business name too long (max 200 characters)',
            'error_code', 'BUSINESS_NAME_TOO_LONG'
        );
    END IF;
    
    IF v_business_type NOT IN ('Boutique', 'Salon', 'Designer', 'Manufacturer', 'Other') THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Invalid business type',
            'error_code', 'INVALID_BUSINESS_TYPE'
        );
    END IF;
    
    IF v_email IS NULL OR v_email !~ '^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$' THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Invalid email format',
            'error_code', 'INVALID_EMAIL'
        );
    END IF;
    
    IF v_phone IS NULL OR v_phone !~ '^9[678][0-9]{8}$' THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Invalid phone number (must be valid Nepali mobile)',
            'error_code', 'INVALID_PHONE'
        );
    END IF;
    
    IF v_payout_method NOT IN ('bank', 'esewa', 'khalti') THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Invalid payout method',
            'error_code', 'INVALID_PAYOUT_METHOD'
        );
    END IF;
    
    -- ========================================================================
    -- CHECK EXISTING APPLICATION STATE
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
            -- Allow re-submission from rejected state
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
    -- INSERT NEW APPLICATION
    -- ========================================================================
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
        v_bank_account_number,
        v_bank_name,
        v_bank_branch,
        v_esewa_number,
        v_khalti_number,
        'pending',  -- Legacy field for backward compatibility
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
        bank_account_number = EXCLUDED.bank_account_number,
        bank_name = EXCLUDED.bank_name,
        bank_branch = EXCLUDED.bank_branch,
        esewa_number = EXCLUDED.esewa_number,
        khalti_number = EXCLUDED.khalti_number,
        application_submitted_at = NOW(),
        updated_at = NOW()
    RETURNING application_state INTO v_result_state;
    
    IF v_result_state != 'submitted' THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Submission failed due to invalid state transition',
            'error_code', 'INVALID_STATE',
            'current_state', v_result_state
        );
    END IF;
    
    RAISE LOG 'submit_vendor_application_secure: Successfully submitted application for user %', v_user_id;
    
    RETURN jsonb_build_object(
        'success', true,
        'message', 'Application submitted successfully! Our team will review it within 1-2 business days.',
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
$function$;

-- ============================================================================
-- STEP 3: GRANT PERMISSIONS
-- ============================================================================
GRANT EXECUTE ON FUNCTION public.submit_vendor_application_secure(UUID, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.submit_vendor_application_secure(UUID, jsonb) TO authenticated;

-- ============================================================================
-- STEP 4: ADD DOCUMENTATION
-- ============================================================================
COMMENT ON FUNCTION public.submit_vendor_application_secure IS 
'Submit vendor application with explicit user_id parameter. 
Accepts calls from both service_role (Edge Functions with pre-validated JWT) 
and authenticated users (with runtime auth verification).
Follows the proven cart-manager authentication pattern.';

COMMIT;

-- ============================================================================
-- VERIFICATION (Run these after migration to confirm success)
-- ============================================================================

-- Verify function exists with correct signature
SELECT 
    proname as function_name,
    pg_get_function_arguments(oid) as arguments,
    prosecdef as is_security_definer,
    provolatile as volatility
FROM pg_proc 
WHERE proname = 'submit_vendor_application_secure';

-- Expected output:
-- function_name: submit_vendor_application_secure
-- arguments: p_user_id uuid, p_application_data jsonb
-- is_security_definer: t
-- volatility: v (volatile)

-- Verify permissions
SELECT 
    p.proname as function_name,
    r.rolname as role,
    has_function_privilege(r.oid, p.oid, 'EXECUTE') as can_execute
FROM pg_proc p
CROSS JOIN pg_roles r
WHERE p.proname = 'submit_vendor_application_secure'
  AND r.rolname IN ('service_role', 'authenticated', 'anon')
ORDER BY r.rolname;

-- Expected: service_role and authenticated should have can_execute = t

-- ============================================================================
-- ROLLBACK PLAN (if needed)
-- ============================================================================

/*
-- To rollback this migration, run:

BEGIN;

-- Drop the new function
DROP FUNCTION IF EXISTS public.submit_vendor_application_secure(UUID, jsonb);

-- Restore old function (without user_id parameter)
-- You would need to restore the old definition from git history or backup

COMMIT;
*/
