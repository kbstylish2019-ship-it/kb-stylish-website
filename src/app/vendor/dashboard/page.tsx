import React from "react";
import dynamic from "next/dynamic";
import OnboardingWizardWrapper from "@/components/vendor/OnboardingWizardWrapper";
import Link from "next/link";
import { redirect } from "next/navigation";
import { BarChart3, Package, Wallet, TrendingUp } from "lucide-react";
import { fetchVendorDashboardStats } from "@/lib/apiClient";
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import VendorCtaButton from "@/components/vendor/VendorCtaButton";
import { isAuthorizedComboVendor } from "@/lib/constants/combo";

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

function VendorSidebar({ userId }: { userId?: string }) {
  const baseItems = [
    { id: "dashboard", label: "Dashboard", href: "/vendor/dashboard" },
    { id: "products", label: "Products", href: "/vendor/products" },
  ];
  
  // Add Combos link only for authorized vendors
  const comboItem = userId && isAuthorizedComboVendor(userId) 
    ? [{ id: "combos", label: "Combos", href: "/vendor/combos" }]
    : [];
  
  const remainingItems = [
    { id: "orders", label: "Orders", href: "/vendor/orders" },
    { id: "payouts", label: "Payouts", href: "/vendor/payouts" },
    { id: "analytics", label: "Analytics", href: "/vendor/analytics" },
    { id: "support", label: "Support", href: "/vendor/support" },
    { id: "settings", label: "Settings", href: "/vendor/settings" },
  ];
  
  const items = [...baseItems, ...comboItem, ...remainingItems];
  
  return (
    <nav className="flex flex-col gap-1 text-sm">
      {items.map((i) => (
        <Link
          key={i.id}
          href={i.href}
          className="rounded-lg px-3 py-2 text-gray-700 hover:bg-gray-50 border border-transparent hover:border-gray-200"
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

// Force revalidation on every request to show live data
export const revalidate = 0;

// ✅ CONVERTED TO ASYNC SERVER COMPONENT
export default async function VendorDashboardPage() {
  // 1. Get user session and verify authentication
  const supabase = await createClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  
  if (userError || !user) {
    redirect('/auth/login?redirect=/vendor/dashboard');
  }
  
  // 2. Verify vendor role
  const userRoles = user.user_metadata?.user_roles || user.app_metadata?.user_roles || [];
  if (!userRoles.includes('vendor')) {
    redirect('/'); // Non-vendors redirected to home
  }
  
  // 3. Fetch live dashboard stats from Edge Function
  const { data: { session } } = await supabase.auth.getSession();
  const stats = session ? await fetchVendorDashboardStats(session.access_token) : null;
  
  // 3.5. Fetch accurate payout balance
  const { getVendorPayouts } = await import('@/actions/vendor/payouts');
  const payoutData = await getVendorPayouts();
  
  // 4. Fetch vendor commission rate
  let commissionRate = 0.15; // Default to 15%
  try {
    const { data: vendorProfile } = await supabase
      .from('vendor_profiles')
      .select('commission_rate')
      .eq('user_id', user.id)
      .single();
    
    if (vendorProfile?.commission_rate) {
      commissionRate = vendorProfile.commission_rate;
    }
  } catch (error) {
    console.error('Failed to fetch commission rate:', error);
    // Use default 15%
  }
  
  const commissionPercentage = (commissionRate * 100).toFixed(0); // e.g., "15" or "12"
  
  // 3.6. Fetch recent orders (last 10)
  const { data: recentOrders } = await supabase
    .from('orders')
    .select(`
      id,
      order_number,
      created_at,
      total_cents,
      status,
      shipping_name,
      order_items!inner(
        id,
        fulfillment_status
      )
    `)
    .eq('order_items.vendor_id', user.id)
    .order('created_at', { ascending: false })
    .limit(10);
  
  // 4. Handle error state if stats failed to load
  if (!stats) {
    return (
      <DashboardLayout title="Vendor Dashboard" sidebar={<VendorSidebar userId={user.id} />}>
        <OnboardingWizardWrapper />
        <div className="rounded-2xl border border-red-200 bg-red-50 p-6">
          <h2 className="text-lg font-semibold text-red-700">Failed to Load Dashboard</h2>
          <p className="mt-2 text-sm text-red-600">
            Unable to fetch your dashboard metrics. Please refresh the page or try again later.
          </p>
        </div>
      </DashboardLayout>
    );
  }
  
  // 6. Transform stats for display (cents to NPR)
  const todayOrders = stats.today.orders;
  const todayRevenue = (stats.today.gmv_cents / 100).toLocaleString('en-IN');
  const todayRefunds = (stats.today.refunds_cents / 100).toLocaleString('en-IN');
  const monthlyEarnings = (stats.last_30_days.gmv_cents / 100).toLocaleString('en-IN');
  const monthlyRefunds = (stats.last_30_days.refunds_cents / 100).toLocaleString('en-IN');
  
  // ✅ Use accurate payout calculation (same as payouts page)
  const availableBalance = payoutData 
    ? (payoutData.available_balance.pending_payout_cents / 100).toLocaleString('en-IN')
    : '0';
  
  // ✅ Real payout data from payoutData (not mock!)
  const platformFees = payoutData
    ? (payoutData.available_balance.platform_fees_cents / 100).toLocaleString('en-IN')
    : (stats.last_30_days.platform_fees_cents / 100).toLocaleString('en-IN');
    
  const totalPayouts = payoutData
    ? (payoutData.summary.total_paid_cents / 100).toLocaleString('en-IN')
    : '0';

  return (
    <>
      <DashboardLayout title="Vendor Dashboard" actions={<VendorCtaButton userId={user.id} />} sidebar={<VendorSidebar userId={user.id} />}> 
        <OnboardingWizardWrapper />
        {/* Live Stat Grid */}
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
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
            title="Available Balance" 
            value={`NPR ${availableBalance}`} 
            subtitle="Ready to withdraw"
            icon={<Package className="h-5 w-5 text-[var(--kb-primary-brand)]" />} 
          />
          <StatCard 
            title="Platform Fees" 
            value={`NPR ${platformFees}`} 
            subtitle={`Last 30 days (${commissionPercentage}%)`}
            icon={<TrendingUp className="h-5 w-5 text-[var(--kb-primary-brand)]" />} 
          />
        </div>
        
        {/* Refunds Section - Only show if there are refunds */}
        {(stats.today.refunds_cents > 0 || stats.last_30_days.refunds_cents > 0) && (
          <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-medium text-amber-800">Refunds & Cancellations</h3>
                <div className="mt-1 flex items-baseline gap-4">
                  <div>
                    <span className="text-xs text-gray-500">Today: </span>
                    <span className="text-lg font-semibold text-amber-700">NPR {todayRefunds}</span>
                  </div>
                  <div>
                    <span className="text-xs text-gray-500">Last 30 days: </span>
                    <span className="text-lg font-semibold text-amber-700">NPR {monthlyRefunds}</span>
                  </div>
                </div>
              </div>
              <div className="text-xs text-gray-500">
                From cancelled orders
              </div>
            </div>
          </div>
        )}

        {/* Payouts Snapshot */}
        <div className="mt-6 grid gap-4 grid-cols-1 lg:grid-cols-3">
          <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm lg:col-span-2">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">Payouts Snapshot (30 Days)</h2>
              <Link className="text-sm text-[#1976D2] hover:underline" href="/vendor/payouts">View all</Link>
            </div>
            <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard 
                title="Available Balance" 
                value={`NPR ${availableBalance}`} 
                subtitle="After fees" 
              />
              <StatCard 
                title="Platform Fees" 
                value={`NPR ${platformFees}`} 
                subtitle={`${commissionPercentage}% commission`}
              />
              <StatCard 
                title="Refunds" 
                value={`NPR ${monthlyRefunds}`} 
                subtitle="Cancelled orders" 
              />
              <StatCard 
                title="Total Payouts" 
                value={`NPR ${totalPayouts}`} 
                subtitle="Completed" 
              />
            </div>
          </div>
          <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
            <h2 className="text-lg font-semibold text-gray-900">Quick Stats</h2>
            <div className="mt-3 space-y-3 text-sm">
              <div>
                <div className="text-gray-500">30-Day Orders</div>
                <div className="text-2xl font-bold text-gray-900">{stats.last_30_days.orders}</div>
              </div>
              <div>
                <div className="text-gray-500">Avg Order Value</div>
                <div className="text-xl font-semibold text-gray-900">
                  NPR {stats.last_30_days.orders > 0 
                    ? ((stats.last_30_days.gmv_cents / stats.last_30_days.orders) / 100).toFixed(2)
                    : '0'}
                </div>
              </div>
              <div className="text-xs text-gray-400">
                Last updated: {new Date(stats.generated_at).toLocaleTimeString()}
              </div>
            </div>
          </div>
        </div>

        {/* Recent Orders - Real Data */}
        <div className="mt-8">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">Recent Orders</h2>
            <Link className="text-sm text-[#1976D2] hover:underline" href="/vendor/orders">View all</Link>
          </div>
          
          <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden shadow-sm">
            {recentOrders && recentOrders.length > 0 ? (
              <div className="overflow-x-auto w-full">
                <table className="min-w-[900px] text-sm">
                  <thead className="bg-gray-50">
                    <tr className="border-b border-gray-200">
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Order #</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Customer</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Items</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Total</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {recentOrders.map((order: any) => {
                      const itemsArray = Array.isArray(order.order_items) ? order.order_items : [order.order_items];
                      const itemsCount = itemsArray.length;
                      const firstItemStatus = itemsArray[0]?.fulfillment_status || 'pending';
                      
                      return (
                        <tr key={order.id} className="hover:bg-gray-50">
                          <td className="px-4 py-3 font-mono text-xs text-gray-900">{order.order_number}</td>
                          <td className="px-4 py-3 text-gray-600">
                            {new Date(order.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                          </td>
                          <td className="px-4 py-3 text-gray-900">{order.shipping_name}</td>
                          <td className="px-4 py-3 text-gray-600">{itemsCount} item{itemsCount > 1 ? 's' : ''}</td>
                          <td className="px-4 py-3 font-semibold text-gray-900">NPR {(order.total_cents / 100).toLocaleString('en-IN')}</td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex rounded-full px-2 py-0.5 text-xs capitalize ring-1 ${
                              firstItemStatus === 'delivered'
                                ? 'bg-emerald-50 text-emerald-700 ring-emerald-200'
                                : firstItemStatus === 'shipped'
                                ? 'bg-blue-50 text-blue-700 ring-blue-200'
                                : firstItemStatus === 'processing'
                                ? 'bg-amber-50 text-amber-700 ring-amber-200'
                                : firstItemStatus === 'cancelled'
                                ? 'bg-red-50 text-red-700 ring-red-200'
                                : 'bg-gray-50 text-gray-700 ring-gray-200'
                            }`}>
                              {firstItemStatus}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="py-12 text-center">
                <div className="text-gray-400 mb-2">No recent orders</div>
                <p className="text-sm text-gray-500">Your orders will appear here</p>
              </div>
            )}
          </div>
        </div>
      </DashboardLayout>
    </>
  );
}

