import React from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { redirect } from "next/navigation";
import { BarChart3, Package, Wallet, TrendingUp } from "lucide-react";
import { fetchVendorDashboardStats } from "@/lib/apiClient";
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import VendorCtaButton from "@/components/vendor/VendorCtaButton";
import VendorOrdersSection from "@/components/vendor/VendorOrdersSection";

// Use real components in tests to avoid next/dynamic being mocked to null
const isTest = process.env.NODE_ENV === "test";

let DashboardLayout: React.ComponentType<any>;
let StatCard: React.ComponentType<any>;

if (isTest) {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  DashboardLayout = require("@/components/layout/DashboardLayout").default;
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  StatCard = require("@/components/vendor/StatCard").default;
} else {
  // Dynamic imports for heavy components
  DashboardLayout = dynamic(() => import("@/components/layout/DashboardLayout"));
  StatCard = dynamic(() => import("@/components/vendor/StatCard"));
}

function VendorSidebar() {
  const items = [
    { id: "dashboard", label: "Dashboard", href: "/vendor/dashboard" },
    { id: "products", label: "Products", href: "/vendor/products" },
    { id: "orders", label: "Orders", href: "/vendor/orders" },
    { id: "payouts", label: "Payouts", href: "/vendor/payouts" },
    { id: "analytics", label: "Analytics", href: "/vendor/analytics" },
    { id: "support", label: "Support", href: "/vendor/support" },
    { id: "settings", label: "Settings", href: "/vendor/settings" },
  ];
  return (
    <nav className="flex flex-col gap-1 text-sm">
      {items.map((i) => (
        <Link
          key={i.id}
          href={i.href}
          className="rounded-lg px-3 py-2 text-foreground/90 hover:bg-white/5 ring-1 ring-transparent hover:ring-white/10"
        >
          {i.label}
        </Link>
      ))}
    </nav>
  );
}


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
export default async function VendorDashboardPage() {
  // 1. Get user session and verify authentication
  const supabase = await createClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  
  if (userError || !user) {
    redirect('/auth/login?redirect=/vendor/dashboard');
  }
  
  // 2. Fetch live dashboard stats from Edge Function
  // Note: No role check here - RLS ensures users only see their own vendor data
  const { data: { session } } = await supabase.auth.getSession();
  const stats = session ? await fetchVendorDashboardStats(session.access_token) : null;
  
  // 3. Handle error state if stats failed to load
  if (!stats) {
    return (
      <DashboardLayout title="Vendor Dashboard" sidebar={<VendorSidebar />}>
        <div className="rounded-2xl border border-red-500/20 bg-red-500/10 p-6">
          <h2 className="text-lg font-semibold text-red-500">Failed to Load Dashboard</h2>
          <p className="mt-2 text-sm text-red-400">
            Unable to fetch your dashboard metrics. Please refresh the page or try again later.
          </p>
        </div>
      </DashboardLayout>
    );
  }
  
  // 4. Transform stats for display (cents to NPR)
  const todayOrders = stats.today.orders;
  const todayRevenue = (stats.today.gmv_cents / 100).toLocaleString('en-IN');
  const monthlyEarnings = (stats.last_30_days.gmv_cents / 100).toLocaleString('en-IN');
  const pendingBalance = (stats.last_30_days.pending_payout_cents / 100).toLocaleString('en-IN');
  const platformFees = (stats.last_30_days.platform_fees_cents / 100).toLocaleString('en-IN');

  return (
    <>
      <DashboardLayout title="Vendor Dashboard" actions={<VendorCtaButton />} sidebar={<VendorSidebar />}> 
        {/* Live Stat Grid */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard 
            title="Today's Orders" 
            value={todayOrders} 
            subtitle={`NPR ${todayRevenue} revenue`}
            trend={{ label: "Live data", direction: "up" }} 
            icon={<BarChart3 className="h-5 w-5 text-[var(--kb-primary-brand)]" />} 
          />
          <StatCard 
            title="Monthly Earnings" 
            value={`NPR ${monthlyEarnings}`} 
            subtitle="Last 30 days"
            trend={{ label: "Real-time", direction: "up" }} 
            icon={<Wallet className="h-5 w-5 text-[var(--kb-primary-brand)]" />} 
          />
          <StatCard 
            title="Pending Balance" 
            value={`NPR ${pendingBalance}`} 
            subtitle="Awaiting payout"
            icon={<Package className="h-5 w-5 text-[var(--kb-primary-brand)]" />} 
          />
          <StatCard 
            title="Platform Fees" 
            value={`NPR ${platformFees}`} 
            subtitle="Last 30 days (15%)"
            icon={<TrendingUp className="h-5 w-5 text-[var(--kb-primary-brand)]" />} 
          />
        </div>

        {/* Payouts Snapshot */}
        <div className="mt-6 grid gap-4 lg:grid-cols-3">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4 ring-1 ring-white/10 lg:col-span-2">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-semibold">Payouts Snapshot (30 Days)</h2>
              <Link className="text-sm text-[var(--kb-accent-gold)] hover:underline" href="/vendor/payouts">View all</Link>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <StatCard 
                title="Pending Payout" 
                value={`NPR ${pendingBalance}`} 
                subtitle="After fees" 
              />
              <StatCard 
                title="Platform Fees" 
                value={`NPR ${platformFees}`} 
                subtitle="15% commission" 
              />
              <StatCard 
                title="Total Payouts" 
                value={`NPR ${(stats.last_30_days.payouts_cents / 100).toLocaleString('en-IN')}`} 
                subtitle="Completed" 
              />
            </div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4 ring-1 ring-white/10">
            <h2 className="text-lg font-semibold">Quick Stats</h2>
            <div className="mt-3 space-y-3 text-sm">
              <div>
                <div className="text-foreground/60">30-Day Orders</div>
                <div className="text-2xl font-bold">{stats.last_30_days.orders}</div>
              </div>
              <div>
                <div className="text-foreground/60">Avg Order Value</div>
                <div className="text-xl font-semibold">
                  NPR {stats.last_30_days.orders > 0 
                    ? ((stats.last_30_days.gmv_cents / stats.last_30_days.orders) / 100).toFixed(2)
                    : '0'}
                </div>
              </div>
              <div className="text-xs text-foreground/50">
                Last updated: {new Date(stats.generated_at).toLocaleTimeString()}
              </div>
            </div>
          </div>
        </div>

        {/* Recent Orders (still using mock data for now) */}
        <VendorOrdersSection />
      </DashboardLayout>
    </>
  );
}

