# 🎯 KB STYLISH GOVERNANCE ENGINE - TACTICAL ACTION PLAN

**Current Date**: October 10, 2025  
**Current Status**: Phase 1 Complete ✅ | Phase 2 Urgent ⚠️  
**Next Milestone**: Public Beta (6-8 weeks)

---

## 🚨 WEEK 1: CRITICAL - FIX METRICS PIPELINE

**Goal**: Make dashboards show live data  
**Duration**: 5 days  
**Priority**: 🔴 **CRITICAL - BLOCKING EVERYTHING ELSE**

### Day 1-2: Connect Metrics Worker to Order Pipeline

**File**: `supabase/functions/order-worker/index.ts`

```typescript
// After order processing succeeds, enqueue metrics update
await serviceClient
  .from('job_queue')
  .insert({
    job_type: 'update_metrics',
    payload: {
      order_id: order.id,
      vendor_id: vendorId,
      action: 'order_confirmed',
      amount_cents: order.total_amount,
      platform_fee_cents: order.platform_fee
    },
    status: 'pending'
  });
```

**File**: `supabase/functions/metrics-worker/index.ts`

Add handlers for:
- `order_confirmed` → Increment vendor_daily and platform_daily
- `order_refunded` → Decrement metrics, add to refunds_cents
- `payout_processed` → Update payouts_cents, pending_payout_cents

**Testing**:
```bash
# Place a test order
curl -X POST http://localhost:3000/api/checkout \
  -H "Authorization: Bearer $JWT" \
  -d '{"items": [...]}'

# Verify metrics updated
psql -c "SELECT * FROM metrics.platform_daily WHERE day = CURRENT_DATE;"
psql -c "SELECT * FROM metrics.vendor_realtime_cache WHERE cache_date = CURRENT_DATE;"
```

**Success Criteria**:
- [ ] Test order placed → metrics update within 60 seconds
- [ ] Dashboard refreshed → shows new order
- [ ] Idempotent: processing same job twice doesn't double-count

---

### Day 3: Complete Vendor Backfill

**Missing Vendors**: 2 out of 4 vendors have no historical data

**Task**: Run backfill script for all vendors

**File**: Create `supabase/scripts/backfill_missing_vendors.sql`

```sql
-- Backfill vendor_daily for all vendors
INSERT INTO metrics.vendor_daily (vendor_id, day, orders, gmv_cents, refunds_cents, platform_fees_cents, payouts_cents, pending_payout_cents)
SELECT 
  oi.vendor_id,
  DATE(o.created_at) as day,
  COUNT(DISTINCT o.id) as orders,
  SUM(oi.total_price_cents) as gmv_cents,
  0 as refunds_cents,
  SUM(oi.total_price_cents * 0.15) as platform_fees_cents,
  0 as payouts_cents,
  SUM(oi.total_price_cents * 0.85) as pending_payout_cents
FROM orders o
JOIN order_items oi ON oi.order_id = o.id
WHERE o.status = 'completed'
  AND o.created_at >= CURRENT_DATE - INTERVAL '90 days'
GROUP BY oi.vendor_id, DATE(o.created_at)
ON CONFLICT (vendor_id, day) 
DO UPDATE SET
  orders = EXCLUDED.orders,
  gmv_cents = EXCLUDED.gmv_cents,
  pending_payout_cents = EXCLUDED.pending_payout_cents,
  updated_at = NOW();
```

**Execute**:
```bash
supabase db execute -f supabase/scripts/backfill_missing_vendors.sql
```

**Verify**:
```sql
SELECT vendor_id, COUNT(*) as days_with_data
FROM metrics.vendor_daily
GROUP BY vendor_id
ORDER BY vendor_id;
-- Should show all 4 vendors
```

**Success Criteria**:
- [ ] All 4 vendors appear in vendor_daily
- [ ] Each vendor sees correct historical data
- [ ] No gaps in date ranges

---

### Day 4: Real-Time Cache Updates

**Problem**: `vendor_realtime_cache` shows 0 orders today for all vendors

**Task**: Update cache on every order

**File**: `supabase/functions/metrics-worker/index.ts`

