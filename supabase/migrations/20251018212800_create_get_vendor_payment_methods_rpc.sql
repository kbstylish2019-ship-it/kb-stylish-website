-- =====================================================================
-- Create RPC to Get Vendor's Own Payment Methods (Decrypted)
-- Allows vendors to view their own encrypted payment info
-- =====================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.get_vendor_payment_methods()
RETURNS JSONB
SECURITY DEFINER
SET search_path = public, private, pg_temp
LANGUAGE plpgsql
AS $$
DECLARE
  v_user_id UUID;
  v_key TEXT;
  v_profile RECORD;
BEGIN
  v_user_id := auth.uid();
  
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;
  
  IF NOT public.user_has_role(v_user_id, 'vendor') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized: Vendor role required');
  END IF;
  
  -- Get encryption key
  v_key := private.get_encryption_key();
  
  -- Get vendor profile with decrypted data
  SELECT
    user_id,
    bank_account_name,
    bank_name,
    bank_branch,
    CASE 
      WHEN bank_account_number_enc IS NOT NULL 
      THEN pgp_sym_decrypt(bank_account_number_enc, v_key)
      ELSE NULL
    END as bank_account_number,
    CASE 
      WHEN esewa_number_enc IS NOT NULL 
      THEN pgp_sym_decrypt(esewa_number_enc, v_key)
      ELSE NULL
    END as esewa_number,
    CASE 
      WHEN khalti_number_enc IS NOT NULL 
      THEN pgp_sym_decrypt(khalti_number_enc, v_key)
      ELSE NULL
    END as khalti_number,
    CASE 
      WHEN tax_id_enc IS NOT NULL 
      THEN pgp_sym_decrypt(tax_id_enc, v_key)
      ELSE NULL
    END as tax_id
  INTO v_profile
  FROM public.vendor_profiles
  WHERE user_id = v_user_id;
  
  IF v_profile.user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Vendor profile not found');
  END IF;
  
  RETURN jsonb_build_object(
    'success', true,
    'data', jsonb_build_object(
      'user_id', v_profile.user_id,
      'bank_account_name', v_profile.bank_account_name,
      'bank_account_number', v_profile.bank_account_number,
      'bank_name', v_profile.bank_name,
      'bank_branch', v_profile.bank_branch,
      'esewa_number', v_profile.esewa_number,
      'khalti_number', v_profile.khalti_number,
      'tax_id', v_profile.tax_id
    )
  );
  
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_vendor_payment_methods TO authenticated;

COMMENT ON FUNCTION public.get_vendor_payment_methods IS 
'Allows vendors to retrieve their own payment methods with decrypted sensitive data. Only the vendor can access their own data.';

COMMIT;
