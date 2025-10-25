import React from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { redirect } from "next/navigation";
import type { AdminUser } from "@/lib/types";
import { Users, Store, Wallet, LifeBuoy, TrendingUp } from "lucide-react";
import { fetchAdminDashboardStats } from "@/lib/apiClient";
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import AdminSidebar from "@/components/admin/AdminSidebar";

// Use real components in test to avoid next/dynamic being mocked to null
const isTest = process.env.NODE_ENV === "test";

let DashboardLayout: React.ComponentType<any>;
let AdminStatCard: React.ComponentType<any>;
let UsersTable: React.ComponentType<any>;
let RevenueChart: React.ComponentType<any>;
let UserStatusDonut: React.ComponentType<any>;

if (isTest) {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const DL = require("@/components/layout/DashboardLayout");
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const ASC = require("@/components/admin/AdminStatCard");
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const UT = require("@/components/admin/UsersTable");
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const RC = require("@/components/admin/RevenueChart");
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const USD = require("@/components/admin/UserStatusDonut");

  DashboardLayout = (DL.default ?? DL) as React.ComponentType<any>;
  AdminStatCard = (ASC.default ?? ASC) as React.ComponentType<any>;
  UsersTable = (UT.default ?? UT) as React.ComponentType<any>;
  RevenueChart = (RC.default ?? RC) as React.ComponentType<any>;
  UserStatusDonut = (USD.default ?? USD) as React.ComponentType<any>;
} else {
  // Dynamic imports for heavy components
  DashboardLayout = dynamic(() => import("@/components/layout/DashboardLayout"));
  AdminStatCard = dynamic(() => import("@/components/admin/AdminStatCard"));
  UsersTable = dynamic(() => import("@/components/admin/UsersTable"), {
    loading: () => <div className="h-96 animate-pulse rounded-lg bg-white/5" />
  });
  RevenueChart = dynamic(() => import("@/components/admin/RevenueChart"), {
    loading: () => <div className="h-64 animate-pulse rounded-lg bg-white/5" />
  });
  UserStatusDonut = dynamic(() => import("@/components/admin/UserStatusDonut"), {
    loading: () => <div className="h-64 animate-pulse rounded-lg bg-white/5" />
  });
}

// Sidebar moved to shared component: @/components/admin/AdminSidebar

const mockUsers: AdminUser[] = [
  { id: "U-1001", name: "Rohan Shrestha", email: "rohan@example.com", role: "customer", status: "Active", createdAt: new Date(Date.now() - 14*86400000).toISOString(), lastActiveAt: new Date().toISOString(), orders: 5 },
  { id: "U-1002", name: "Priya Sharma", email: "priya@example.com", role: "vendor", status: "Suspended", createdAt: new Date(Date.now() - 45*86400000).toISOString(), lastActiveAt: new Date(Date.now() - 2*86400000).toISOString(), orders: 124, revenue: 845000 },
  { id: "U-1003", name: "Admin Sita", email: "sita@example.com", role: "admin", status: "Active", createdAt: new Date(Date.now() - 120*86400000).toISOString(), lastActiveAt: new Date().toISOString() },
  { id: "U-1004", name: "Bikash Tamang", email: "bikash@example.com", role: "customer", status: "Pending", createdAt: new Date(Date.now() - 3*86400000).toISOString() },
  { id: "U-1005", name: "Maya Gurung", email: "maya@example.com", role: "vendor", status: "Active", createdAt: new Date(Date.now() - 90*86400000).toISOString(), lastActiveAt: new Date(Date.now() - 1*86400000).toISOString(), orders: 212, revenue: 2145000 },
  { id: "U-1006", name: "Anish Karki", email: "anish@example.com", role: "customer", status: "Banned", createdAt: new Date(Date.now() - 200*86400000).toISOString() },
  { id: "U-1007", name: "Vendor Ram", email: "ram@shop.io", role: "vendor", status: "Active", createdAt: new Date(Date.now() - 25*86400000).toISOString(), lastActiveAt: new Date(Date.now() - 5*86400000).toISOString(), orders: 78, revenue: 675000 },
];

// Helper to create Supabase server client
async function createClient() {
  const cookieStore = await cookies();
  
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Ignore - Server Component limitation
          }
        },
      },
    }
  );
}

