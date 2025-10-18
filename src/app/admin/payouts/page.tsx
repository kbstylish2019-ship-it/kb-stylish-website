import React from "react";
import dynamicImport from "next/dynamic";
import { redirect } from "next/navigation";
import { DollarSign, Clock, CheckCircle, XCircle } from "lucide-react";
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { getAdminPayoutRequests } from "@/actions/admin/payouts";
import PayoutRequestsTable from "@/components/admin/PayoutRequestsTable";
import AdminSidebar from "@/components/admin/AdminSidebar";

// Force dynamic rendering - no caching
export const dynamic = 'force-dynamic';
export const revalidate = 0;

const isTest = process.env.NODE_ENV === "test";

let DashboardLayout: React.ComponentType<any>;

if (isTest) {
  DashboardLayout = require("@/components/layout/DashboardLayout").default;
} else {
  DashboardLayout = dynamicImport(() => import("@/components/layout/DashboardLayout"));
}

// Sidebar moved to shared component: @/components/admin/AdminSidebar

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

export default async function AdminPayoutsPage() {
  // 1. Verify authentication
  const supabase = await createClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  
  if (userError || !user) {
    redirect('/auth/login?redirect=/admin/payouts');
  }
  
  // 2. Verify admin role
  const userRoles = user.user_metadata?.user_roles || user.app_metadata?.user_roles || [];
  if (!userRoles.includes('admin')) {
    redirect('/');
  }

  // 3. Fetch pending payout requests (returns null on error, empty array if no results)
  const pendingRequests = await getAdminPayoutRequests('pending');

  // 4. Get stats from database - with no cache to ensure fresh data
  const { data: pendingData } = await supabase
    .from('payout_requests')
    .select('requested_amount_cents', { count: 'exact' })
    .eq('status', 'pending');
    
  const { data: approvedData } = await supabase
    .from('payout_requests')
    .select('id', { count: 'exact' })
    .eq('status', 'approved');
    
  const { data: rejectedData } = await supabase
    .from('payout_requests')
    .select('id', { count: 'exact' })
    .eq('status', 'rejected');

  // Calculate counts from individual queries
  const pendingCount = pendingData?.length || 0;
  const approvedCount = approvedData?.length || 0;
  const rejectedCount = rejectedData?.length || 0;
  const totalPending = pendingData?.reduce((sum, s) => sum + (s.requested_amount_cents || 0), 0) || 0;

  return (
    <DashboardLayout title="Payout Requests" sidebar={<AdminSidebar />}>
        {/* Header */}
        <div className="mb-6">
          <p className="text-foreground/60">Review and process vendor payout requests</p>
        </div>

        {/* Stats Grid */}
        <div className="grid gap-6 sm:grid-cols-4 mb-8">
          <div className="rounded-2xl border border-amber-500/20 bg-amber-500/10 p-6 ring-1 ring-amber-500/10">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-500/20 ring-1 ring-amber-500/30">
                <Clock className="h-6 w-6 text-amber-400" />
              </div>
              <div>
                <div className="text-sm text-amber-300/80">Pending</div>
                <div className="text-2xl font-bold text-amber-300">{pendingCount}</div>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-6 ring-1 ring-emerald-500/10">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/20 ring-1 ring-emerald-500/30">
                <CheckCircle className="h-6 w-6 text-emerald-400" />
              </div>
              <div>
                <div className="text-sm text-emerald-300/80">Approved</div>
                <div className="text-2xl font-bold text-emerald-300">{approvedCount}</div>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-red-500/20 bg-red-500/10 p-6 ring-1 ring-red-500/10">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-500/20 ring-1 ring-red-500/30">
                <XCircle className="h-6 w-6 text-red-400" />
              </div>
              <div>
                <div className="text-sm text-red-300/80">Rejected</div>
                <div className="text-2xl font-bold text-red-300">{rejectedCount}</div>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 p-6 ring-1 ring-white/10">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--kb-accent-gold)]/20 ring-1 ring-[var(--kb-accent-gold)]/30">
                <DollarSign className="h-6 w-6 text-[var(--kb-accent-gold)]" />
              </div>
              <div>
                <div className="text-sm text-foreground/60">Total Pending</div>
                <div className="text-2xl font-bold">
                  NPR {(totalPending / 100).toLocaleString('en-IN')}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Payout Requests */}
        <div>
          <h2 className="text-xl font-semibold mb-4">Pending Requests ({pendingCount})</h2>
          {pendingRequests === null ? (
            <div className="rounded-2xl border border-red-500/20 bg-red-500/10 p-6">
              <h3 className="font-semibold text-red-500">Failed to Load Requests</h3>
              <p className="mt-2 text-sm text-red-400">
                Unable to fetch payout requests. Please refresh the page.
              </p>
            </div>
          ) : (
            <PayoutRequestsTable requests={pendingRequests} />
          )}
        </div>
    </DashboardLayout>
  );
}