```typescript
// After updating vendor_daily, also update realtime cache
await serviceClient.rpc('upsert_vendor_realtime_cache', {
  p_vendor_id: vendorId,
  p_orders_delta: 1,
  p_gmv_delta: amountCents,
  p_fees_delta: platformFeeCents
});
```

**Database Function**: `supabase/migrations/[timestamp]_vendor_realtime_cache_upsert.sql`

```sql
CREATE OR REPLACE FUNCTION public.upsert_vendor_realtime_cache(
  p_vendor_id uuid,
  p_orders_delta int,
  p_gmv_delta bigint,
  p_fees_delta bigint
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, metrics, pg_temp
AS $$
BEGIN
  INSERT INTO metrics.vendor_realtime_cache (
    vendor_id, 
    cache_date, 
    orders, 
    gmv_cents, 
    platform_fees_cents,
    updated_at
  )
  VALUES (
    p_vendor_id,
    CURRENT_DATE,
    p_orders_delta,
    p_gmv_delta,
    p_fees_delta,
    NOW()
  )
  ON CONFLICT (vendor_id, cache_date) 
  DO UPDATE SET
    orders = vendor_realtime_cache.orders + EXCLUDED.orders,
    gmv_cents = vendor_realtime_cache.gmv_cents + EXCLUDED.gmv_cents,
    platform_fees_cents = vendor_realtime_cache.platform_fees_cents + EXCLUDED.platform_fees_cents,
    updated_at = NOW();
END;
$$;

GRANT EXECUTE ON FUNCTION public.upsert_vendor_realtime_cache TO service_role;
```

**Success Criteria**:
- [ ] Place test order → realtime cache shows +1 order
- [ ] Dashboard refresh → today's stats non-zero
- [ ] Concurrent orders → no race conditions

---

### Day 5: Reconciliation Job

**Problem**: Late-arriving events or failures can cause drift

**Task**: Create nightly reconciliation job

**File**: `supabase/migrations/[timestamp]_add_reconciliation_cron.sql`

```sql
-- Reconciliation function
CREATE OR REPLACE FUNCTION private.reconcile_metrics()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = private, public, metrics, pg_temp
AS $$
BEGIN
  -- Re-derive last 48 hours from source data
  INSERT INTO metrics.vendor_daily (vendor_id, day, orders, gmv_cents, refunds_cents, platform_fees_cents, payouts_cents, pending_payout_cents)
  SELECT 
    oi.vendor_id,
    DATE(o.created_at) as day,
    COUNT(DISTINCT o.id) as orders,
    SUM(oi.total_price_cents) as gmv_cents,
    SUM(CASE WHEN o.status = 'refunded' THEN oi.total_price_cents ELSE 0 END) as refunds_cents,
    SUM(oi.total_price_cents * 0.15) as platform_fees_cents,
    0 as payouts_cents,
    SUM(CASE WHEN o.status = 'completed' THEN oi.total_price_cents * 0.85 ELSE 0 END) as pending_payout_cents
  FROM orders o
  JOIN order_items oi ON oi.order_id = o.id
  WHERE o.created_at >= CURRENT_DATE - INTERVAL '2 days'
  GROUP BY oi.vendor_id, DATE(o.created_at)
  ON CONFLICT (vendor_id, day)
  DO UPDATE SET
    orders = EXCLUDED.orders,
    gmv_cents = EXCLUDED.gmv_cents,
    refunds_cents = EXCLUDED.refunds_cents,
    platform_fees_cents = EXCLUDED.platform_fees_cents,
    pending_payout_cents = EXCLUDED.pending_payout_cents,
    updated_at = NOW();

  -- Same for platform_daily
  INSERT INTO metrics.platform_daily (day, orders, gmv_cents, refunds_cents, platform_fees_cents, payouts_cents, pending_payout_cents)
  SELECT 
    DATE(o.created_at) as day,
    COUNT(DISTINCT o.id) as orders,
    SUM(o.total_amount) as gmv_cents,
    SUM(CASE WHEN o.status = 'refunded' THEN o.total_amount ELSE 0 END) as refunds_cents,
    SUM(o.platform_fee) as platform_fees_cents,
    0 as payouts_cents,
    SUM(CASE WHEN o.status = 'completed' THEN o.total_amount - o.platform_fee ELSE 0 END) as pending_payout_cents
  FROM orders o
  WHERE o.created_at >= CURRENT_DATE - INTERVAL '2 days'
  GROUP BY DATE(o.created_at)
  ON CONFLICT (day)
  DO UPDATE SET
    orders = EXCLUDED.orders,
    gmv_cents = EXCLUDED.gmv_cents,
    refunds_cents = EXCLUDED.refunds_cents,
    platform_fees_cents = EXCLUDED.platform_fees_cents,
    pending_payout_cents = EXCLUDED.pending_payout_cents,
    updated_at = NOW();
END;
$$;

-- Schedule nightly at 2 AM
SELECT cron.schedule(
  'reconcile-metrics',
  '0 2 * * *',  -- Every day at 2 AM
  'SELECT private.reconcile_metrics();'
);
```

