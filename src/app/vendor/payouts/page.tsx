import React from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, Wallet, Clock, CheckCircle, AlertCircle } from "lucide-react";
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import PayoutRequestButton from "@/components/vendor/PayoutRequestButton";

const isTest = process.env.NODE_ENV === "test";

let DashboardLayout: React.ComponentType<any>;
let StatCard: React.ComponentType<any>;

if (isTest) {
  DashboardLayout = require("@/components/layout/DashboardLayout").default;
  StatCard = require("@/components/vendor/StatCard").default;
} else {
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

export default async function VendorPayoutsPage() {
  // 1. Verify authentication
  const supabase = await createClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  
  if (userError || !user) {
    redirect('/auth/login?redirect=/vendor/payouts');
  }
  
  // 2. Verify vendor role
  const userRoles = user.user_metadata?.user_roles || user.app_metadata?.user_roles || [];
  if (!userRoles.includes('vendor')) {
    redirect('/');
  }

  // Fetch real payout data
  const { getVendorPayouts } = await import('@/actions/vendor/payouts');
  const payoutData = await getVendorPayouts();

  // Fetch vendor profile for payment methods
  const { data: vendorProfile } = await supabase
    .from('vendor_profiles')
    .select('bank_account_name, bank_account_number, bank_name, esewa_number, khalti_number')
    .eq('user_id', user.id)
    .single();

  if (!payoutData) {
    return (
      <DashboardLayout title="Payouts" sidebar={<VendorSidebar />}>
        <div className="rounded-2xl border border-red-500/20 bg-red-500/10 p-6">
          <h2 className="text-lg font-semibold text-red-500">Failed to Load Payouts</h2>
          <p className="mt-2 text-sm text-red-400">
            Unable to fetch payout data. Please refresh the page or try again later.
          </p>
        </div>
      </DashboardLayout>
    );
  }

  const { payouts, requests, summary, available_balance } = payoutData;
  
  // Combine payouts and requests for display
  const allTransactions = [
    ...payouts.map(p => ({
      id: p.id,
      date: p.created_at,
      amount: p.net_amount_cents,
      status: p.status,
      method: p.payment_method,
      reference: p.payment_reference,
      type: 'payout' as const
    })),
    ...requests.map(r => ({
      id: r.id,
      date: r.created_at,
      amount: r.requested_amount_cents,
      status: r.status,
      method: r.payment_method,
      reference: r.rejection_reason || null,
      type: 'request' as const
    }))
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  return (
    <DashboardLayout title="Payouts" sidebar={<VendorSidebar />}>
      {/* Back Button */}
      <div className="mb-6">
        <Link 
          href="/vendor/dashboard"
          className="inline-flex items-center gap-2 text-sm text-foreground/70 hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Dashboard
        </Link>
      </div>

      {/* Summary Cards + Request Button */}
      <div className="mb-6 space-y-4">
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-3">
        <StatCard
          title="Total Payouts"
          value={`NPR ${(summary.total_paid_cents / 100).toLocaleString('en-IN')}`}
          subtitle="All time"
          icon={<Wallet className="h-5 w-5 text-emerald-400" />}
        />
        <StatCard
          title="Available Balance"
          value={`NPR ${(available_balance.pending_payout_cents / 100).toLocaleString('en-IN')}`}
          subtitle="Ready to withdraw"
          icon={<Clock className="h-5 w-5 text-amber-400" />}
        />
        <StatCard
          title="This Month"
          value={`NPR ${(summary.this_month_cents / 100).toLocaleString('en-IN')}`}
          subtitle={new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
          icon={<CheckCircle className="h-5 w-5 text-[var(--kb-primary-brand)]" />}
        />
        </div>
        
        {/* Request Payout Button */}
        <PayoutRequestButton 
          availableBalanceCents={available_balance.pending_payout_cents}
        />
      </div>

      {/* Payout History */}
      <div className="rounded-2xl border border-white/10 bg-white/5 p-6 ring-1 ring-white/10">
        <h2 className="text-lg font-semibold mb-4">Payout History</h2>
        
        <div className="w-full overflow-x-auto">
          <table className="min-w-[900px] text-sm">
            <thead>
              <tr className="border-b border-white/10">
                <th className="px-4 py-3 text-left text-xs font-medium text-foreground/70 uppercase">
                  Payout ID
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-foreground/70 uppercase">
                  Date
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-foreground/70 uppercase">
                  Amount
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-foreground/70 uppercase">
                  Method
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-foreground/70 uppercase">
                  Status
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-foreground/70 uppercase">
                  Reference
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {allTransactions.map((transaction) => (
                <tr key={transaction.id} className="hover:bg-white/[0.02]">
                  <td className="px-4 py-3">
                    <div className="font-medium">{transaction.id.slice(0, 8)}</div>
                    <div className="text-xs text-foreground/50 capitalize">{transaction.type}</div>
                  </td>
                  <td className="px-4 py-3 text-foreground/80">
                    {new Date(transaction.date).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 font-semibold">
                    NPR {(transaction.amount / 100).toLocaleString('en-IN')}
                  </td>
                  <td className="px-4 py-3 text-foreground/80 capitalize">
                    {transaction.method.replace('_', ' ')}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs ring-1 ${
                      transaction.status === 'completed'
                        ? 'bg-emerald-500/15 text-emerald-300 ring-emerald-500/30'
                        : transaction.status === 'pending' || transaction.status === 'processing'
                        ? 'bg-amber-500/15 text-amber-300 ring-amber-500/30'
                        : transaction.status === 'approved'
                        ? 'bg-blue-500/15 text-blue-300 ring-blue-500/30'
                        : 'bg-red-500/15 text-red-300 ring-red-500/30'
                    }`}>
                      {transaction.status === 'completed' ? (
                        <CheckCircle className="h-3 w-3" />
                      ) : transaction.status === 'rejected' || transaction.status === 'cancelled' ? (
                        <AlertCircle className="h-3 w-3" />
                      ) : (
                        <Clock className="h-3 w-3" />
                      )}
                      {transaction.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-foreground/60 text-xs">
                    {transaction.reference || '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Empty State (if no payouts) */}
        {allTransactions.length === 0 && (
          <div className="py-12 text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-white/5">
              <Wallet className="h-8 w-8 text-foreground/40" />
            </div>
            <h3 className="text-lg font-medium">No payouts yet</h3>
            <p className="mt-2 text-sm text-foreground/60">
              Your payout history will appear here once you start receiving payments.
            </p>
          </div>
        )}
      </div>

      {/* Info Banner */}
      <div className="mt-6 rounded-xl border border-blue-500/20 bg-blue-500/10 p-4">
        <div className="flex gap-3">
          <AlertCircle className="h-5 w-5 text-blue-400 flex-shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-medium text-blue-300">Payout Schedule</p>
            <p className="mt-1 text-blue-200/80">
              Payouts are processed on the 1st and 15th of each month. Pending balance must be at least NPR 1,000 to initiate a payout.
            </p>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
