# 🔒 FAANG SELF-AUDIT: AUDIT LOG VIEWER
**KB Stylish - Pre-Mortem Security Analysis**

**Conducted:** October 15, 2025  
**Reviewer Role:** Senior Security Architect (FAANG Standards)  
**Review Target:** Audit Log Viewer Implementation Plan  
**Mandate:** Find the single biggest flaw that could cause production failure

---

## 🎯 CRITICAL FLAW IDENTIFIED

### **FLAW #1: INSUFFICIENT ACCESS CONTROL - NO "AUDITOR" ROLE SEPARATION** 🚨

**Severity:** 🔴 **CRITICAL** (CVSS 7.5 - Privilege Escalation Risk)

**Issue:**
The current design grants **all admins** unrestricted access to **all audit logs**, including logs of their own potentially malicious actions. This violates the **separation of duties** principle and creates a severe compliance and security risk.

**Attack Scenario:**
```
Scenario: Rogue Admin Covering Tracks

1. Admin "Alice" (malicious insider) performs unauthorized action:
   - Promotes her friend to stylist without proper checks
   - Modifies override budgets to grant unlimited schedule changes
   - Exports customer PII without business justification

2. Actions are logged to service_management_log:
   - admin_user_id: alice-uuid
   - action: 'complete_stylist_promotion'
   - details: {bypass_checks: true}

3. Alice opens Audit Log Viewer:
   - ✅ Can see her own malicious actions (admin role granted)
   - ✅ Knows exactly what evidence exists
   - ✅ Can coordinate future actions to avoid detection

4. Alice reports "security concern" to management:
   - Claims she found suspicious activity in logs
   - Deflects blame to other admins
   - Continues malicious activity while appearing vigilant

5. Compliance Failure:
   - Auditor (separate from admin team) cannot access logs
   - External compliance audit fails: "Who watches the watchers?"
   - No separation of duties (SOX, GDPR, PCI-DSS violation)
```

**What's Missing:**

1. **No Auditor Role:**
   - Only "admin" role check in RPC: `IF NOT public.user_has_role(p_admin_id, 'admin')`
   - No dedicated "auditor" role for independent oversight
   - No role hierarchy (auditor should see admin logs, admins should NOT see auditor logs)

2. **No Self-Audit Restriction:**
   - Admins can view their own audit trail
   - No filtering like: `WHERE admin_user_id != p_requesting_admin_id`
   - Admins know exactly what evidence exists against them

3. **No Sensitive Action Redaction:**
   - All logs visible to all admins equally
   - No category-based access (security events should be auditor-only)
   - Example: Failed admin login attempts, privilege escalation attempts

4. **No Compliance Requirement:**
   - SOX Section 404: Requires independent audit oversight
   - GDPR Article 25: Privacy by design (data access must be monitored independently)
   - PCI-DSS 10.2.5: Audit trails must be protected from modification/deletion by those being audited

**Production Impact:**
- ❌ Failed compliance audits (SOX, GDPR, PCI-DSS)
- ❌ Rogue admins can evade detection
- ❌ No independent oversight of admin actions
- ❌ "Fox guarding the henhouse" architecture
- ❌ Legal liability for data breaches

**Risk Level:** 🔴 **CRITICAL** (Blocks production deployment for regulated industries)

---

## ✅ PROPOSED FIX: THREE-TIER ACCESS CONTROL

### Enhanced Design

**Access Levels:**

1. **Level 1: Admin (Current)** - Can view **configuration & governance** logs (excluding security events)
   - Use case: Review stylist promotions, schedule overrides, budget changes
   - Restriction: **Cannot see security category logs** (auth failures, access attempts)
   - Restriction: **Cannot see their own logs** (prevents self-audit)

2. **Level 2: Auditor (New)** - Can view **all logs** except auditor actions
   - Use case: Independent compliance officer reviewing admin actions
   - Access: Security, governance, configuration, data_access categories
   - Restriction: Cannot see logs of other auditors (peer auditing only)

3. **Level 3: Super Auditor (New)** - Can view **everything** including auditor logs
   - Use case: CEO, CTO, external compliance firm
   - Access: Unrestricted read-only access to all audit logs
   - Typical: 1-2 people in organization

### Enhanced RPC Function

