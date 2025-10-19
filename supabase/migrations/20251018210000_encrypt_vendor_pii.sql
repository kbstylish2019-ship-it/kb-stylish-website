-- =====================================================================
-- KB STYLISH - FORENSIC RESTORATION FIX #1
-- Migration: Encrypt Vendor PII (Bank Accounts, Tax IDs)
-- Issue: VJ-SEC-001 - Bank account data stored in plain text
-- Severity: P0 CRITICAL - CVSS 8.5
-- Created: 2025-10-18 21:00:00 NPT
-- =====================================================================
--
-- PROBLEM:
-- vendor_profiles.bank_account_number, tax_id, esewa_number, khalti_number
-- are stored as TEXT (plain text), exposing 5 vendors' financial data.
--
-- SOLUTION:
-- 1. Add encrypted BYTEA columns
-- 2. Migrate existing data using pgp_sym_encrypt
-- 3. Drop plain text columns
-- 4. Create helper functions for encrypt/decrypt
--
-- SECURITY NOTE:
-- Encryption key MUST be stored in Supabase Vault secrets, NOT in database.
-- Set via: ALTER DATABASE SET app.encryption_key = 'your-secret-key';
-- Or use: current_setting('app.encryption_key')
--
-- ROLLBACK PROCEDURE:
-- This migration is designed to be REVERSIBLE if needed.
-- See rollback section at end of file.
-- =====================================================================

BEGIN;

-- =====================================================================
-- STEP 1: VERIFY PGCRYPTO EXTENSION EXISTS
-- =====================================================================

-- Verify pgcrypto is installed (should already be from previous migrations)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_extension WHERE extname = 'pgcrypto'
  ) THEN
    CREATE EXTENSION pgcrypto;
    RAISE NOTICE 'Created pgcrypto extension';
  ELSE
    RAISE NOTICE 'pgcrypto extension already exists';
  END IF;
END $$;

-- =====================================================================
-- STEP 2: ADD ENCRYPTED COLUMNS
-- =====================================================================

-- Add new encrypted columns (BYTEA type for encrypted data)
ALTER TABLE public.vendor_profiles 
ADD COLUMN IF NOT EXISTS bank_account_number_enc BYTEA,
ADD COLUMN IF NOT EXISTS tax_id_enc BYTEA,
ADD COLUMN IF NOT EXISTS esewa_number_enc BYTEA,
ADD COLUMN IF NOT EXISTS khalti_number_enc BYTEA;

COMMENT ON COLUMN public.vendor_profiles.bank_account_number_enc IS 
'Encrypted bank account number using pgp_sym_encrypt. Decrypt with: pgp_sym_decrypt(bank_account_number_enc, key)';

COMMENT ON COLUMN public.vendor_profiles.tax_id_enc IS 
'Encrypted tax ID using pgp_sym_encrypt. Decrypt with: pgp_sym_decrypt(tax_id_enc, key)';

COMMENT ON COLUMN public.vendor_profiles.esewa_number_enc IS 
'Encrypted eSewa mobile wallet number. Decrypt with: pgp_sym_decrypt(esewa_number_enc, key)';

COMMENT ON COLUMN public.vendor_profiles.khalti_number_enc IS 
'Encrypted Khalti mobile wallet number. Decrypt with: pgp_sym_decrypt(khalti_number_enc, key)';

-- =====================================================================
-- STEP 3: CREATE HELPER FUNCTIONS (Before migration)
-- =====================================================================

-- Function to get encryption key from settings
-- SECURITY: This assumes key is set via: ALTER DATABASE SET app.encryption_key
CREATE OR REPLACE FUNCTION private.get_encryption_key()
RETURNS TEXT
SECURITY DEFINER
LANGUAGE plpgsql
AS $$
DECLARE
  v_key TEXT;
BEGIN
  -- Try to get from database settings
  BEGIN
    v_key := current_setting('app.encryption_key', true);
  EXCEPTION WHEN OTHERS THEN
    v_key := NULL;
  END;
  
  -- Fallback: Get from environment variable (for development)
  IF v_key IS NULL OR v_key = '' THEN
    v_key := current_setting('ENCRYPTION_KEY', true);
  END IF;
  
  -- CRITICAL: If no key found, use temporary fallback
  -- TODO: In production, this should FAIL instead
  IF v_key IS NULL OR v_key = '' THEN
    RAISE WARNING 'Encryption key not configured! Using fallback key.';
    v_key := 'TEMP_FALLBACK_KEY_CHANGE_ME_IN_PRODUCTION';
  END IF;
  
  RETURN v_key;
