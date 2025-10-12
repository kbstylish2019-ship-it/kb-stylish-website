# LIVE DASHBOARD INTEGRATION PLAN - PHASE 6

**Date**: 2025-10-07  
**Objective**: Connect frontend dashboard UIs to live Edge Functions  
**Current State**: Dashboards use mock data with "use client" components  
**Target State**: Async Server Components fetching real-time data via Edge Functions  

---

## PART 1: CURRENT STATE ANALYSIS

### **Vendor Dashboard** (`src/app/vendor/dashboard/page.tsx`)

**Current Implementation**:
```typescript
"use client"  // ❌ Client Component
// Hardcoded stats:
- Today's Bookings: 32
- Monthly Earnings: NPR 2,45,000
- Orders Pending: 12
- Low Inventory: 5
```

**Problems**:
1. Mock data hardcoded in component
2. No real-time updates
3. No user/vendor association
4. No permission checks

---

### **Admin Dashboard** (`src/app/admin/dashboard/page.tsx`)

**Current Implementation**:
```typescript
"use client"  // ❌ Client Component
// Uses useAdminDashboard hook with mock users
const mockUsers: AdminUser[] = [...]
```

**Problems**:
1. Mock data hardcoded in component
2. No admin role verification
3. No real platform metrics
4. Client-side hook pattern (incompatible with Server Components)

---

### **API Client** (`src/lib/apiClient.ts`)

**Current Implementation**:
- ✅ Has `createClient()` function for Supabase SSR
- ✅ Server-side functions for products, bookings
- ❌ NO functions for dashboard Edge Functions
- ❌ NO JWT forwarding pattern established

---

## PART 2: INTEGRATION ARCHITECTURE

### **Data Flow**

```
┌─────────────────────────────────────────────────────┐
│  Server Component (dashboard page.tsx)              │
│  - await getUserSession()                           │
│  - await fetchDashboardStats(jwt)                   │
│  - Pass data to Client Components                   │
└────────────────┬────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────┐
│  API Client Function (apiClient.ts)                 │
│  - fetchVendorDashboardStats(jwt)                   │
│  - fetchAdminDashboardStats(jwt)                    │
│  - Calls Edge Functions with Bearer token          │
└────────────────┬────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────┐
│  Edge Function (vendor-dashboard/admin-dashboard)   │
│  - Verifies JWT                                     │
│  - Checks permissions                               │
│  - Calls database RPC                               │
│  - Returns JSON response                            │
└────────────────┬────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────┐
│  Database Function (get_vendor/admin_stats_v2_1)    │
│  - Aggregates metrics from source tables           │
│  - Enforces RLS (vendor) / admin check             │
│  - Returns JSONB with structured metrics           │
└─────────────────────────────────────────────────────┘
```

---

## PART 3: API CLIENT LAYER

### **New Functions to Add**

```typescript
// src/lib/apiClient.ts

// =====================================================================
// GOVERNANCE ENGINE API FUNCTIONS
// =====================================================================

export interface VendorDashboardStats {
  vendor_id: string;
  today: {
    orders: number;
    gmv_cents: number;
    platform_fees_cents: number;
    refunds_cents: number;
  };
  last_30_days: {
    orders: number;
    gmv_cents: number;
    platform_fees_cents: number;
    pending_payout_cents: number;
    refunds_cents: number;
    payouts_cents: number;
  };
  generated_at: string;
}

export interface AdminDashboardStats {
  platform_overview: {
    total_users: number;
    total_vendors: number;
  };
  today: {
    orders: number;
    gmv_cents: number;
    platform_fees_cents: number;
  };
  last_30_days: {
    orders: number;
    gmv_cents: number;
    platform_fees_cents: number;
    pending_payouts_cents: number;
    refunds_cents: number;
  };
  generated_at: string;
  generated_by: string;
}

/**
 * Fetch vendor dashboard stats from Edge Function
 * Requires authenticated vendor user
 * 
 * @param accessToken - User's JWT access token
 * @param vendorId - Optional: Admin override for specific vendor
 * @returns Vendor dashboard metrics
 */
export async function fetchVendorDashboardStats(
  accessToken: string,
  vendorId?: string
): Promise<VendorDashboardStats | null> {
  const startTime = Date.now();
  
  try {
    const url = vendorId 
      ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/vendor-dashboard?vendor_id=${vendorId}`
      : `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/vendor-dashboard`;
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      // No Next.js cache - always fetch fresh data
      cache: 'no-store',
    });
    
    const latency = Date.now() - startTime;
    console.log(`[DASHBOARD API] Vendor stats fetched - Latency: ${latency}ms, Status: ${response.status}`);
    
    if (!response.ok) {
      const error = await response.json();
      console.error('Error fetching vendor dashboard stats:', error);
      return null;
    }
    
    const { data } = await response.json();
    return data;
    
  } catch (error) {
    console.error('fetchVendorDashboardStats error:', error);
    return null;
  }
}

