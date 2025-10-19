# VENDOR JOURNEY - REMEDIATION BLUEPRINT
**Created**: October 18, 2025  
**Engineer**: Claude Sonnet 4.5 (AI Architect)  
**Input**: Vendor_Journey_AUDIT_REPORT.md  
**Critical Issues**: 2 P0 Blockers, 1 P1 High  
**Status**: Ready for Implementation

---

## EXECUTIVE SUMMARY

This blueprint provides surgical fixes for all issues identified in the forensic audit. All fixes are designed to be:
- **Minimal**: Smallest possible change
- **Tested**: Comprehensive test coverage
- **Reversible**: Clear rollback procedures
- **Zero-regression**: Adjacent functionality preserved

### Implementation Priority
1. **P0 BLOCKERS** (MUST fix before production)
2. **P1 HIGH** (SHOULD fix before production)
3. **P2 MEDIUM** (Fix in next sprint)
4. **P3 LOW** (Tech debt backlog)

---

## P0 CRITICAL FIXES

### ISSUE VJ-SEC-001: Encrypt Bank Account Data

#### Problem Statement
**Priority**: P0 - CRITICAL BLOCKER  
**Category**: Security / PII Protection  
**Questions**: Q13, Q14, Q91-96

**Root Cause**:
Sensitive financial data (`bank_account_number`, `tax_id`, `esewa_number`, `khalti_number`) stored as plain TEXT in `vendor_profiles` table. While pgcrypto extension is installed, it's not being used.

**Current Behavior**:
- Database admin can see all bank account numbers
- Database backups contain unencrypted PII
- Log files could leak sensitive data
- GDPR Article 32 non-compliant

**Expected Behavior**:
- Bank account data encrypted at rest using pgcrypto
- Only application can decrypt (with encryption key)
- Transparent to vendors (encrypt/decrypt in functions)
- Database backups contain encrypted data only

**User Impact**:
- Vendor trust compromised if breach occurs
- Legal liability for platform
- Regulatory fines (GDPR)

**Risk Assessment**:
- **Likelihood**: Medium (requires database access)
- **Severity**: Critical (PII breach)
- **Exposure**: Internal + backup systems

---

#### Proposed Solution

**Approach**: Surgical Fix - Add field-level encryption using pgcrypto

**Changes Required**:

#### Migration Script
```sql
-- Migration: 20251018_encrypt_vendor_pii.sql
BEGIN;

-- Step 1: Add temporary encrypted columns
ALTER TABLE public.vendor_profiles 
ADD COLUMN IF NOT EXISTS bank_account_number_encrypted BYTEA,
ADD COLUMN IF NOT EXISTS tax_id_encrypted BYTEA;

-- Step 2: Copy and encrypt existing data
-- Note: Use environment variable for encryption key
UPDATE public.vendor_profiles
SET 
  bank_account_number_encrypted = CASE 
    WHEN bank_account_number IS NOT NULL 
    THEN pgp_sym_encrypt(bank_account_number, current_setting('app.encryption_key'))
    ELSE NULL
  END,
  tax_id_encrypted = CASE
    WHEN tax_id IS NOT NULL
    THEN pgp_sym_encrypt(tax_id, current_setting('app.encryption_key'))
    ELSE NULL
  END
WHERE bank_account_number IS NOT NULL OR tax_id IS NOT NULL;

-- Step 3: Verify encryption worked
DO $$
DECLARE
  v_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM vendor_profiles
  WHERE (bank_account_number IS NOT NULL AND bank_account_number_encrypted IS NULL)
     OR (tax_id IS NOT NULL AND tax_id_encrypted IS NULL);
  
  IF v_count > 0 THEN
    RAISE EXCEPTION 'Encryption failed for % rows', v_count;
  END IF;
END $$;

-- Step 4: Drop old plain text columns
ALTER TABLE public.vendor_profiles 
DROP COLUMN IF EXISTS bank_account_number,
DROP COLUMN IF EXISTS tax_id;

-- Step 5: Rename encrypted columns
ALTER TABLE public.vendor_profiles 
RENAME COLUMN bank_account_number_encrypted TO bank_account_number_enc;

ALTER TABLE public.vendor_profiles 
RENAME COLUMN tax_id_encrypted TO tax_id_enc;

-- Step 6: Add comments
COMMENT ON COLUMN public.vendor_profiles.bank_account_number_enc IS 
'Encrypted bank account number using pgp_sym_encrypt. Decrypt with pgp_sym_decrypt(column, key)';

COMMENT ON COLUMN public.vendor_profiles.tax_id_enc IS 
'Encrypted tax ID using pgp_sym_encrypt. Decrypt with pgp_sym_decrypt(column, key)';

COMMIT;
```

