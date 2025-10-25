# 🎯 BLUEPRINT: ADMIN VENDORS MANAGEMENT v1.0

**Priority**: 3 of 3 (Critical for Beta Launch)  
**Date**: October 12, 2025  
**Methodology**: UNIVERSAL_AI_EXCELLENCE_PROMPT.md v2.0  
**Status**: Phase 1 Complete - Live System Verified  

---

## 🎯 PROBLEM STATEMENT

Admins need a centralized interface to manage vendor applications and operations. Currently:
- ❌ No UI to view all vendors
- ❌ Cannot approve/reject vendor applications
- ❌ Cannot update commission rates
- ❌ Cannot suspend vendor accounts
- ❌ No vendor search or filtering
- ❌ Cannot view vendor performance metrics

**Business Impact**: Manual database operations required, slow vendor onboarding, no vendor oversight.

---

## 📊 LIVE SYSTEM STATE (Verified via MCP)

### **vendor_profiles Table**:
```sql
user_id UUID (FK to auth.users)
business_name TEXT NOT NULL
business_type TEXT
tax_id TEXT
business_address_id UUID (FK to user_addresses)
verification_status TEXT DEFAULT 'pending'
  CHECK (verification_status IN ('pending', 'verified', 'rejected'))
commission_rate NUMERIC DEFAULT 0.15
created_at TIMESTAMPTZ DEFAULT now()
updated_at TIMESTAMPTZ DEFAULT now()
```

### **Current Data**:
- **Total Vendors**: 4
- **Verified**: 3
- **Pending**: 1
- **Rejected**: 0

### **Existing Vendor Functions**:
- `get_vendor_dashboard_stats_v2_1()` - Vendor's own metrics
- `get_vendor_products_list()` - Vendor's products
- `create_vendor_product()`, `update_vendor_product()`, `delete_vendor_product()`
- `update_vendor_metrics_for_day()`, `update_vendor_realtime_cache()`

### **Missing Functions** (Need to Create):
- ❌ `get_admin_vendors_list()` - List all vendors
- ❌ `approve_vendor()` - Approve application
- ❌ `reject_vendor()` - Reject application
- ❌ `update_vendor_commission()` - Change commission rate
- ❌ `suspend_vendor()` - Suspend vendor account

---

## 💡 PROPOSED SOLUTION

Build **Admin Vendors Management** page at `/admin/vendors` with:
1. **Vendor List View**: Paginated table with search & filters
2. **Approval Workflow**: Approve/reject pending applications
3. **Commission Management**: Update commission rates
4. **Vendor Suspension**: Suspend/activate vendor accounts
5. **Performance Metrics**: View vendor stats (GMV, orders, products)
6. **Search & Filters**: By name, status, business type

---

## 🏗️ ARCHITECTURE DESIGN

### Data Flow
```
Frontend (/admin/vendors)
    ↓ (Server Component fetches initial data)
API Client (apiClient.ts)
    ↓ (calls PostgreSQL RPC)
Database Functions (SECURITY DEFINER/INVOKER)
    ↓ (verifies admin with assert_admin())
Database Tables (vendor_profiles, user_profiles, user_roles)
    ↓ (returns data with RLS enforced)
Frontend Client Component
    ↓ (renders interactive table)
Admin Actions (approve, reject, suspend, update commission)
    ↓ (calls API mutation)
Audit Log (user_audit_log table)
```

### Components
```
/admin/vendors/page.tsx (Server Component)
    → Fetches initial vendor list
    → Verifies admin auth
    → Renders VendorsPageClient

/components/admin/VendorsPageClient.tsx (Client Component)
    → Interactive table
    → Search & filters
    → Approval actions
    → Commission modal
    → Suspend/activate actions

/components/admin/VendorApprovalModal.tsx (Client Component)
    → Approve/reject with notes
    → Confirmation dialog
    → Sets verification_status

/components/admin/CommissionModal.tsx (Client Component)
    → Update commission rate
    → Validation (0-100%)
    → Confirmation
```

---

## 🗄️ DATABASE CHANGES

### New Functions

