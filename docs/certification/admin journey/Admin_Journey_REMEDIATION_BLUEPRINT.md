# ADMIN JOURNEY - REMEDIATION BLUEPRINT
**Generated**: January 17, 2025  
**Based on**: Forensic Audit Report - P0 Critical Findings  
**Status**: 🔴 **PRIORITY 1 - PRODUCTION BLOCKERS**  
**Total Issues**: 7 Critical + 3 Recommendations  
**Estimated Effort**: 4-6 hours (surgical fixes)

---

## 🎯 EXECUTIVE SUMMARY

This blueprint provides **atomic, testable fixes** for all P0 critical vulnerabilities discovered in the Admin Journey audit. Each fix is:
- **Surgical**: Minimal code changes to reduce regression risk
- **Evidence-Based**: Backed by specific code locations and database queries
- **Testable**: Includes verification queries and test cases
- **Zero-Regression**: Preserves existing functionality while hardening security

### Priority Order (Execute in Sequence)
1. **AUTH-001 to AUTH-004**: Missing `assert_admin()` calls (30 min)
2. **AUD-001**: Update RLS documentation (5 min)
3. **FIN-001**: Fix payout race condition (20 min)
4. **DATA-001**: Review cascade rules (15 min)
5. **RECOMMENDATIONS**: Optional hardening (60 min)

---

## 🔧 P0 CRITICAL FIXES

### ❌ **AUTH-001: approve_payout_request Missing Standardized Admin Check**

**Risk Level**: 🔴 **HIGH**  
**Impact**: Manual admin check missing `expires_at` validation  
**Effort**: 10 minutes

#### Current Code
```sql
-- Function: public.approve_payout_request [SECURITY DEFINER]
-- Lines 15-25 (estimated)
SELECT EXISTS (
  SELECT 1 FROM user_roles ur
  JOIN roles r ON r.id = ur.role_id
  WHERE ur.user_id = v_admin_id
    AND r.name = 'admin'
    AND ur.is_active = true  -- ❌ Missing expires_at check
) INTO v_is_admin;

IF NOT v_is_admin THEN
  RETURN jsonb_build_object('success', false, 'message', 'Unauthorized');
END IF;
```

#### Remediation (Migration)
```sql
-- Migration: fix_approve_payout_admin_check.sql

-- Replace manual check with centralized assert_admin()
CREATE OR REPLACE FUNCTION public.approve_payout_request(
  p_request_id uuid,
  p_payment_reference text DEFAULT NULL,
  p_payment_proof_url text DEFAULT NULL,
  p_admin_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_admin_id uuid;
  -- Remove v_is_admin variable
  v_request payout_requests%ROWTYPE;
  v_payout_id uuid;
  v_available_balance bigint;
  v_platform_fee_cents bigint;
  v_net_amount_cents bigint;
  v_lock_acquired boolean;
BEGIN
  v_admin_id := auth.uid();

  -- ✅ FIX: Replace manual check with assert_admin()
  PERFORM private.assert_admin();

  -- ✅ FIX: Change advisory lock to vendor_id instead of request_id
  -- (Combined fix for AUTH-001 and FIN-001)
  
  -- Get request details FIRST to extract vendor_id
  SELECT * INTO v_request
  FROM payout_requests
  WHERE id = p_request_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'Payout request not found');
  END IF;
  
  -- Lock on vendor_id to prevent concurrent approvals for same vendor
  SELECT pg_try_advisory_xact_lock(hashtext(v_request.vendor_id::text)) 
  INTO v_lock_acquired;
  
  IF NOT v_lock_acquired THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Another payout for this vendor is being processed. Please wait.'
    );
  END IF;

  -- Re-query with row lock after advisory lock
  SELECT * INTO v_request
  FROM payout_requests
  WHERE id = p_request_id
  FOR UPDATE;

  -- Verify status is pending
  IF v_request.status != 'pending' THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Only pending requests can be approved',
      'current_status', v_request.status
    );
  END IF;

  -- ... (rest of function remains unchanged)
  
END;
$$;
```