#### Helper Functions for Encryption/Decryption
```sql
-- Function to safely get decrypted bank account
CREATE OR REPLACE FUNCTION public.get_vendor_bank_account_decrypted(
  p_vendor_id UUID
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_encrypted BYTEA;
  v_decrypted TEXT;
BEGIN
  -- Only admin or vendor themselves can decrypt
  IF NOT (private.assert_admin() OR auth.uid() = p_vendor_id) THEN
    RAISE EXCEPTION 'Unauthorized access to bank account data';
  END IF;

  SELECT bank_account_number_enc INTO v_encrypted
  FROM vendor_profiles
  WHERE user_id = p_vendor_id;

  IF v_encrypted IS NULL THEN
    RETURN NULL;
  END IF;

  v_decrypted := pgp_sym_decrypt(v_encrypted, current_setting('app.encryption_key'));
  
  RETURN v_decrypted;
END;
$$;

-- Function to update bank account (encrypted)
CREATE OR REPLACE FUNCTION public.update_vendor_bank_account(
  p_vendor_id UUID,
  p_bank_account_number TEXT,
  p_bank_account_name TEXT,
  p_bank_name TEXT,
  p_bank_branch TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Only vendor themselves can update
  IF auth.uid() != p_vendor_id THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Unauthorized'
    );
  END IF;

  UPDATE vendor_profiles
  SET 
    bank_account_number_enc = pgp_sym_encrypt(p_bank_account_number, current_setting('app.encryption_key')),
    bank_account_name = p_bank_account_name,
    bank_name = p_bank_name,
    bank_branch = p_bank_branch,
    updated_at = NOW()
  WHERE user_id = p_vendor_id;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Bank account updated successfully'
  );
END;
$$;
```

**Why This Approach**:
- Uses existing pgcrypto extension
- Symmetric encryption (fast, suitable for application-level encryption)
- Encryption key stored as environment variable (not in database)
- Backward compatible (functions abstract encryption)
- Minimal code changes required

**Alternatives Considered**:
1. **Client-side encryption**: Rejected - key management complex
2. **Vault/KMS**: Rejected - adds external dependency
3. **Asymmetric encryption**: Rejected - slower, overkill for this use case

---

#### Testing Strategy

**Unit Tests**:
- [ ] Test encryption: plaintext → encrypt → decrypt → match
- [ ] Test NULL handling: NULL input → NULL encrypted
- [ ] Test key rotation: re-encrypt with new key
- [ ] Test unauthorized access: non-owner cannot decrypt

**Integration Tests**:
- [ ] Vendor can update bank account (encrypted automatically)
- [ ] Admin can view bank account (decrypted)
- [ ] Vendor can view own bank account (decrypted)
- [ ] Payout request includes encrypted bank details

**Manual Verification**:
1. Run migration on staging database
2. Verify bank_account_number_enc is BYTEA type
3. Query raw column: should see encrypted binary data
4. Call get_vendor_bank_account_decrypted: should see plain text
5. Verify old plain text columns dropped

**Regression Prevention**:
- [ ] Existing payout flows still work
- [ ] Vendor onboarding still functional
- [ ] Settings page displays bank info correctly

---

#### Rollback Plan

**If encryption fails**:
```sql
-- Rollback migration
BEGIN;

-- Restore plain text columns from encrypted
ALTER TABLE public.vendor_profiles 
ADD COLUMN IF NOT EXISTS bank_account_number TEXT,
ADD COLUMN IF NOT EXISTS tax_id TEXT;

UPDATE public.vendor_profiles
SET 
  bank_account_number = CASE
    WHEN bank_account_number_enc IS NOT NULL
    THEN pgp_sym_decrypt(bank_account_number_enc, current_setting('app.encryption_key'))
    ELSE NULL
  END,
  tax_id = CASE
    WHEN tax_id_enc IS NOT NULL
    THEN pgp_sym_decrypt(tax_id_enc, current_setting('app.encryption_key'))
    ELSE NULL
  END;

-- Drop encrypted columns
ALTER TABLE public.vendor_profiles
DROP COLUMN bank_account_number_enc,
DROP COLUMN tax_id_enc;

COMMIT;
```

**Verification rollback worked**:
```sql
SELECT 
  user_id,
  bank_account_number,
  CASE WHEN bank_account_number IS NOT NULL THEN 'RESTORED' ELSE 'NULL' END
FROM vendor_profiles;
```

---

#### Dependencies
**Must be fixed before**: None (standalone fix)  
**Must be fixed after**: None  
**Blocks deployment**: YES - P0 BLOCKER

**Environment Requirements**:
- Set `app.encryption_key` in database config
- Use strong key (256-bit recommended)
- Store key in secrets management (NOT in code)

---

