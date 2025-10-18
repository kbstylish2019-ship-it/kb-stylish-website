# 🔍 AUDIT LOG VIEWER IMPLEMENTATION PLAN
**KB Stylish - Admin Governance & Oversight Interface**

**Document Type:** Technical Implementation Blueprint  
**Created:** October 15, 2025  
**Protocol:** Universal AI Excellence Protocol (10-Phase)  
**Status:** 🟢 READY FOR IMPLEMENTATION

---

## 📋 EXECUTIVE SUMMARY

This document provides the complete technical specification for implementing the **Admin Audit Log Viewer**, the final component of the Blueprint v3.1 Admin UI campaign. The Audit Log Viewer will provide administrators with secure, read-only access to the `private.service_management_log` table, enabling governance oversight of all critical service engine operations.

### System Context

The `private.service_management_log` table was deployed as part of Blueprint v3.1 foundation (migration `20251015160000_blueprint_v3_1_foundation.sql`) and is currently being populated by promotion workflow RPCs. However, no UI exists to view these critical audit records.

### Objectives

1. **Secure Read-Only Access:** Admin-only access to audit logs via RPC (no direct table access)
2. **Category-Based Filtering:** Filter logs by category (governance, security, data_access, configuration)
3. **Severity Filtering:** Highlight critical and warning events for immediate attention
4. **Time-Range Queries:** Search logs by date range
5. **Pagination:** Handle potentially large datasets efficiently
6. **No Data Tampering:** Logs are immutable; UI is strictly read-only

---

## 🗄️ DATABASE LAYER

### Existing Schema (Verified from Live Migration)

```sql
-- Table: private.service_management_log
CREATE TABLE private.service_management_log (
  id BIGSERIAL PRIMARY KEY,
  admin_user_id UUID NOT NULL REFERENCES auth.users(id),
  action TEXT NOT NULL,
  target_id UUID,
  target_type TEXT CHECK (target_type IN (
    'service', 'stylist_profile', 'stylist_schedule', 
    'stylist_promotion', 'schedule_override', 'override_budget'
  )),
  severity TEXT NOT NULL DEFAULT 'info' CHECK (severity IN ('info', 'warning', 'critical')),
  category TEXT NOT NULL CHECK (category IN (
    'governance',      -- Role assignments, promotions, access control
    'security',        -- Authentication failures, privilege escalation attempts
    'data_access',     -- PII access, data exports, sensitive queries
    'configuration'    -- System settings, budget changes, schedule modifications
  )),
  details JSONB,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes (already exist)
CREATE INDEX idx_service_mgmt_log_category 
  ON private.service_management_log(category, created_at DESC);
CREATE INDEX idx_service_mgmt_log_admin 
  ON private.service_management_log(admin_user_id, created_at DESC);
CREATE INDEX idx_service_mgmt_log_severity 
  ON private.service_management_log(severity, created_at DESC) 
  WHERE severity IN ('warning', 'critical');
CREATE INDEX idx_service_mgmt_log_created 
  ON private.service_management_log(created_at DESC);
```

**Key Notes:**
- **Private schema** → No RLS policies (access via RPC only)
- **Immutable** → No `updated_at`, only `created_at`
- **References `auth.users(id)`** → Not `user_profiles(id)`
- **Indexed for filtering** → Category, severity, admin, time-based queries optimized

### New RPC Function: `private.get_audit_logs`

**Purpose:** Secure, filterable, paginated access to audit logs for admin users.