**Testing**:
```sql
-- Manually trigger reconciliation
SELECT private.reconcile_metrics();

-- Check for drift
SELECT 
  'vendor_daily' as table_name,
  SUM(orders) as total_orders,
  SUM(gmv_cents) as total_gmv
FROM metrics.vendor_daily
WHERE day >= CURRENT_DATE - INTERVAL '30 days'

UNION ALL

SELECT 
  'source_orders',
  COUNT(DISTINCT o.id),
  SUM(o.total_amount)
FROM orders o
WHERE o.created_at >= CURRENT_DATE - INTERVAL '30 days'
  AND o.status = 'completed';
-- Both rows should match
```

**Success Criteria**:
- [ ] Reconciliation runs nightly without errors
- [ ] Drift between metrics and source < 1%
- [ ] Alert fires if drift > 1% (to be added in Phase 5)

---

## 📅 WEEKS 2-7: BUILD CORE MANAGEMENT PAGES

**Goal**: Enable CRUD operations for users, vendors, and products  
**Duration**: 6 weeks  
**Priority**: 🟡 **HIGH - BLOCKS PUBLIC BETA**

### Week 2: Users Management

**Pages to Build**:
1. `/admin/users` - List all users
2. `/admin/users/[id]` - User details page

**Features**:
- List users with filters (role, status, signup date)
- Search by name/email
- Suspend/activate accounts
- Edit user roles
- View order history

**API Endpoints**:
```typescript
// src/app/api/admin/users/route.ts
export async function GET(request: Request) {
  // Fetch paginated users with filters
}

export async function PATCH(request: Request) {
  // Update user status/roles
}
```

**Database Functions**:
```sql
CREATE FUNCTION private.get_admin_users_list(
  p_page int DEFAULT 1,
  p_per_page int DEFAULT 50,
  p_role text DEFAULT NULL,
  p_status text DEFAULT NULL,
  p_search text DEFAULT NULL
)
RETURNS jsonb;

CREATE FUNCTION private.update_user_status(
  p_user_id uuid,
  p_status text,
  p_reason text DEFAULT NULL
)
RETURNS jsonb;
```

**Timeline**: 5 days

---

### Week 3: Vendors Management

**Pages to Build**:
1. `/admin/vendors` - List all vendors
2. `/admin/vendors/[id]` - Vendor details page

**Features**:
- List vendors with approval status
- Approve/reject vendor applications
- View vendor metrics, products, orders
- Suspend vendors with reason
- View business documents

**API Endpoints**:
```typescript
// src/app/api/admin/vendors/route.ts
export async function GET(request: Request) {
  // Fetch vendors with metrics
}

export async function PATCH(request: Request) {
  // Approve/reject/suspend vendor
}
```

**Database Functions**:
```sql
CREATE FUNCTION private.get_admin_vendors_list(
  p_page int DEFAULT 1,
  p_per_page int DEFAULT 50,
  p_status text DEFAULT NULL
)
RETURNS jsonb;

CREATE FUNCTION private.update_vendor_status(
  p_vendor_id uuid,
  p_status text,
  p_reason text DEFAULT NULL
)
RETURNS jsonb;
```

**Timeline**: 5 days

---

### Weeks 4-5: Products Management (Vendor)