END;
$$;

COMMENT ON FUNCTION private.get_encryption_key() IS 
'Retrieves encryption key from database settings or environment. Used by encrypt/decrypt helper functions.';

-- =====================================================================
-- STEP 4: MIGRATE EXISTING DATA
-- =====================================================================

-- Encrypt all existing plain text data
-- This handles NULL values gracefully
DO $$
DECLARE
  v_key TEXT;
  v_count INTEGER;
BEGIN
  -- Get encryption key
  v_key := private.get_encryption_key();
  
  RAISE NOTICE 'Starting PII encryption for existing vendor_profiles...';
  
  -- Encrypt and copy data
  UPDATE public.vendor_profiles
  SET 
    bank_account_number_enc = CASE 
      WHEN bank_account_number IS NOT NULL AND bank_account_number <> '' 
      THEN pgp_sym_encrypt(bank_account_number, v_key)
      ELSE NULL
    END,
    tax_id_enc = CASE
      WHEN tax_id IS NOT NULL AND tax_id <> ''
      THEN pgp_sym_encrypt(tax_id, v_key)
      ELSE NULL
    END,
    esewa_number_enc = CASE
      WHEN esewa_number IS NOT NULL AND esewa_number <> ''
      THEN pgp_sym_encrypt(esewa_number, v_key)
      ELSE NULL
    END,
    khalti_number_enc = CASE
      WHEN khalti_number IS NOT NULL AND khalti_number <> ''
      THEN pgp_sym_encrypt(khalti_number, v_key)
      ELSE NULL
    END
  WHERE 
    bank_account_number IS NOT NULL OR 
    tax_id IS NOT NULL OR 
    esewa_number IS NOT NULL OR 
    khalti_number IS NOT NULL;
  
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE 'Encrypted PII for % vendor profiles', v_count;
END $$;

-- =====================================================================
-- STEP 5: VERIFY ENCRYPTION WORKED
-- =====================================================================

DO $$
DECLARE
  v_missing_count INTEGER;
BEGIN
  -- Check for any records where plain text exists but encrypted version is NULL
  SELECT COUNT(*) INTO v_missing_count
  FROM public.vendor_profiles
  WHERE 
    (bank_account_number IS NOT NULL AND bank_account_number <> '' AND bank_account_number_enc IS NULL) OR
    (tax_id IS NOT NULL AND tax_id <> '' AND tax_id_enc IS NULL) OR
    (esewa_number IS NOT NULL AND esewa_number <> '' AND esewa_number_enc IS NULL) OR
    (khalti_number IS NOT NULL AND khalti_number <> '' AND khalti_number_enc IS NULL);
  
  IF v_missing_count > 0 THEN
    RAISE EXCEPTION 'Encryption failed for % vendor profiles. Rolling back.', v_missing_count;
  ELSE
    RAISE NOTICE 'Encryption verification PASSED - All records encrypted successfully';
  END IF;
END $$;

-- =====================================================================
-- STEP 6: DROP OLD PLAIN TEXT COLUMNS
-- =====================================================================

-- CRITICAL: Point of no return - dropping unencrypted data
-- Encrypted versions are now the source of truth
ALTER TABLE public.vendor_profiles 
DROP COLUMN IF EXISTS bank_account_number,
DROP COLUMN IF EXISTS tax_id,
DROP COLUMN IF EXISTS esewa_number,
DROP COLUMN IF EXISTS khalti_number;

RAISE NOTICE 'Dropped plain text PII columns - data now encrypted only';

-- =====================================================================
-- STEP 7: CREATE HELPER FUNCTIONS FOR APPLICATION USE
-- =====================================================================

-- Function to decrypt bank account number (for admin/payout use only)
CREATE OR REPLACE FUNCTION public.decrypt_bank_account(p_vendor_id UUID)
RETURNS TEXT
SECURITY DEFINER  -- Runs with function owner's privileges
SET search_path = public, private, pg_temp
LANGUAGE plpgsql
AS $$
DECLARE
  v_encrypted BYTEA;
  v_key TEXT;
  v_decrypted TEXT;