**Signature:**
```sql
CREATE OR REPLACE FUNCTION private.get_audit_logs(
  p_admin_id UUID,
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
BEGIN
  -- Validate: Admin has admin role
  IF NOT public.user_has_role(p_admin_id, 'admin') THEN
    RAISE EXCEPTION 'Unauthorized: Admin role required'
      USING ERRCODE = '42501';
  END IF;

  -- Return filtered, paginated logs with admin details
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
      sml.details,
      sml.ip_address,
      sml.user_agent,
      sml.created_at
    FROM private.service_management_log sml
    WHERE 
      (p_category IS NULL OR sml.category = p_category)
      AND (p_severity IS NULL OR sml.severity = p_severity)
      AND (p_start_date IS NULL OR sml.created_at >= p_start_date)
      AND (p_end_date IS NULL OR sml.created_at <= p_end_date)
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

COMMENT ON FUNCTION private.get_audit_logs IS 'Admin-only RPC for viewing service management audit logs with filtering and pagination. SECURITY DEFINER grants access to private schema.';
```

**Security Features:**
- ✅ `SECURITY DEFINER` → Runs with function owner privileges (bypasses RLS)
- ✅ `SET search_path` → Prevents schema injection attacks
- ✅ Admin role check → Uses existing `public.user_has_role()` function
- ✅ Returns total count → For pagination UI
- ✅ Enriches with admin details → Joins `auth.users` and `user_profiles`

**Performance:**
- ✅ Uses existing indexes for filtering
- ✅ Paginated results (default 50 records)
- ✅ CTE for total count (single query)

---

## 🔌 API LAYER

### New API Route: `/api/admin/audit-logs/view`

**Method:** POST  
**Authentication:** Required (admin role)  
**Purpose:** Proxy to `private.get_audit_logs` RPC with validation

**Request Body:**
```typescript
interface GetAuditLogsRequest {
  category?: 'governance' | 'security' | 'data_access' | 'configuration';
  severity?: 'info' | 'warning' | 'critical';
  startDate?: string; // ISO 8601 timestamp
  endDate?: string;   // ISO 8601 timestamp
  limit?: number;     // Default: 50, Max: 200
  offset?: number;    // Default: 0
}
```

**Response (Success):**
```typescript
interface GetAuditLogsResponse {
  success: true;
  logs: AuditLog[];
  totalCount: number;
  currentPage: number;
  totalPages: number;
}

interface AuditLog {
  id: number;
  adminUserId: string;
  adminEmail: string;
  adminDisplayName: string | null;
  action: string;
  targetId: string | null;
  targetType: string | null;
  severity: 'info' | 'warning' | 'critical';
  category: 'governance' | 'security' | 'data_access' | 'configuration';
  details: Record<string, any> | null;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string; // ISO 8601
}
```

**Response (Error):**
```typescript
interface ErrorResponse {
  success: false;
  error: string;
  code: string;
}
```

**Implementation:** See "Exact TypeScript Code" section below.

---

## 🎨 FRONTEND LAYER

### New Page: `/src/app/admin/logs/audit/page.tsx`

**Type:** Server Component (handles auth, fetches initial data)

**Responsibilities:**
1. Verify user authentication
2. Verify admin role
3. Render page shell with DashboardLayout
4. Pass data to Client Component

**Implementation:** See "Exact TypeScript Code" section below.

### New Component: `/src/components/admin/AuditLogsClient.tsx`

**Type:** Client Component (handles interactivity, filtering, pagination)

**Features:**
1. **Filter Controls:**
   - Category dropdown (All, Governance, Security, Data Access, Configuration)
   - Severity dropdown (All, Info, Warning, Critical)
   - Date range picker (Start Date, End Date)
   - Clear filters button

2. **Data Table:**
   - Timestamp (sortable)
   - Admin (email + display name)
   - Action
   - Category badge (color-coded)
   - Severity badge (color-coded: info=blue, warning=yellow, critical=red)
   - Details (expandable JSON viewer)

3. **Pagination:**
   - Previous/Next buttons
   - Page indicator (e.g., "Showing 1-50 of 324")
   - Page size selector (50, 100, 200)

4. **State Management:**
   - Filter state (local component state)
   - Pagination state (page, pageSize)
   - Loading state (during API calls)
   - Error state (API failures)

**Implementation:** See "Exact TypeScript Code" section below.

---