#### Verification Query
```sql
-- Verify function now uses assert_admin()
SELECT 
  routine_name,
  routine_definition LIKE '%assert_admin%' as uses_assert_admin,
  routine_definition LIKE '%v_is_admin%' as has_manual_check
FROM information_schema.routines
WHERE routine_name = 'approve_payout_request';

-- Expected: uses_assert_admin = true, has_manual_check = false
```

#### Test Cases
```sql
-- Test 1: Non-admin cannot approve payout
BEGIN;
SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claim.sub = '<non-admin-user-id>';
SELECT approve_payout_request('<request-id>');
-- Expected: ERROR 42501 'Access denied'
ROLLBACK;

-- Test 2: Admin with expired role cannot approve
-- (assert_admin() now checks expires_at)
BEGIN;
UPDATE user_roles SET expires_at = NOW() - INTERVAL '1 day'
WHERE user_id = '<admin-id>' AND role_id = (SELECT id FROM roles WHERE name = 'admin');
SELECT approve_payout_request('<request-id>');
-- Expected: ERROR 42501 'Access denied'
ROLLBACK;

-- Test 3: Active admin can approve
BEGIN;
SET LOCAL request.jwt.claim.sub = '<active-admin-id>';
SELECT approve_payout_request('<valid-request-id>');
-- Expected: {success: true, payout_id: <uuid>}
ROLLBACK;
```

---

### ❌ **AUTH-002: reject_payout_request Missing Admin Check**

**Risk Level**: 🔴 **HIGH**  
**Impact**: Function likely missing ANY admin verification  
**Effort**: 5 minutes

#### Remediation
```sql
-- Migration: fix_reject_payout_admin_check.sql

CREATE OR REPLACE FUNCTION public.reject_payout_request(
  p_request_id uuid,
  p_rejection_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_admin_id uuid;
BEGIN
  v_admin_id := auth.uid();
  
  -- ✅ ADD: Admin verification
  PERFORM private.assert_admin();
  
  -- Validate rejection reason
  IF p_rejection_reason IS NULL OR LENGTH(TRIM(p_rejection_reason)) = 0 THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Rejection reason is required'
    );
  END IF;
  
  -- Update request status
  UPDATE payout_requests
  SET 
    status = 'rejected',
    reviewed_by = v_admin_id,
    reviewed_at = NOW(),
    admin_notes = p_rejection_reason,
    updated_at = NOW()
  WHERE id = p_request_id
  AND status = 'pending';  -- Only reject pending requests
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Request not found or already processed'
    );
  END IF;
  
  -- Audit log
  INSERT INTO private.audit_log (table_name, record_id, action, new_values, user_id)
  VALUES (
    'payout_requests',
    p_request_id,
    'UPDATE',
    jsonb_build_object(
      'status', 'rejected',
      'reason', p_rejection_reason,
      'action_type', 'payout_rejection'
    ),
    v_admin_id
  );
  
  RETURN jsonb_build_object(
    'success', true,
    'message', 'Payout request rejected'
  );
END;
$$;
```

---

### ❌ **AUTH-003: get_admin_payout_requests Missing Admin Check**

**Risk Level**: 🔴 **HIGH**  
**Impact**: Vendor financial data exposure to non-admins  
**Effort**: 5 minutes