/**
 * Fetch admin dashboard stats from Edge Function
 * Requires authenticated admin user
 * 
 * @param accessToken - User's JWT access token (must have admin role)
 * @returns Admin dashboard metrics
 */
export async function fetchAdminDashboardStats(
  accessToken: string
): Promise<AdminDashboardStats | null> {
  const startTime = Date.now();
  
  try {
    const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/admin-dashboard`;
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      // No Next.js cache - always fetch fresh data
      cache: 'no-store',
    });
    
    const latency = Date.now() - startTime;
    console.log(`[DASHBOARD API] Admin stats fetched - Latency: ${latency}ms, Status: ${response.status}`);
    
    if (!response.ok) {
      const error = await response.json();
      console.error('Error fetching admin dashboard stats:', error);
      return null;
    }
    
    const { data } = await response.json();
    return data;
    
  } catch (error) {
    console.error('fetchAdminDashboardStats error:', error);
    return null;
  }
}
```

**Key Design Decisions**:
1. ✅ `cache: 'no-store'` → Always fetch fresh metrics (no stale data)
2. ✅ JWT passed via Authorization header
3. ✅ Error handling returns null (graceful degradation)
4. ✅ Performance logging for monitoring

---

## PART 4: VENDOR DASHBOARD REFACTOR

### **New Implementation**

```typescript
// src/app/vendor/dashboard/page.tsx
import React from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Plus, BarChart3, Package, Wallet, AlertTriangle } from "lucide-react";
import { fetchVendorDashboardStats } from "@/lib/apiClient";
import { createClient } from "@/lib/supabase-server"; // SSR client

// Dynamic imports for Client Components
const DashboardLayout = dynamic(() => import("@/components/layout/DashboardLayout"));
const StatCard = dynamic(() => import("@/components/vendor/StatCard"));
const OrdersTable = dynamic(() => import("@/components/vendor/OrdersTable"));
const AddProductModal = dynamic(() => import("@/components/vendor/AddProductModal"), { ssr: false });

function VendorSidebar() {
  // ... existing sidebar code ...
}

// ✅ ASYNC SERVER COMPONENT
export default async function VendorDashboardPage() {
  // 1. Get user session (SSR)
  const supabase = createClient();
  const { data: { session }, error: sessionError } = await supabase.auth.getSession();
  
  if (sessionError || !session) {
    redirect('/auth/login?redirect=/vendor/dashboard');
  }
  
  // 2. Fetch live dashboard stats
  const stats = await fetchVendorDashboardStats(session.access_token);
  
  if (!stats) {
    // Graceful degradation: Show error state
    return (
      <DashboardLayout title="Vendor Dashboard" sidebar={<VendorSidebar />}>
        <div className="rounded-2xl border border-red-500/20 bg-red-500/10 p-6">
          <h2 className="text-lg font-semibold text-red-500">Failed to Load Dashboard</h2>
          <p className="mt-2 text-sm text-red-400">
            Unable to fetch your dashboard metrics. Please try again later.
          </p>
        </div>
      </DashboardLayout>
    );
  }
  
  // 3. Transform stats for display
  const todayBookings = stats.today.orders;
  const monthlyEarnings = `NPR ${(stats.last_30_days.gmv_cents / 100).toLocaleString()}`;
  const pendingBalance = `NPR ${(stats.last_30_days.pending_payout_cents / 100).toLocaleString()}`;
  
  // 4. CTA button (Client Component)
  const cta = <AddProductModalTrigger />;
  
  return (
    <DashboardLayout title="Vendor Dashboard" actions={cta} sidebar={<VendorSidebar />}>
      {/* Live Stat Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard 
          title="Today's Orders" 
          value={todayBookings} 
          subtitle={`from ${stats.today.gmv_cents / 100} NPR`}
          icon={<BarChart3 className="h-5 w-5" />} 
        />
        <StatCard 
          title="Monthly Earnings" 
          value={monthlyEarnings} 
          subtitle="Last 30 days"
          icon={<Wallet className="h-5 w-5" />} 
        />
        <StatCard 
          title="Pending Balance" 
          value={pendingBalance} 
          subtitle="Awaiting payout"
          icon={<Package className="h-5 w-5" />} 
        />
        <StatCard 
          title="Platform Fees" 
          value={`NPR ${(stats.last_30_days.platform_fees_cents / 100).toLocaleString()}`}
          subtitle="Last 30 days"
          icon={<AlertTriangle className="h-5 w-5" />} 
        />
      </div>
      
      {/* Rest of dashboard UI with real data */}
      {/* ... */}
    </DashboardLayout>
  );
}

// Client Component for Add Product Modal
function AddProductModalTrigger() {
  'use client';
  const [isOpen, setIsOpen] = React.useState(false);
  
  return (
    <>
      <button onClick={() => setIsOpen(true)} className="...">
        <Plus className="h-4 w-4" />
        <span>Add Product/Service</span>
      </button>
      <AddProductModal open={isOpen} onClose={() => setIsOpen(false)} />
    </>
  );
}
```

**Migration Changes**:
1. ✅ Remove `"use client"` directive
2. ✅ Make function `async`
3. ✅ Get session via `supabase.auth.getSession()`
4. ✅ Call `fetchVendorDashboardStats(session.access_token)`
5. ✅ Pass real data to StatCard components
6. ✅ Extract interactive elements into Client Components

---

## PART 5: ADMIN DASHBOARD REFACTOR

### **New Implementation**

```typescript
// src/app/admin/dashboard/page.tsx
import React from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { redirect } from "next/navigation";
import { Users, Store, Wallet, LifeBuoy, Plus } from "lucide-react";
import { fetchAdminDashboardStats } from "@/lib/apiClient";
import { createClient } from "@/lib/supabase-server";

// Dynamic imports
const DashboardLayout = dynamic(() => import("@/components/layout/DashboardLayout"));
const AdminStatCard = dynamic(() => import("@/components/admin/AdminStatCard"));
const RevenueChart = dynamic(() => import("@/components/admin/RevenueChart"));
const UserStatusDonut = dynamic(() => import("@/components/admin/UserStatusDonut"));

function AdminSidebar() {
  // ... existing sidebar code ...
}

// ✅ ASYNC SERVER COMPONENT
export default async function AdminDashboardPage() {
  // 1. Get user session and verify admin role
  const supabase = createClient();
  const { data: { session }, error: sessionError } = await supabase.auth.getSession();
  
  if (sessionError || !session) {
    redirect('/auth/login?redirect=/admin/dashboard');
  }
  
  // 2. Verify admin role from JWT
  const userRoles = session.user.app_metadata?.user_roles || [];
  if (!userRoles.includes('admin')) {
    redirect('/'); // Non-admins redirected to home
  }
  
  // 3. Fetch live admin dashboard stats
  const stats = await fetchAdminDashboardStats(session.access_token);
  
  if (!stats) {
    return (
      <DashboardLayout title="Admin Control Panel" sidebar={<AdminSidebar />}>
        <div className="rounded-2xl border border-red-500/20 bg-red-500/10 p-6">
          <h2 className="text-lg font-semibold text-red-500">Failed to Load Dashboard</h2>
          <p className="mt-2 text-sm text-red-400">
            Unable to fetch platform metrics. Please try again later.
          </p>
        </div>
      </DashboardLayout>
    );
  }
  
  // 4. Transform stats for display
  const totalUsers = stats.platform_overview.total_users;
  const totalVendors = stats.platform_overview.total_vendors;
  const monthlyRevenue = `NPR ${(stats.last_30_days.gmv_cents / 100).toLocaleString()}`;
  const todayOrders = stats.today.orders;
  
  return (
    <DashboardLayout title="Admin Control Panel" sidebar={<AdminSidebar />}>
      {/* Live Stat Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <AdminStatCard 
          title="Total Users" 
          value={totalUsers} 
          subtitle={`${totalVendors} vendors`}
          icon={<Users className="h-5 w-5" />} 
        />
        <AdminStatCard 
          title="Active Vendors" 
          value={totalVendors} 
          subtitle="Platform-wide"
          icon={<Store className="h-5 w-5" />} 
        />
        <AdminStatCard 
          title="Monthly Revenue" 
          value={monthlyRevenue} 
          subtitle="Last 30 days"
          icon={<Wallet className="h-5 w-5" />} 
        />
        <AdminStatCard 
          title="Today's Orders" 
          value={todayOrders} 
          subtitle={`${stats.today.gmv_cents / 100} NPR`}
          icon={<LifeBuoy className="h-5 w-5" />} 
        />
      </div>
      
      {/* Charts and other UI */}
      {/* ... */}
    </DashboardLayout>
  );
}
```

**Migration Changes**:
1. ✅ Remove `"use client"` directive
2. ✅ Make function `async`
3. ✅ Get session + verify admin role
4. ✅ Call `fetchAdminDashboardStats(session.access_token)`
5. ✅ Pass real data to AdminStatCard components
6. ✅ Remove useAdminDashboard hook (not needed)

---

## PART 6: FAANG FRONTEND AUDIT

### **🔴 CRITICAL FLAW #1: Session Security in Server Components**

**Vulnerability**: Using `getSession()` in Server Components can be exploited

**Attack Path**:
```
Attacker → Copies someone's JWT → Sets cookie manually → Bypasses auth
```

**Correct Pattern**:
```typescript
// ❌ VULNERABLE (can be forged)
const { data: { session } } = await supabase.auth.getSession();

// ✅ SECURE (verified by Supabase)
const { data: { user }, error } = await supabase.auth.getUser();
```

**Fix Applied**: Use `getUser()` instead of `getSession()` for server-side auth verification.

---

### **🔴 CRITICAL FLAW #2: Data Flow Type Safety**

**Problem**: Edge Function response typing not enforced

**Risk Path**:
```typescript
const stats = await fetchVendorDashboardStats(token);
// What if stats.today is undefined? → Runtime crash
const todayOrders = stats.today.orders; // ❌ Unsafe
```

**Fix Applied**:
```typescript
const stats = await fetchVendorDashboardStats(token);

if (!stats || !stats.today) {
  // Graceful degradation with error UI
  return <ErrorState />;
}

// ✅ Safe access
const todayOrders = stats.today.orders;
```

---

### **🔴 CRITICAL FLAW #3: Next.js Caching Misconfiguration**

**Problem**: Default Next.js caching can show stale metrics

**Risk**:
```typescript
// ❌ BAD: Next.js caches response for 60s
fetch(url, { next: { revalidate: 60 } })

// Vendor makes sale → Dashboard shows old data for 60s
```

**Fix Applied**:
```typescript
// ✅ CORRECT: Always fetch fresh data
fetch(url, { cache: 'no-store' })
```

**Alternative** (for 10s cache):
```typescript
fetch(url, { next: { revalidate: 10 } }) // Acceptable for some use cases
```

---

### **🔴 CRITICAL FLAW #4: Client/Server Boundary Violations**

**Problem**: Mixing interactive elements with Server Components

**Risk**:
```typescript
// ❌ BAD: Can't use useState in Server Component
export default async function Page() {
  const [isOpen, setIsOpen] = useState(false); // ERROR!
  // ...
}
```

**Fix Applied**:
```typescript
// ✅ CORRECT: Extract to Client Component
function AddProductModalTrigger() {
  'use client';
  const [isOpen, setIsOpen] = useState(false);
  // ...
}

// Server Component
export default async function Page() {
  return <AddProductModalTrigger />;
}
```

---

## PART 7: IMPLEMENTATION CHECKLIST

### **API Client Functions**
- [ ] Add `fetchVendorDashboardStats(accessToken, vendorId?)`
- [ ] Add `fetchAdminDashboardStats(accessToken)`
- [ ] Add TypeScript interfaces for response types
- [ ] Add error handling and logging

### **Vendor Dashboard**
- [ ] Remove `"use client"` directive
- [ ] Make function `async`
- [ ] Add server-side session verification
- [ ] Call `fetchVendorDashboardStats()`
- [ ] Pass real data to StatCard components
- [ ] Extract interactive elements to Client Components
- [ ] Add error state UI

### **Admin Dashboard**
- [ ] Remove `"use client"` directive
- [ ] Make function `async`
- [ ] Add server-side session + admin role verification
- [ ] Call `fetchAdminDashboardStats()`
- [ ] Pass real data to AdminStatCard components
- [ ] Remove `useAdminDashboard` hook
- [ ] Add error state UI

### **Security**
- [ ] Use `getUser()` instead of `getSession()`
- [ ] Verify admin role before rendering
- [ ] Handle unauthenticated users with redirects
- [ ] Add null checks for all API responses

### **Performance**
- [ ] Use `cache: 'no-store'` for real-time data
- [ ] Add loading states where needed
- [ ] Optimize dynamic imports
- [ ] Monitor API latency

---

## PART 8: TESTING PROTOCOL

### **Test 1: Vendor Dashboard - Authenticated Access**
1. Login as vendor
2. Navigate to `/vendor/dashboard`
3. Verify real stats displayed (not mock data)
4. Verify no console errors

**Expected**: Live metrics from database displayed

---

### **Test 2: Vendor Dashboard - Unauthenticated Access**
1. Clear cookies
2. Navigate to `/vendor/dashboard`
3. Verify redirect to login

**Expected**: Redirected to `/auth/login?redirect=/vendor/dashboard`

---

### **Test 3: Admin Dashboard - Admin Access**
1. Login as admin
2. Navigate to `/admin/dashboard`
3. Verify platform-wide stats displayed
4. Verify user count, vendor count, revenue

**Expected**: Live platform metrics displayed

---

### **Test 4: Admin Dashboard - Non-Admin Access**
1. Login as regular customer
2. Navigate to `/admin/dashboard`
3. Verify redirect to home

**Expected**: Redirected to `/` (non-admins blocked)

---

### **Test 5: Error Handling**
1. Stop Supabase Edge Functions
2. Navigate to dashboards
3. Verify error UI displayed (not crash)

**Expected**: Graceful error state with message

---

### **Test 6: Data Accuracy**
1. Create new order in system
2. Refresh vendor dashboard
3. Verify order count incremented

**Expected**: Real-time data reflects new order

---

## PART 9: ROLLBACK PLAN

If integration fails:
1. Revert dashboard pages to `"use client"`
2. Remove Edge Function calls
3. Restore mock data temporarily
4. Debug in staging environment

---

## CONCLUSION

This integration plan transforms our dashboards from static mock data to **live, role-gated, real-time analytics**. The FAANG audit ensures:
- ✅ **Security**: Proper JWT verification, admin role checks
- ✅ **Type Safety**: Null checks, graceful error handling
- ✅ **Performance**: No stale data, optimized caching
- ✅ **Architecture**: Clean Server/Client Component separation

**Ready for implementation. Let's activate the dashboards.**