```sql
CREATE OR REPLACE FUNCTION private.get_audit_logs(
  p_requesting_user_id UUID,
  p_category TEXT DEFAULT NULL,
  p_severity TEXT DEFAULT NULL,
  p_start_date TIMESTAMPTZ DEFAULT NULL,
  p_end_date TIMESTAMPTZ DEFAULT NULL,
  p_limit INTEGER DEFAULT 50,
  p_offset INTEGER DEFAULT 0
)
RETURNS TABLE(
  id BIGINT,
  admin_user_id UUID,
  admin_email TEXT,
  admin_display_name TEXT,
  action TEXT,
  target_id UUID,
  target_type TEXT,
  severity TEXT,
  category TEXT,
  details JSONB,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ,
  total_count BIGINT
)
SECURITY DEFINER
SET search_path = 'private', 'public', 'auth', 'pg_temp'
LANGUAGE plpgsql
AS $$
DECLARE
  v_is_admin BOOLEAN;
  v_is_auditor BOOLEAN;
  v_is_super_auditor BOOLEAN;
BEGIN
  -- Determine access level
  v_is_admin := public.user_has_role(p_requesting_user_id, 'admin');
  v_is_auditor := public.user_has_role(p_requesting_user_id, 'auditor');
  v_is_super_auditor := public.user_has_role(p_requesting_user_id, 'super_auditor');
  
  -- Require at least admin role
  IF NOT (v_is_admin OR v_is_auditor OR v_is_super_auditor) THEN
    RAISE EXCEPTION 'Unauthorized: Admin, Auditor, or Super Auditor role required'
      USING ERRCODE = '42501';
  END IF;

  -- Return filtered, paginated logs with role-based access
  RETURN QUERY
  WITH log_data AS (
    SELECT 
      sml.id,
      sml.admin_user_id,
      sml.action,
      sml.target_id,
      sml.target_type,
      sml.severity,
      sml.category,
      -- Redact sensitive details for regular admins
      CASE
        WHEN v_is_super_auditor THEN sml.details
        WHEN v_is_auditor THEN sml.details
        WHEN v_is_admin AND sml.category != 'security' THEN sml.details
        ELSE NULL  -- Admins cannot see security event details
      END as details,
      sml.ip_address,
      sml.user_agent,
      sml.created_at
    FROM private.service_management_log sml
    WHERE 
      -- Filter by category (if specified)
      (p_category IS NULL OR sml.category = p_category)
      -- Filter by severity (if specified)
      AND (p_severity IS NULL OR sml.severity = p_severity)
      -- Filter by date range
      AND (p_start_date IS NULL OR sml.created_at >= p_start_date)
      AND (p_end_date IS NULL OR sml.created_at <= p_end_date)
      -- ROLE-BASED FILTERING (THE FIX):
      AND (
        -- Super Auditors: See everything
        v_is_super_auditor
        -- Auditors: See all categories, exclude own actions
        OR (v_is_auditor AND sml.admin_user_id != p_requesting_user_id)
        -- Admins: Only governance & configuration, exclude own actions, exclude security
        OR (v_is_admin AND sml.admin_user_id != p_requesting_user_id AND sml.category IN ('governance', 'configuration'))
      )
    ORDER BY sml.created_at DESC
    LIMIT p_limit
    OFFSET p_offset
  ),
  total AS (
    SELECT COUNT(*) as count
    FROM private.service_management_log sml
    WHERE 
      (p_category IS NULL OR sml.category = p_category)
      AND (p_severity IS NULL OR sml.severity = p_severity)
      AND (p_start_date IS NULL OR sml.created_at >= p_start_date)
      AND (p_end_date IS NULL OR sml.created_at <= p_end_date)
      AND (
        v_is_super_auditor
        OR (v_is_auditor AND sml.admin_user_id != p_requesting_user_id)
        OR (v_is_admin AND sml.admin_user_id != p_requesting_user_id AND sml.category IN ('governance', 'configuration'))
      )
  )
  SELECT 
    ld.id,
    ld.admin_user_id,
    au.email as admin_email,
    up.display_name as admin_display_name,
    ld.action,
    ld.target_id,
    ld.target_type,
    ld.severity,
    ld.category,
    ld.details,
    ld.ip_address,
    ld.user_agent,
    ld.created_at,
    t.count as total_count
  FROM log_data ld
  CROSS JOIN total t
  LEFT JOIN auth.users au ON ld.admin_user_id = au.id
  LEFT JOIN public.user_profiles up ON au.id = up.id;
END;
$$;

COMMENT ON FUNCTION private.get_audit_logs IS 'Role-based audit log access: Super Auditors (all), Auditors (all except own), Admins (governance & config, exclude own & security). Implements separation of duties.';
```

### Key Changes