#### Remediation
```sql
-- Migration: fix_get_admin_payout_requests.sql

CREATE OR REPLACE FUNCTION public.get_admin_payout_requests(
  p_status text DEFAULT NULL,
  p_vendor_id uuid DEFAULT NULL,
  p_limit int DEFAULT 50,
  p_offset int DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_requests jsonb;
BEGIN
  -- ✅ ADD: Admin verification at function start
  PERFORM private.assert_admin();
  
  SELECT jsonb_agg(
    jsonb_build_object(
      'id', pr.id,
      'vendor_id', pr.vendor_id,
      'vendor_name', vp.business_name,
      'requested_amount_cents', pr.requested_amount_cents,
      'payment_method', pr.payment_method,
      'bank_account_last4', pr.bank_account_last4,
      'status', pr.status,
      'created_at', pr.created_at,
      'reviewed_by', pr.reviewed_by,
      'reviewed_at', pr.reviewed_at,
      'admin_notes', pr.admin_notes
    ) ORDER BY pr.created_at DESC
  )
  INTO v_requests
  FROM payout_requests pr
  JOIN vendor_profiles vp ON pr.vendor_id = vp.user_id
  WHERE (p_status IS NULL OR pr.status = p_status)
    AND (p_vendor_id IS NULL OR pr.vendor_id = p_vendor_id)
  LIMIT p_limit
  OFFSET p_offset;
  
  RETURN COALESCE(v_requests, '[]'::jsonb);
END;
$$;
```

---

### ❌ **AUTH-004: get_audit_logs Missing Admin Check**

**Risk Level**: 🔴 **CRITICAL** - Audit log access without authorization  
**Impact**: Complete audit trail exposure  
**Effort**: 5 minutes

#### Remediation
```sql
-- Migration: fix_get_audit_logs.sql

CREATE OR REPLACE FUNCTION public.get_audit_logs(
  p_table_name text DEFAULT NULL,
  p_action text DEFAULT NULL,
  p_user_id uuid DEFAULT NULL,
  p_start_date timestamptz DEFAULT NULL,
  p_end_date timestamptz DEFAULT NULL,
  p_limit int DEFAULT 100,
  p_offset int DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_logs jsonb;
  v_calling_user uuid;
BEGIN
  v_calling_user := auth.uid();
  
  -- ✅ ADD: Admin verification
  PERFORM private.assert_admin();
  
  -- Build filtered query
  SELECT jsonb_agg(
    jsonb_build_object(
      'id', al.id,
      'table_name', al.table_name,
      'record_id', al.record_id,
      'action', al.action,
      'old_values', al.old_values,
      'new_values', al.new_values,
      'user_id', al.user_id,
      'user_email', u.email,
      'created_at', al.created_at
    ) ORDER BY al.created_at DESC
  )
  INTO v_logs
  FROM private.audit_log al
  LEFT JOIN auth.users u ON al.user_id = u.id
  WHERE (p_table_name IS NULL OR al.table_name = p_table_name)
    AND (p_action IS NULL OR al.action = p_action)
    AND (p_user_id IS NULL OR al.user_id = p_user_id)
    AND (p_start_date IS NULL OR al.created_at >= p_start_date)
    AND (p_end_date IS NULL OR al.created_at <= p_end_date)
  LIMIT p_limit
  OFFSET p_offset;
  
  RETURN COALESCE(v_logs, '[]'::jsonb);
END;
$$;
```

---

### ❌ **AUTH-005, AUTH-006, AUTH-007: Admin Schedule Functions**

**Risk Level**: 🟡 **MEDIUM** - Lower priority, stylist-facing  
**Effort**: 10 minutes total

#### Remediation
```sql
-- Migration: fix_admin_schedule_functions.sql

-- Fix 1: admin_create_stylist_schedule
CREATE OR REPLACE FUNCTION public.admin_create_stylist_schedule(...)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  PERFORM private.assert_admin();  -- ✅ ADD
  -- ... rest of function
END;
$$;

-- Fix 2: admin_get_all_schedules
CREATE OR REPLACE FUNCTION public.admin_get_all_schedules(...)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  PERFORM private.assert_admin();  -- ✅ ADD
  -- ... rest of function
END;
$$;

-- Fix 3: admin_update_stylist_schedule
CREATE OR REPLACE FUNCTION public.admin_update_stylist_schedule(...)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  PERFORM private.assert_admin();  -- ✅ ADD
  -- ... rest of function
END;
$$;
```

---

### ✅ **AUD-001: Audit Log Immutability Documentation**