// ✅ CONVERTED TO ASYNC SERVER COMPONENT
export default async function AdminDashboardPage() {
  // 1. Get user session and verify authentication
  const supabase = await createClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  
  if (userError || !user) {
    redirect('/auth/login?redirect=/admin/dashboard');
  }
  
  // 2. Verify admin role from JWT (check both metadata sources for resilience)
  const userRoles = user.user_metadata?.user_roles || user.app_metadata?.user_roles || [];
  if (!userRoles.includes('admin')) {
    redirect('/'); // Non-admins redirected to home
  }
  
  // 3. Fetch live admin dashboard stats
  const { data: { session } } = await supabase.auth.getSession();
  const stats = session ? await fetchAdminDashboardStats(session.access_token) : null;
  
  // 4. Handle error state
  if (!stats) {
    return (
      <DashboardLayout title="Admin Control Panel" sidebar={<AdminSidebar />}>
        <div className="rounded-2xl border border-red-500/20 bg-red-500/10 p-6">
          <h2 className="text-lg font-semibold text-red-500">Failed to Load Dashboard</h2>
          <p className="mt-2 text-sm text-red-400">
            Unable to fetch platform metrics. Please refresh the page or try again later.
          </p>
        </div>
      </DashboardLayout>
    );
  }
  
  // 5. Transform stats for display
  const totalUsers = stats.platform_overview.total_users;
  const totalVendors = stats.platform_overview.total_vendors;
  const monthlyRevenue = (stats.last_30_days.gmv_cents / 100).toLocaleString('en-IN');
  const monthlyRefunds = (stats.last_30_days.refunds_cents / 100).toLocaleString('en-IN');
  const todayOrders = stats.today.orders;
  const todayRevenue = (stats.today.gmv_cents / 100).toLocaleString('en-IN');


  return (
    <DashboardLayout title="Admin Control Panel" sidebar={<AdminSidebar />}> 
      {/* Live Stat Grid */}
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        <AdminStatCard 
          title="Total Users" 
          value={totalUsers} 
          subtitle={`${totalVendors} vendors`}
          trend={{ label: "Live data", direction: "up" }} 
          icon={<Users className="h-5 w-5 text-[var(--kb-primary-brand)]" />} 
        />
        <AdminStatCard 
          title="Active Vendors" 
          value={totalVendors} 
          subtitle="Platform-wide"
          trend={{ label: "Real-time", direction: "up" }} 
          icon={<Store className="h-5 w-5 text-[var(--kb-primary-brand)]" />} 
        />
        <AdminStatCard 
          title="Monthly Revenue" 
          value={`NPR ${monthlyRevenue}`} 
          subtitle="Last 30 days"
          trend={{ label: "GMV", direction: "up" }} 
          icon={<Wallet className="h-5 w-5 text-[var(--kb-primary-brand)]" />} 
        />
        <AdminStatCard 
          title="Today's Orders" 
          value={todayOrders} 
          subtitle={`NPR ${todayRevenue}`}
          trend={{ label: "Today", direction: "up" }} 
          icon={<TrendingUp className="h-5 w-5 text-[var(--kb-primary-brand)]" />} 
        />
      </div>

      {/* Platform Metrics Summary */}
      <div className="mt-6 grid gap-4 grid-cols-1 lg:grid-cols-3">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4 ring-1 ring-white/10 lg:col-span-2">
          <h2 className="text-lg font-semibold mb-3">Platform Overview (30 Days)</h2>
          <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
            <AdminStatCard
              title="Total GMV"
              value={`NPR ${monthlyRevenue}`}
              subtitle="Gross merchandise value"
            />
            <AdminStatCard
              title="Platform Fees"
              value={`NPR ${(stats.last_30_days.platform_fees_cents / 100).toLocaleString('en-IN')}`}
              subtitle="Blended commission"
            />
            <AdminStatCard
              title="Refunds"
              value={`NPR ${monthlyRefunds}`}
              subtitle="Cancelled orders"
            />
            <AdminStatCard
              title="Total Orders"
              value={stats.last_30_days.orders}
              subtitle="Completed"
            />
          </div>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4 ring-1 ring-white/10">
          <h2 className="text-lg font-semibold">Today's Activity</h2>
          <div className="mt-3 space-y-3 text-sm">
            <div>
              <div className="text-foreground/60">Orders</div>
              <div className="text-2xl font-bold">{todayOrders}</div>
            </div>
            <div>
              <div className="text-foreground/60">Revenue</div>
              <div className="text-xl font-semibold">NPR {todayRevenue}</div>
            </div>
            <div className="text-xs text-foreground/50">
              Last updated: {new Date(stats.generated_at).toLocaleTimeString()}
            </div>
          </div>
        </div>
      </div>

      {/* Users Management - Removed for now, can be re-added as Client Component */}
      <div className="mt-8">
        <div className="mb-3">
          <h2 className="text-lg font-semibold">User Management</h2>
          <p className="text-sm text-foreground/60 mt-1">
            Navigate to <Link href="/admin/users" className="text-[var(--kb-accent-gold)] hover:underline">Users</Link> page for full management
          </p>
        </div>
      </div>
    </DashboardLayout>
  );
}