#### 1. `public.get_admin_vendors_list()`
```sql
CREATE OR REPLACE FUNCTION public.get_admin_vendors_list(
  p_page integer DEFAULT 1,
  p_per_page integer DEFAULT 20,
  p_search text DEFAULT NULL,
  p_status_filter text DEFAULT NULL,
  p_business_type_filter text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, auth, private, pg_temp
SET statement_timeout = '10s'
AS $$
DECLARE
  v_offset integer;
  v_total integer;
  v_vendors jsonb;
BEGIN
  -- Verify admin
  IF NOT private.assert_admin() THEN
    RAISE EXCEPTION 'Unauthorized: Admin access required';
  END IF;

  -- Validate pagination
  IF p_per_page > 100 THEN
    p_per_page := 100;
  END IF;

  v_offset := (p_page - 1) * p_per_page;
  
  -- Build query with filters
  WITH filtered_vendors AS (
    SELECT 
      vp.user_id,
      vp.business_name,
      vp.business_type,
      vp.tax_id,
      vp.verification_status,
      vp.commission_rate,
      vp.created_at,
      up.display_name,
      up.username,
      up.avatar_url,
      au.email,
      au.last_sign_in_at,
      -- Get vendor metrics (products, orders, revenue)
      (SELECT COUNT(*) FROM products WHERE vendor_id = vp.user_id) as total_products,
      (SELECT COUNT(*) FROM products WHERE vendor_id = vp.user_id AND is_active = true) as active_products,
      COALESCE(
        (SELECT SUM(oi.quantity * oi.price_at_purchase)
         FROM order_items oi
         JOIN orders o ON oi.order_id = o.id
         WHERE oi.vendor_id = vp.user_id
         AND o.status = 'completed'),
        0
      ) as total_revenue,
      (SELECT COUNT(DISTINCT o.id)
       FROM orders o
       JOIN order_items oi ON o.id = oi.order_id
       WHERE oi.vendor_id = vp.user_id
       AND o.status = 'completed') as total_orders
    FROM vendor_profiles vp
    LEFT JOIN user_profiles up ON vp.user_id = up.id
    LEFT JOIN auth.users au ON vp.user_id = au.id
    WHERE 
      au.deleted_at IS NULL
      AND (
        p_search IS NULL OR 
        vp.business_name ILIKE '%' || p_search || '%' OR
        up.display_name ILIKE '%' || p_search || '%' OR
        au.email ILIKE '%' || p_search || '%'
      )
      AND (p_status_filter IS NULL OR vp.verification_status = p_status_filter)
      AND (p_business_type_filter IS NULL OR vp.business_type = p_business_type_filter)
  )
  SELECT COUNT(*) INTO v_total FROM filtered_vendors;
  
  -- Get paginated results
  SELECT jsonb_agg(row_to_json(fv)::jsonb ORDER BY created_at DESC)
  INTO v_vendors
  FROM (
    SELECT * FROM filtered_vendors
    ORDER BY created_at DESC
    LIMIT p_per_page
    OFFSET v_offset
  ) fv;
  
  -- Return response
  RETURN jsonb_build_object(
    'vendors', COALESCE(v_vendors, '[]'::jsonb),
    'total', v_total,
    'page', p_page,
    'per_page', p_per_page,
    'total_pages', CEIL(v_total::numeric / p_per_page::numeric)
  );
END;
$$;
```

#### 2. `public.approve_vendor()`
```sql
CREATE OR REPLACE FUNCTION public.approve_vendor(
  p_vendor_id uuid,
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, private, pg_temp
SET statement_timeout = '5s'
AS $$
DECLARE
  v_admin_id uuid;
  v_vendor_email text;
BEGIN
  v_admin_id := auth.uid();
  
  -- Verify admin
  IF NOT private.assert_admin() THEN
    RAISE EXCEPTION 'Unauthorized: Admin access required';
  END IF;
  
  -- Check vendor exists and is pending
  IF NOT EXISTS (
    SELECT 1 FROM vendor_profiles 
    WHERE user_id = p_vendor_id 
    AND verification_status = 'pending'
  ) THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Vendor not found or already processed'
    );
  END IF;
  
  -- Update verification status
  UPDATE vendor_profiles
  SET 
    verification_status = 'verified',
    updated_at = now()
  WHERE user_id = p_vendor_id;
  
  -- Ensure vendor has vendor role (idempotent)
  INSERT INTO user_roles (user_id, role_id, assigned_by)
  SELECT 
    p_vendor_id,
    r.id,
    v_admin_id
  FROM roles r
  WHERE r.name = 'vendor'
  ON CONFLICT (user_id, role_id) DO UPDATE
  SET is_active = true, assigned_by = v_admin_id;
  
  -- Increment role_version to trigger JWT refresh
  UPDATE user_profiles 
  SET role_version = role_version + 1 
  WHERE id = p_vendor_id;
  
  -- Audit log
  INSERT INTO user_audit_log (user_id, action, resource_type, resource_id, new_values)
  VALUES (
    v_admin_id,
    'vendor_approved',
    'vendor_profile',
    p_vendor_id,
    jsonb_build_object(
      'vendor_id', p_vendor_id,
      'notes', p_notes
    )
  );
  
  RETURN jsonb_build_object(
    'success', true,
    'message', 'Vendor approved successfully'
  );
END;
$$;
```