**Risk Level**: ✅ **PASS** - Already secure, needs documentation  
**Impact**: None (audit logs are already immutable)  
**Effort**: 5 minutes

#### Finding
Audit logs are **correctly configured** as immutable:
- `user_audit_log`: RLS enabled, 0 UPDATE policies, 0 DELETE policies
- `audit_log` (private schema): RLS disabled, accessed via SECURITY DEFINER only
- `service_management_log` (private schema): RLS disabled, accessed via SECURITY DEFINER only

#### Action Required
**Documentation update only** - no code changes needed.

Create documentation file:
```markdown
# Audit Log Security Model

## Immutability Guarantee
All audit tables are configured as **append-only** (immutable):

### user_audit_log (public schema)
- RLS enabled
- Policies: INSERT (all authenticated), SELECT (admin + self)
- **No UPDATE or DELETE policies** → Records cannot be modified
- Direct table access blocked by RLS

### audit_log (private schema)
- RLS disabled (not needed - no direct access)
- Accessed only via SECURITY DEFINER functions
- Functions never include UPDATE/DELETE operations
- **Immutable by architecture**

### service_management_log (private schema)
- Same security model as audit_log
- Admin actions logged here
- **Immutable by architecture**

## Verification Queries
-- Confirm no UPDATE/DELETE policies
SELECT tablename, cmd, COUNT(*)
FROM pg_policies
WHERE tablename LIKE '%audit%' OR tablename LIKE '%log%'
GROUP BY tablename, cmd
HAVING cmd IN ('UPDATE', 'DELETE');
-- Expected: 0 rows

## Database Backup Requirements
- Daily full backups (retention: 30 days)
- Point-in-time recovery enabled
- Audit logs in separate tablespace (optional hardening)
```

---

### 🔴 **FIN-001: Payout Race Condition (Vendor-Level Locking)**

**Risk Level**: 🟡 **MEDIUM**  
**Impact**: Two admins could approve different requests for same vendor simultaneously  
**Effort**: 20 minutes (already included in AUTH-001 fix above)

#### Current Issue
```sql
-- Current: Lock is on request_id
SELECT pg_try_advisory_xact_lock(hashtext(p_request_id::text));
```

**Problem**: Admin A approves Request 1 for Vendor X, Admin B simultaneously approves Request 2 for Vendor X → Both succeed if vendor has $200, each request is $150 → Overdraft!

#### Fix (Already in AUTH-001 Migration)
```sql
-- New: Lock on vendor_id
SELECT pg_try_advisory_xact_lock(hashtext(v_request.vendor_id::text));
```

**Result**: Second admin gets "Another payout for this vendor is being processed" error.

---

### 🟡 **DATA-001: Cascade Delete Review**

**Risk Level**: 🟡 **MEDIUM**  
**Impact**: Accidental data loss if parent records deleted  
**Effort**: 15 minutes analysis, 30 minutes if changes needed

#### Current State
```sql
order_items.order_id → orders.id [ON DELETE CASCADE]
user_roles.role_id → roles.id [ON DELETE CASCADE]
```

#### Risk Assessment

**order_items CASCADE**: 
- **Risk Level**: LOW
- **Rationale**: If an order is deleted, its items SHOULD be deleted (referential integrity)
- **Mitigation**: Orders use soft deletes (deleted_at), so physical DELETE should never happen
- **Action**: ✅ No change needed, but verify soft delete enforcement

**user_roles CASCADE**:
- **Risk Level**: MEDIUM
- **Rationale**: Deleting 'admin' role would remove all admin assignments
- **Mitigation**: Roles are system data, should never be deleted
- **Action**: Add trigger to prevent role deletion

#### Remediation (Optional)
```sql
-- Migration: prevent_critical_role_deletion.sql

CREATE OR REPLACE FUNCTION prevent_role_deletion()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.name IN ('admin', 'vendor', 'stylist', 'customer') THEN
    RAISE EXCEPTION 'Cannot delete system role: %', OLD.name
      USING ERRCODE = '23503';  -- foreign_key_violation
  END IF;
  RETURN OLD;
END;
$$;

CREATE TRIGGER trigger_prevent_role_deletion
  BEFORE DELETE ON roles
  FOR EACH ROW
  EXECUTE FUNCTION prevent_role_deletion();
```