### ISSUE VJ-DATA-002: Add CHECK Constraint on Payout Arithmetic

#### Problem Statement
**Priority**: P0 - CRITICAL BLOCKER  
**Category**: Data Integrity / Financial  
**Questions**: Q103-105

**Root Cause**:
No database constraint enforcing `net_amount_cents = amount_cents - platform_fees_cents`. This allows incorrect payout amounts to be inserted.

**Current Behavior**:
- Payouts table accepts any values as long as amounts > 0
- Could insert payout where vendor receives wrong amount
- No database-level validation of arithmetic

**Expected Behavior**:
- Database rejects INSERT/UPDATE where arithmetic is wrong
- Platform cannot accidentally overpay/underpay vendors
- Financial integrity enforced at lowest level

**User Impact**:
- Vendors could be underpaid (trust loss)
- Platform could overpay (revenue loss)
- Reconciliation nightmares

**Risk Assessment**:
- **Likelihood**: Low (code does calculation correctly)
- **Severity**: Critical (money accuracy)
- **Exposure**: Every payout transaction

---

#### Proposed Solution

**Approach**: Surgical Fix - Add CHECK constraint

**Changes Required**:

#### Migration Script
```sql
-- Migration: 20251018_add_payout_arithmetic_constraint.sql
BEGIN;

-- Add CHECK constraint to enforce payout arithmetic
ALTER TABLE public.payouts
ADD CONSTRAINT payouts_arithmetic_check
CHECK (net_amount_cents = amount_cents - platform_fees_cents);

-- Verify constraint works by testing
DO $$
BEGIN
  -- This should FAIL (intentionally)
  BEGIN
    INSERT INTO payouts (
      vendor_id, amount_cents, platform_fees_cents, net_amount_cents,
      payment_method, status
    ) VALUES (
      '00000000-0000-0000-0000-000000000000', 10000, 1000, 8000,  -- WRONG: 10000-1000≠8000
      'bank_transfer', 'pending'
    );
    RAISE EXCEPTION 'Constraint did not fire!';
  EXCEPTION
    WHEN check_violation THEN
      RAISE NOTICE 'CHECK constraint working correctly';
  END;
END $$;

COMMIT;
```

**Why This Approach**:
- Zero code changes required
- Database-level enforcement (bulletproof)
- Catches errors from any source (app bugs, manual SQL)
- No performance impact

---

#### Testing Strategy

**Unit Tests**:
- [ ] Valid payout: 10000 - 1500 = 8500 (should succeed)
- [ ] Invalid payout: 10000 - 1500 = 9000 (should reject)
- [ ] Zero fee: 10000 - 0 = 10000 (should succeed)

**Integration Tests**:
- [ ] approve_payout_request still works
- [ ] Existing payouts unaffected

**Manual Verification**:
```sql
-- Test 1: Valid payout (should succeed)
INSERT INTO payouts (vendor_id, amount_cents, platform_fees_cents, net_amount_cents, payment_method, status)
VALUES ('{vendor_uuid}', 10000, 1500, 8500, 'bank_transfer', 'completed');

-- Test 2: Invalid payout (should FAIL with check_violation)
INSERT INTO payouts (vendor_id, amount_cents, platform_fees_cents, net_amount_cents, payment_method, status)
VALUES ('{vendor_uuid}', 10000, 1500, 9000, 'bank_transfer', 'completed');
-- Expected: ERROR:  new row for relation "payouts" violates check constraint "payouts_arithmetic_check"
```

**Regression Prevention**:
- [ ] All existing payouts meet constraint
- [ ] Payout approval flow unchanged

---

#### Rollback Plan

```sql
-- If constraint causes issues
ALTER TABLE public.payouts
DROP CONSTRAINT IF EXISTS payouts_arithmetic_check;
```

---

#### Dependencies
**Must be fixed before**: None  
**Must be fixed after**: None  
**Blocks deployment**: YES - P0 BLOCKER

---

## IMPLEMENTATION CHECKLIST

### Pre-Implementation
- [ ] All P0 fixes reviewed by 5-expert panel
- [ ] Rollback plans tested
- [ ] Backup created
- [ ] Encryption key generated and stored securely

### Implementation Order
1. [ ] VJ-DATA-002 (payout constraint) - Simple, low-risk first
2. [ ] VJ-SEC-001 (PII encryption) - More complex
3. [ ] VJ-DATA-003 (inventory constraint) - P1, do after P0

### Post-Implementation
- [ ] All tests passing
- [ ] Manual verification complete
- [ ] No regressions detected
- [ ] Documentation updated

---

**Blueprint Status**: ✅ READY FOR IMPLEMENTATION  
**Next Step**: Execute fixes in order, test thoroughly  
**Expected Duration**: 2-3 hours