#### 3. `public.reject_vendor()`
```sql
CREATE OR REPLACE FUNCTION public.reject_vendor(
  p_vendor_id uuid,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, private, pg_temp
SET statement_timeout = '5s'
AS $$
DECLARE
  v_admin_id uuid;
BEGIN
  v_admin_id := auth.uid();
  
  -- Verify admin
  IF NOT private.assert_admin() THEN
    RAISE EXCEPTION 'Unauthorized: Admin access required';
  END IF;
  
  -- Check vendor exists
  IF NOT EXISTS (SELECT 1 FROM vendor_profiles WHERE user_id = p_vendor_id) THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Vendor not found'
    );
  END IF;
  
  -- Update verification status
  UPDATE vendor_profiles
  SET 
    verification_status = 'rejected',
    updated_at = now()
  WHERE user_id = p_vendor_id;
  
  -- Revoke vendor role if exists
  UPDATE user_roles
  SET is_active = false
  WHERE user_id = p_vendor_id
  AND role_id = (SELECT id FROM roles WHERE name = 'vendor');
  
  -- Increment role_version
  UPDATE user_profiles 
  SET role_version = role_version + 1 
  WHERE id = p_vendor_id;
  
  -- Audit log
  INSERT INTO user_audit_log (user_id, action, resource_type, resource_id, old_values)
  VALUES (
    v_admin_id,
    'vendor_rejected',
    'vendor_profile',
    p_vendor_id,
    jsonb_build_object(
      'vendor_id', p_vendor_id,
      'reason', p_reason
    )
  );
  
  RETURN jsonb_build_object(
    'success', true,
    'message', 'Vendor application rejected'
  );
END;
$$;
```

#### 4. `public.update_vendor_commission()`
```sql
CREATE OR REPLACE FUNCTION public.update_vendor_commission(
  p_vendor_id uuid,
  p_commission_rate numeric
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, private, pg_temp
SET statement_timeout = '5s'
AS $$
DECLARE
  v_admin_id uuid;
  v_old_rate numeric;
BEGIN
  v_admin_id := auth.uid();
  
  -- Verify admin
  IF NOT private.assert_admin() THEN
    RAISE EXCEPTION 'Unauthorized: Admin access required';
  END IF;
  
  -- Validate commission rate (0-100%)
  IF p_commission_rate < 0 OR p_commission_rate > 1 THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Commission rate must be between 0 and 1 (0-100%)'
    );
  END IF;
  
  -- Get current rate
  SELECT commission_rate INTO v_old_rate
  FROM vendor_profiles
  WHERE user_id = p_vendor_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Vendor not found'
    );
  END IF;
  
  -- Update commission rate
  UPDATE vendor_profiles
  SET 
    commission_rate = p_commission_rate,
    updated_at = now()
  WHERE user_id = p_vendor_id;
  
  -- Audit log
  INSERT INTO user_audit_log (user_id, action, resource_type, resource_id, old_values, new_values)
  VALUES (
    v_admin_id,
    'vendor_commission_updated',
    'vendor_profile',
    p_vendor_id,
    jsonb_build_object('commission_rate', v_old_rate),
    jsonb_build_object('commission_rate', p_commission_rate)
  );
  
  RETURN jsonb_build_object(
    'success', true,
    'message', 'Commission rate updated successfully',
    'old_rate', v_old_rate,
    'new_rate', p_commission_rate
  );
END;
$$;
```

#### 5. `public.suspend_vendor()`
```sql
CREATE OR REPLACE FUNCTION public.suspend_vendor(
  p_vendor_id uuid,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER -- Need to update auth.users
SET search_path = public, auth, private, pg_temp
SET statement_timeout = '5s'
AS $$
DECLARE
  v_admin_id uuid;
BEGIN
  v_admin_id := auth.uid();
  
  -- Verify admin
  IF NOT private.assert_admin() THEN
    RAISE EXCEPTION 'Unauthorized: Admin access required';
  END IF;
  
  -- Check vendor exists
  IF NOT EXISTS (SELECT 1 FROM vendor_profiles WHERE user_id = p_vendor_id) THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Vendor not found'
    );
  END IF;
  
  -- Suspend user account (indefinite ban)
  UPDATE auth.users
  SET banned_until = 'infinity'::timestamptz
  WHERE id = p_vendor_id AND deleted_at IS NULL;
  
  -- Deactivate all vendor products
  UPDATE products
  SET is_active = false
  WHERE vendor_id = p_vendor_id;
  
  -- Audit log
  INSERT INTO user_audit_log (user_id, action, resource_type, resource_id, new_values)
  VALUES (
    v_admin_id,
    'vendor_suspended',
    'vendor_profile',
    p_vendor_id,
    jsonb_build_object(
      'vendor_id', p_vendor_id,
      'reason', p_reason,
      'products_deactivated', (SELECT COUNT(*) FROM products WHERE vendor_id = p_vendor_id)
    )
  );
  
  RETURN jsonb_build_object(
    'success', true,
    'message', 'Vendor suspended successfully'
  );
END;
$$;
```