**Pages to Build**:
1. `/vendor/products` - List products
2. `/vendor/products/new` - Create product
3. `/vendor/products/[id]/edit` - Edit product

**Features**:
- List all vendor's products
- Create new product with images
- Edit product details
- Manage variants (size, color)
- Set inventory levels
- Toggle active/inactive

**API Endpoints**:
```typescript
// src/app/api/vendor/products/route.ts
export async function GET(request: Request) {
  // List vendor's products
}

export async function POST(request: Request) {
  // Create new product
}

export async function PATCH(request: Request) {
  // Update product
}
```

**Image Upload**:
```typescript
// Use Supabase Storage
const { data, error } = await supabase.storage
  .from('product-images')
  .upload(`${vendorId}/${productId}/${fileName}`, file);
```

**Timeline**: 10 days

---

### Week 6: Orders Management (Vendor)

**Pages to Build**:
1. `/vendor/orders` - List orders
2. `/vendor/orders/[id]` - Order details

**Features**:
- List orders (pending, processing, completed)
- Filter by status, date range
- View order details, customer info
- Mark as shipped, add tracking
- Download packing slips

**API Endpoints**:
```typescript
// src/app/api/vendor/orders/route.ts
export async function GET(request: Request) {
  // List vendor's orders
}

export async function PATCH(request: Request) {
  // Update order status
}
```

**Database Functions**:
```sql
CREATE FUNCTION public.get_vendor_orders_list(
  p_vendor_id uuid,
  p_page int DEFAULT 1,
  p_status text DEFAULT NULL
)
RETURNS jsonb;

CREATE FUNCTION public.update_order_shipping(
  p_order_id uuid,
  p_tracking_number text,
  p_carrier text
)
RETURNS jsonb;
```

**Timeline**: 5 days

---

### Week 7: Orders Management (Admin)

**Pages to Build**:
1. `/admin/orders` - List all orders
2. `/admin/orders/[id]` - Order details

**Features**:
- Search orders by ID, customer, vendor
- View order details, items, payments
- Issue refunds
- Export to CSV
- View order timeline

**API Endpoints**:
```typescript
// src/app/api/admin/orders/route.ts
export async function GET(request: Request) {
  // List all orders with filters
}

export async function POST(request: Request) {
  // Issue refund
}
```

**Database Functions**:
```sql
CREATE FUNCTION private.get_admin_orders_list(
  p_page int DEFAULT 1,
  p_search text DEFAULT NULL
)
RETURNS jsonb;

CREATE FUNCTION private.issue_order_refund(
  p_order_id uuid,
  p_reason text,
  p_amount_cents bigint
)
RETURNS jsonb;
```

**Timeline**: 5 days

---

## 📅 WEEKS 2-3 (PARALLEL): ERROR HANDLING

**Goal**: Improve UX during failures  
**Duration**: 2 weeks  
**Priority**: 🟡 **MEDIUM - IMPROVES UX**

### Week 2: Retry Mechanisms

**File**: `src/lib/apiClient.ts`

```typescript
async function fetchWithRetry(
  url: string, 
  options: RequestInit, 
  maxRetries = 3
): Promise<Response> {
  let lastError: Error;
  
  for (let i = 0; i < maxRetries; i++) {
    try {
      const response = await fetch(url, options);
      if (response.ok) return response;
      
      // Retry on 5xx errors
      if (response.status >= 500 && response.status < 600) {
        throw new Error(`Server error: ${response.status}`);
      }
      
      // Don't retry on 4xx errors
      return response;
      
    } catch (error) {
      lastError = error as Error;
      if (i < maxRetries - 1) {
        // Exponential backoff: 1s, 2s, 4s
        await new Promise(resolve => 
          setTimeout(resolve, 1000 * Math.pow(2, i))
        );
      }
    }
  }
  
  throw lastError!;
}
```

**Usage**:
```typescript
export async function fetchAdminDashboardStats(token: string) {
  const response = await fetchWithRetry(
    `${EDGE_FUNCTION_URL}/admin-dashboard`,
    {
      headers: { Authorization: `Bearer ${token}` }
    }
  );
  // ...
}
```

---

### Week 3: Enhanced Error States

**File**: `src/components/admin/AdminDashboard.tsx`