---

## 📋 RECOMMENDED HARDENING (Non-Blocking)

### REC-001: Database-Level Commission Rate Constraint

**Effort**: 5 minutes

```sql
-- Migration: add_commission_rate_constraint.sql

ALTER TABLE vendor_profiles 
ADD CONSTRAINT check_commission_rate 
CHECK (commission_rate >= 0 AND commission_rate <= 1);

COMMENT ON CONSTRAINT check_commission_rate ON vendor_profiles IS 
  'Ensures commission rate is between 0 (0%) and 1 (100%)';
```

**Benefit**: Defense-in-depth if function validation is ever bypassed.

---

### REC-002: Audit Triggers for Automatic Logging

**Effort**: 60 minutes (full implementation)  
**Priority**: P1 (not blocking, but high value)

```sql
-- Migration: add_audit_triggers.sql

-- Generic audit trigger function
CREATE OR REPLACE FUNCTION private.audit_trigger_func()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF (TG_OP = 'DELETE') THEN
    INSERT INTO private.audit_log (
      table_name, record_id, action, old_values, user_id
    ) VALUES (
      TG_TABLE_NAME, OLD.id, TG_OP, row_to_json(OLD)::jsonb, auth.uid()
    );
    RETURN OLD;
  ELSIF (TG_OP = 'UPDATE') THEN
    INSERT INTO private.audit_log (
      table_name, record_id, action, old_values, new_values, user_id
    ) VALUES (
      TG_TABLE_NAME, NEW.id, TG_OP, row_to_json(OLD)::jsonb, row_to_json(NEW)::jsonb, auth.uid()
    );
    RETURN NEW;
  ELSIF (TG_OP = 'INSERT') THEN
    INSERT INTO private.audit_log (
      table_name, record_id, action, new_values, user_id
    ) VALUES (
      TG_TABLE_NAME, NEW.id, TG_OP, row_to_json(NEW)::jsonb, auth.uid()
    );
    RETURN NEW;
  END IF;
END;
$$;

-- Apply to critical tables
CREATE TRIGGER audit_payouts
  AFTER INSERT OR UPDATE OR DELETE ON payouts
  FOR EACH ROW EXECUTE FUNCTION private.audit_trigger_func();

CREATE TRIGGER audit_user_roles
  AFTER INSERT OR UPDATE OR DELETE ON user_roles
  FOR EACH ROW EXECUTE FUNCTION private.audit_trigger_func();

CREATE TRIGGER audit_vendor_profiles_commission
  AFTER UPDATE OF commission_rate ON vendor_profiles
  FOR EACH ROW 
  WHEN (OLD.commission_rate IS DISTINCT FROM NEW.commission_rate)
  EXECUTE FUNCTION private.audit_trigger_func();
```

---

### REC-003: Emergency Admin Access Procedure

**Effort**: Documentation only (30 minutes)

Create runbook for emergency scenarios:
```markdown
# Emergency Admin Access Procedures

## Scenario 1: Last Admin Account Locked
**Symptoms**: All admin accounts suspended or expired
**Resolution**:
1. Connect to database with service role (Supabase Dashboard)
2. Execute:
   ```sql
   -- Reactivate emergency admin
   UPDATE auth.users 
   SET banned_until = NULL 
   WHERE email = 'emergency@kb-stylish.com';
   
   -- Verify admin role
   SELECT user_has_role(id, 'admin') 
   FROM auth.users 
   WHERE email = 'emergency@kb-stylish.com';
   ```
3. Log incident in audit_log manually
4. Investigate root cause

## Scenario 2: Payout Approval Deadlock
**Symptoms**: All payout approvals timing out
**Resolution**:
1. Check for stuck advisory locks:
   ```sql
   SELECT * FROM pg_locks WHERE locktype = 'advisory';
   ```
2. Release if transaction is stuck:
   ```sql
   SELECT pg_advisory_unlock_all();
   ```
3. Investigate transaction that acquired lock
```