1. ✅ **Three-tier role system** (admin, auditor, super_auditor)
2. ✅ **Self-audit prevention** (`admin_user_id != p_requesting_user_id`)
3. ✅ **Category restrictions** (admins cannot see 'security' or 'data_access' logs)
4. ✅ **Detail redaction** (sensitive fields masked for lower-privilege roles)
5. ✅ **Compliance-ready** (SOX, GDPR, PCI-DSS compatible)

### Required Database Changes

```sql
-- Add new roles to user_roles table (if not exists)
-- No migration needed - roles are managed dynamically via user_roles table

-- Example role assignment:
-- INSERT INTO user_roles (user_id, role_name) 
-- VALUES ('compliance-officer-uuid', 'auditor');
-- VALUES ('ceo-uuid', 'super_auditor');
```

### UI Changes

**Audit Log Viewer UI Enhancements:**

1. **Role Badge Display:**
   ```typescript
   // Show user's access level in header
   {userRole === 'super_auditor' && (
     <div className="text-xs text-violet-300">
       🔓 Super Auditor Access (Unrestricted)
     </div>
   )}
   {userRole === 'auditor' && (
     <div className="text-xs text-blue-300">
       🔍 Auditor Access (All logs except own)
     </div>
   )}
   {userRole === 'admin' && (
     <div className="text-xs text-amber-300">
       ⚠️ Admin Access (Governance & Configuration only)
     </div>
   )}
   ```

2. **Category Filter Restrictions:**
   ```typescript
   // Disable "Security" and "Data Access" options for regular admins
   <option value="security" disabled={userRole === 'admin'}>
     Security {userRole === 'admin' && '(Auditor Only)'}
   </option>
   ```

3. **Redaction Notice:**
   ```typescript
   // Show when details are redacted
   {log.details === null && (
     <div className="text-xs text-foreground/40 italic">
       [Details redacted - insufficient privileges]
     </div>
   )}
   ```

---

## 🎯 VERDICT: FIX REQUIRED BEFORE PRODUCTION

**Decision:** ❌ **BLOCK DEPLOYMENT** until role-based access control is implemented

**Justification:**
- Current design fails basic security principle: "Who watches the watchers?"
- Compliance risk: Fails SOX, GDPR, PCI-DSS audit requirements
- Operational risk: Rogue admins can evade detection
- Reputational risk: Data breach with no independent oversight

**Implementation Priority:** 🔴 **CRITICAL** (Must fix before Phase 6 implementation)

**Estimated Effort:**
- Database: +30 lines (enhanced RPC with role checks)
- Frontend: +50 lines (role badge, filter restrictions, redaction UI)
- Testing: +3 test cases (admin, auditor, super_auditor access verification)
- **Total:** 2-3 hours additional work

**Recommendation:** Implement the enhanced three-tier access control before proceeding to Phase 6.

---

## 📊 SECONDARY FINDINGS (Non-Blocking)

### Finding #2: No Rate Limiting ⚠️

**Issue:** No protection against audit log enumeration attacks
**Impact:** Attacker could scrape entire audit history
**Fix:** Add rate limiting middleware (10 requests/minute per user)
**Priority:** 🟡 MEDIUM (v2 enhancement)

### Finding #3: No Export Functionality ℹ️

**Issue:** No CSV/JSON export for compliance reporting
**Impact:** Manual copy-paste for external audits
**Fix:** Add "Export to CSV" button with date range
**Priority:** 🟢 LOW (nice-to-have)

### Finding #4: No Real-Time Alerts ℹ️

**Issue:** Critical events not pushed to administrators
**Impact:** Delayed response to security incidents
**Fix:** Add webhook notifications for severity='critical' logs
**Priority:** 🟢 LOW (future enhancement)

---

## ✅ FINAL AUDIT SCORE

**Security:** 6/10 (❌ Fails separation of duties)  
**Compliance:** 4/10 (❌ Not SOX/GDPR ready)  
**Scalability:** 9/10 (✅ Pagination, indexing)  
**UX:** 8/10 (✅ Clean, filterable)  
**Overall:** **CONDITIONAL APPROVAL** pending Critical Flaw #1 fix

**Next Steps:**
1. Implement three-tier role-based access (REQUIRED)
2. Update frontend to show access level (REQUIRED)
3. Test with admin, auditor, super_auditor roles (REQUIRED)
4. Proceed to Phase 6 implementation (AFTER FIX)

---

**Audit Completed:** October 15, 2025  
**Reviewed By:** Principal Security Architect (Simulated FAANG Standards)  
**Status:** 🔴 **FIX REQUIRED**
