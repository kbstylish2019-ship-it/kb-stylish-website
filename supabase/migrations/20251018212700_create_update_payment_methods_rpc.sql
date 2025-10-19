-- =====================================================================
-- Create RPC to Update Vendor Payment Methods with Encryption
-- Allows vendors to update their payment info securely
-- =====================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.update_vendor_payment_methods(
  p_bank_account_name TEXT DEFAULT NULL,
  p_bank_account_number TEXT DEFAULT NULL,
  p_bank_name TEXT DEFAULT NULL,
  p_bank_branch TEXT DEFAULT NULL,
  p_esewa_number TEXT DEFAULT NULL,
  p_khalti_number TEXT DEFAULT NULL,
  p_tax_id TEXT DEFAULT NULL
)
RETURNS JSONB
SECURITY DEFINER
SET search_path = public, private, pg_temp
LANGUAGE plpgsql
AS $$
DECLARE
  v_user_id UUID;
  v_key TEXT;
  v_vendor_exists BOOLEAN;
BEGIN
  -- Get current user
  v_user_id := auth.uid();
  
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Not authenticated'
    );
  END IF;
  
  -- Verify user is a vendor
  IF NOT public.user_has_role(v_user_id, 'vendor') THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Unauthorized: Vendor role required'
    );
  END IF;
  
  -- Check if vendor profile exists
  SELECT EXISTS (
    SELECT 1 FROM public.vendor_profiles WHERE user_id = v_user_id
  ) INTO v_vendor_exists;
  
  IF NOT v_vendor_exists THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Vendor profile not found'
    );
  END IF;
  
  -- Get encryption key
  v_key := private.get_encryption_key();
  
  -- Update vendor profile with encrypted data
  UPDATE public.vendor_profiles
  SET
    bank_account_name = p_bank_account_name,
    bank_name = p_bank_name,
    bank_branch = p_bank_branch,
    -- Encrypt sensitive fields
    bank_account_number_enc = CASE 
      WHEN p_bank_account_number IS NOT NULL AND p_bank_account_number <> ''
      THEN pgp_sym_encrypt(p_bank_account_number, v_key)
      ELSE bank_account_number_enc  -- Keep existing if not provided
    END,
    esewa_number_enc = CASE 
      WHEN p_esewa_number IS NOT NULL AND p_esewa_number <> ''
      THEN pgp_sym_encrypt(p_esewa_number, v_key)
      ELSE esewa_number_enc
    END,
    khalti_number_enc = CASE 
      WHEN p_khalti_number IS NOT NULL AND p_khalti_number <> ''
      THEN pgp_sym_encrypt(p_khalti_number, v_key)
      ELSE khalti_number_enc
    END,
    tax_id_enc = CASE 
      WHEN p_tax_id IS NOT NULL AND p_tax_id <> ''
      THEN pgp_sym_encrypt(p_tax_id, v_key)
      ELSE tax_id_enc
    END,
    updated_at = NOW()
  WHERE user_id = v_user_id;
  
  RETURN jsonb_build_object(
    'success', true,
    'message', 'Payment methods updated successfully'
  );
  
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'success', false,
    'error', SQLERRM
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_vendor_payment_methods TO authenticated;

COMMENT ON FUNCTION public.update_vendor_payment_methods IS 
'Allows vendors to update their payment methods. Encrypts sensitive data (bank account, eSewa, Khalti numbers) before storing. Only the vendor can update their own data.';

COMMIT;