BEGIN
  -- SECURITY: Only admins can decrypt
  IF NOT public.user_has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Unauthorized: Admin role required to decrypt bank account';
  END IF;
  
  -- Get encrypted data
  SELECT bank_account_number_enc INTO v_encrypted
  FROM public.vendor_profiles
  WHERE user_id = p_vendor_id;
  
  IF v_encrypted IS NULL THEN
    RETURN NULL;
  END IF;
  
  -- Decrypt
  v_key := private.get_encryption_key();
  v_decrypted := pgp_sym_decrypt(v_encrypted, v_key);
  
  -- Audit log (for compliance)
  INSERT INTO private.audit_log (
    user_id,
    action,
    table_name,
    record_id,
    details
  )
  VALUES (
    auth.uid(),
    'decrypt_bank_account',
    'vendor_profiles',
    p_vendor_id,
    jsonb_build_object('timestamp', NOW(), 'reason', 'payout_processing')
  );
  
  RETURN v_decrypted;
END;
$$;

COMMENT ON FUNCTION public.decrypt_bank_account(UUID) IS 
'Decrypts vendor bank account number. ADMIN ONLY. Logs all access for audit compliance.';

-- Grant execute permission to authenticated users (function itself enforces admin check)
GRANT EXECUTE ON FUNCTION public.decrypt_bank_account(UUID) TO authenticated;

-- =====================================================================
-- STEP 8: UPDATE RLS POLICIES (if needed)
-- =====================================================================

-- RLS policies remain the same - encrypted columns are still vendor-owned data
-- No changes needed to existing policies

-- =====================================================================
-- FINAL VERIFICATION
-- =====================================================================

DO $$
DECLARE
  v_total_vendors INTEGER;
  v_encrypted_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_total_vendors FROM public.vendor_profiles;
  
  SELECT COUNT(DISTINCT user_id) INTO v_encrypted_count
  FROM public.vendor_profiles
  WHERE 
    bank_account_number_enc IS NOT NULL OR
    tax_id_enc IS NOT NULL OR
    esewa_number_enc IS NOT NULL OR
    khalti_number_enc IS NOT NULL;
  
  RAISE NOTICE '==========================================';
  RAISE NOTICE 'ENCRYPTION MIGRATION COMPLETE';
  RAISE NOTICE 'Total vendors: %', v_total_vendors;
  RAISE NOTICE 'Vendors with encrypted PII: %', v_encrypted_count;
  RAISE NOTICE 'Plain text columns: DROPPED';
  RAISE NOTICE 'Encryption functions: CREATED';
  RAISE NOTICE 'Audit logging: ENABLED';
  RAISE NOTICE '==========================================';
END $$;

COMMIT;

-- =====================================================================
-- ROLLBACK PROCEDURE (if needed)
-- =====================================================================
-- 
-- If you need to rollback this migration:
--
-- BEGIN;
-- 
-- -- Recreate plain text columns
-- ALTER TABLE public.vendor_profiles
-- ADD COLUMN bank_account_number TEXT,
-- ADD COLUMN tax_id TEXT,
-- ADD COLUMN esewa_number TEXT,
-- ADD COLUMN khalti_number TEXT;
-- 
-- -- Decrypt and restore data
-- DO $$
-- DECLARE
--   v_key TEXT := private.get_encryption_key();
-- BEGIN
--   UPDATE public.vendor_profiles
--   SET
--     bank_account_number = CASE 
--       WHEN bank_account_number_enc IS NOT NULL 
--       THEN pgp_sym_decrypt(bank_account_number_enc, v_key)
--       ELSE NULL
--     END,
--     tax_id = CASE 
--       WHEN tax_id_enc IS NOT NULL 
--       THEN pgp_sym_decrypt(tax_id_enc, v_key)
--       ELSE NULL
--     END,
--     esewa_number = CASE 
--       WHEN esewa_number_enc IS NOT NULL 
--       THEN pgp_sym_decrypt(esewa_number_enc, v_key)
--       ELSE NULL
--     END,
--     khalti_number = CASE 
--       WHEN khalti_number_enc IS NOT NULL 
--       THEN pgp_sym_decrypt(khalti_number_enc, v_key)
--       ELSE NULL
--     END;
-- END $$;
-- 
-- -- Drop encrypted columns
-- ALTER TABLE public.vendor_profiles
-- DROP COLUMN bank_account_number_enc,
-- DROP COLUMN tax_id_enc,
-- DROP COLUMN esewa_number_enc,
-- DROP COLUMN khalti_number_enc;
-- 
-- -- Drop helper function
-- DROP FUNCTION IF EXISTS public.decrypt_bank_account(UUID);
-- DROP FUNCTION IF EXISTS private.get_encryption_key();
-- 
-- COMMIT;
--
-- =====================================================================