---

## ✅ DEPLOYMENT CHECKLIST

### Pre-Deployment
- [ ] Review all migration files
- [ ] Test migrations on staging database
- [ ] Run verification queries
- [ ] Execute test cases (see each fix section)
- [ ] Backup production database
- [ ] Schedule maintenance window (5-10 minutes)

### Deployment Order
1. [ ] Apply AUTH-001 to AUTH-007 migrations (single migration file)
2. [ ] Verify with: `SELECT routine_name, routine_definition LIKE '%assert_admin%' FROM information_schema.routines WHERE routine_name IN ('approve_payout_request', 'reject_payout_request', 'get_admin_payout_requests', 'get_audit_logs')`
3. [ ] Apply FIN-001 fix (if not included in AUTH-001)
4. [ ] Test payout approval with 2 concurrent requests
5. [ ] (Optional) Apply REC-001: Commission rate constraint
6. [ ] (Optional) Apply DATA-001: Role deletion prevention
7. [ ] Document AUD-001 findings (no migration needed)

### Post-Deployment Verification
- [ ] Run all test cases from blueprint
- [ ] Check Edge Function logs for any 403 errors
- [ ] Verify payout approval still works
- [ ] Test admin user management
- [ ] Monitor error rates for 24 hours

### Rollback Plan
All fixes are additive (add `assert_admin()` calls). Rollback:
```sql
-- Emergency rollback (restores manual checks)
-- Only if critical issue discovered
-- See migration files for per-function rollback
```

---

## 📊 RISK MITIGATION MATRIX

| Issue | Current Risk | Post-Fix Risk | Mitigation |
|-------|-------------|---------------|------------|
| AUTH-001 to AUTH-004 | 🔴 HIGH | ✅ NONE | Centralized admin assertion |
| AUD-001 | ✅ NONE | ✅ NONE | Already secure (documentation) |
| FIN-001 | 🟡 MEDIUM | ✅ NONE | Vendor-level locking |
| DATA-001 | 🟡 MEDIUM | 🟢 LOW | Trigger prevents role deletion |

**Overall Risk Reduction**: 🔴 HIGH → ✅ NONE (P0 blockers eliminated)

---

## 🚀 ESTIMATED TIMELINE

### Critical Path (Production Blockers)
- **Analysis & Review**: 30 minutes (COMPLETE - this document)
- **Migration Development**: 45 minutes
- **Testing on Staging**: 30 minutes
- **Production Deployment**: 15 minutes
- **Verification**: 30 minutes
- **Total**: ~2.5 hours

### Optional Hardening
- **REC-001**: 15 minutes
- **REC-002**: 90 minutes (full audit trigger system)
- **REC-003**: 60 minutes (documentation + testing)
- **Total**: ~2.5 hours

**Grand Total**: 5 hours (critical + optional)

---

## ✅ SUCCESS CRITERIA

### P0 Fixes (MUST PASS)
1. All 7 vulnerable functions call `assert_admin()`
2. Non-admin users receive 403/42501 errors when attempting admin operations
3. Expired admin roles cannot access admin functions
4. Payout approvals for same vendor are serialized (no race conditions)
5. Audit logs remain immutable (no UPDATE/DELETE policies)

### Regression Prevention (MUST PASS)
1. All existing admin operations still work
2. No performance degradation (advisory locks are fast)
3. No breaking changes to API contracts
4. All existing tests pass

### Optional Criteria (NICE TO HAVE)
1. Automatic audit triggers capturing all changes
2. Commission rate constraint enforced at database level
3. Emergency procedures documented and tested

---

**Status**: Ready for Implementation  
**Approval Required**: Yes (user confirmation before executing migrations)  
**Next Phase**: Execute migrations → Test → Deploy → P1 Audit