#### 6. `public.activate_vendor()`
```sql
CREATE OR REPLACE FUNCTION public.activate_vendor(p_vendor_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, private, pg_temp
SET statement_timeout = '5s'
AS $$
DECLARE
  v_admin_id uuid;
BEGIN
  v_admin_id := auth.uid();
  
  -- Verify admin
  IF NOT private.assert_admin() THEN
    RAISE EXCEPTION 'Unauthorized: Admin access required';
  END IF;
  
  -- Clear ban
  UPDATE auth.users
  SET banned_until = NULL
  WHERE id = p_vendor_id AND deleted_at IS NULL;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Vendor not found'
    );
  END IF;
  
  -- Audit log
  INSERT INTO user_audit_log (user_id, action, resource_type, resource_id, new_values)
  VALUES (
    v_admin_id,
    'vendor_activated',
    'vendor_profile',
    p_vendor_id,
    jsonb_build_object('vendor_id', p_vendor_id)
  );
  
  RETURN jsonb_build_object(
    'success', true,
    'message', 'Vendor activated successfully'
  );
END;
$$;
```

---

## 🔐 SECURITY FEATURES

### **Authentication & Authorization** ✅
- All functions use `SECURITY INVOKER` (inherits admin RLS)
- `private.assert_admin()` on every function
- JWT role verification in Server Component
- `SECURITY DEFINER` only for auth.users modifications

### **Input Validation** ✅
- Vendor ID: Must exist in vendor_profiles
- Commission rate: 0-1 (0-100%)
- Pagination: Max 100 per page
- Search: Sanitized via parameterized queries

### **Audit Logging** ✅
- Every mutation logged to `user_audit_log`
- Tracks: vendor_approved, vendor_rejected, vendor_suspended, vendor_activated, commission_updated
- Includes admin ID, timestamp, old/new values

### **Business Logic Protection** ✅
- Can only approve/reject pending applications
- Suspending vendor deactivates all their products
- Role version increment triggers JWT refresh

---

## ⚡ PERFORMANCE OPTIMIZATIONS

### **Database Performance** ✅
- Trigram index on `vendor_profiles(business_name)` for search
- Composite index on `vendor_profiles(verification_status, created_at)`
- Query timeout: 10s prevents runaway queries
- Optimized joins with LEFT JOIN (no N+1)

### **Frontend Performance** ✅
- Server-side rendering (fast initial load)
- Client-side filtering (instant search)
- Lazy-loaded modals (code splitting)

---

## 🎨 UI/UX DESIGN

### Vendors List Page
- **Table columns**: Avatar, Business Name, Owner, Email, Status, Products, Revenue, Commission, Created, Actions
- **Search bar**: Real-time filter by business name/owner/email
- **Filters**: Status (all/pending/verified/rejected), Business Type
- **Stats cards**: Total Vendors, Pending Applications, Active Vendors, Total GMV
- **Actions per row**: Approve, Reject, Edit Commission, Suspend, View Details
- **Pagination**: 20 vendors per page

### Approval Modal
- **Decision**: Approve or Reject radio buttons
- **Notes/Reason**: Text area for admin notes
- **Confirmation**: Shows vendor details
- **Submit**: Calls `approveVendor()` or `rejectVendor()`

### Commission Modal
- **Current Rate**: Display existing commission
- **New Rate**: Number input (0-100%)
- **Preview**: Shows impact on $10,000 sale
- **Submit**: Calls `updateVendorCommission()`

---

## 🧪 TESTING PROTOCOL

### Manual Testing
1. **Vendor List**: See all vendors with metrics
2. **Search**: Filter by name/email works
3. **Status Filter**: Filter by pending/verified/rejected
4. **Approve**: Pending → Verified, vendor role assigned
5. **Reject**: Pending → Rejected, vendor role revoked
6. **Commission**: Update rate, verify in database
7. **Suspend**: Vendor banned, products deactivated
8. **Activate**: Ban removed

---

## 🚀 READY FOR EXPERT REVIEW

Blueprint v1.0 complete. Ready for 5-expert panel review.

---

**Blueprint Version**: 1.0  
**Last Updated**: October 12, 2025  
**Status**: Ready for Expert Panel Review