```typescript
interface DashboardError {
  type: 'network' | 'auth' | 'data' | 'unknown';
  message: string;
  retryable: boolean;
}

function ErrorState({ error, onRetry }: { 
  error: DashboardError; 
  onRetry: () => void;
}) {
  const errorMessages = {
    network: "Unable to connect to the server. Check your internet connection.",
    auth: "Your session has expired. Please log in again.",
    data: "Dashboard data is temporarily unavailable.",
    unknown: "Something went wrong. Please try again."
  };
  
  return (
    <div className="rounded-2xl border border-red-500/20 bg-red-500/10 p-6">
      <h2 className="text-lg font-semibold text-red-500">
        {error.type === 'auth' ? 'Session Expired' : 'Failed to Load Dashboard'}
      </h2>
      <p className="mt-2 text-sm text-red-400">
        {errorMessages[error.type]}
      </p>
      {error.retryable && (
        <button
          onClick={onRetry}
          className="mt-4 rounded-lg bg-red-500 px-4 py-2 text-white hover:bg-red-600"
        >
          Try Again
        </button>
      )}
      {error.type === 'auth' && (
        <Link href="/auth/login" className="mt-4 text-red-400 underline">
          Go to Login
        </Link>
      )}
    </div>
  );
}
```

---

## 📊 PHASE 2 SUCCESS METRICS

### Week 1 (Metrics Pipeline)
- [ ] Test order placed → dashboard updates < 60s
- [ ] All 4 vendors see correct historical data
- [ ] Today's stats show non-zero orders
- [ ] Reconciliation job runs nightly without errors

### Weeks 2-7 (Management Pages)
- [ ] Admin can suspend a user account
- [ ] Admin can approve vendor application
- [ ] Vendor can add a new product with images
- [ ] Vendor can mark order as shipped
- [ ] Admin can search orders by ID

### Weeks 2-3 (Error Handling)
- [ ] Network failure → auto-retry → success
- [ ] Clear error messages for different failure types
- [ ] Retry button works on dashboard errors

---

## 🚀 DEPLOYMENT CHECKLIST

### Before Each Deployment
- [ ] Run database migrations locally
- [ ] Test migrations on staging database
- [ ] Verify no breaking changes
- [ ] Update changelog

### Deployment Steps
1. **Database Migrations**
   ```bash
   supabase db push
   ```

2. **Edge Functions**
   ```bash
   supabase functions deploy metrics-worker
   supabase functions deploy order-worker
   ```

3. **Frontend**
   ```bash
   npm run build
   npm run start  # Test locally
   git push origin main  # Vercel auto-deploys
   ```

4. **Verification**
   ```bash
   # Health checks
   curl https://your-domain.com/api/health/metrics
   curl https://your-domain.com/api/health/functions
   ```

### Post-Deployment
- [ ] Smoke test dashboards
- [ ] Place test order, verify metrics update
- [ ] Check error logs for any issues
- [ ] Monitor function latency for 1 hour

---

## 📞 ESCALATION & SUPPORT

### If Metrics Pipeline Breaks
1. Check `metrics-worker` logs in Supabase dashboard
2. Verify `job_queue` table has pending jobs
3. Check database connection pool
4. Fallback: Run manual reconciliation
   ```sql
   SELECT private.reconcile_metrics();
   ```

### If Dashboard Shows Wrong Data
1. Compare metrics tables with source data
2. Check for missing backfill
3. Verify RLS policies not blocking data
4. Run reconciliation to fix drift

### If Edge Functions Timeout
1. Check function logs for errors
2. Verify database queries use indices
3. Check for connection pool exhaustion
4. Increase function timeout if needed

---

## 📈 NEXT REVIEW CHECKPOINT

**Date**: October 17, 2025  
**Expected State**:
- ✅ Metrics pipeline working
- ✅ All vendors see correct data
- ✅ Dashboards show live data

**Review Questions**:
1. Are metrics updating in real-time?
2. Is reconciliation job running successfully?
3. Are there any new errors or issues?
4. Ready to start building management pages?

---

**Action Plan Generated**: October 10, 2025, 6:30 PM NPT  
**Owner**: Development Team  
**Next Update**: Weekly (every Friday)
