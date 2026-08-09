import React from "react";
import { redirect } from "next/navigation";
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import DashboardLayout from "@/components/layout/DashboardLayout";
import AdminSidebar from "@/components/admin/AdminSidebar";

async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
          } catch { /* Server Component limitation */ }
        },
      },
    }
  );
}

interface StylistRevenueRow {
  stylist_user_id: string;
  display_name: string;
  completed_count: number;
  completed_value_cents: number;
  upcoming_count: number;
  upcoming_value_cents: number;
  cancelled_count: number;
  total_value_cents: number;
}

const npr = (cents: number) =>
  `Rs. ${Math.round((cents ?? 0) / 100).toLocaleString('en-NP')}`;

/**
 * Admin view of service revenue by stylist. Answers "how much service value has each
 * stylist sold?" — which had no home before (the admin dashboard is mock data and the
 * stylists page shows only a booking count).
 */
export default async function AdminStylistRevenuePage() {
  const supabase = await createClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) redirect('/auth/login?redirect=/admin/stylist-revenue');

  const { data: isAdmin, error: roleError } = await supabase.rpc('user_has_role', {
    user_uuid: user.id, role_name: 'admin',
  });
  if (roleError || !isAdmin) redirect('/?error=unauthorized');

  const { data, error } = await supabase.rpc('admin_get_stylist_service_revenue');
  const rows: StylistRevenueRow[] = data || [];

  const totals = rows.reduce(
    (acc, r) => ({
      completed: acc.completed + r.completed_value_cents,
      upcoming: acc.upcoming + r.upcoming_value_cents,
      total: acc.total + r.total_value_cents,
    }),
    { completed: 0, upcoming: 0, total: 0 }
  );

  return (
    <DashboardLayout sidebar={<AdminSidebar />}>
      <div className="p-3 sm:p-4">
        <div className="mb-4">
          <h1 className="text-xl sm:text-2xl font-bold text-foreground">Service Revenue by Stylist</h1>
          <p className="text-xs sm:text-sm text-foreground/70 mt-1">
            Value of appointments each stylist has sold. Completed = already served; Upcoming = confirmed but not yet served. Cancelled bookings are excluded.
          </p>
        </div>

        {error ? (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <p className="text-red-800">Failed to load stylist revenue. Please refresh the page.</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
              <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                <div className="text-xs text-gray-500 uppercase tracking-wide">Completed (served)</div>
                <div className="text-2xl font-bold text-gray-900 mt-1">{npr(totals.completed)}</div>
              </div>
              <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                <div className="text-xs text-gray-500 uppercase tracking-wide">Upcoming (confirmed)</div>
                <div className="text-2xl font-bold text-gray-900 mt-1">{npr(totals.upcoming)}</div>
              </div>
              <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                <div className="text-xs text-gray-500 uppercase tracking-wide">Total sold</div>
                <div className="text-2xl font-bold text-gray-900 mt-1">{npr(totals.total)}</div>
              </div>
            </div>

            <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
              <div className="max-w-full overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                      <th className="px-4 py-3">Stylist</th>
                      <th className="px-4 py-3 text-right">Completed</th>
                      <th className="px-4 py-3 text-right">Completed value</th>
                      <th className="px-4 py-3 text-right">Upcoming</th>
                      <th className="px-4 py-3 text-right">Upcoming value</th>
                      <th className="px-4 py-3 text-right">Cancelled</th>
                      <th className="px-4 py-3 text-right">Total sold</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {rows.length === 0 ? (
                      <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-500">No stylists found</td></tr>
                    ) : (
                      rows.map((r) => (
                        <tr key={r.stylist_user_id} className="hover:bg-gray-50">
                          <td className="px-4 py-3 font-medium text-gray-900">{r.display_name}</td>
                          <td className="px-4 py-3 text-right text-gray-700">{r.completed_count}</td>
                          <td className="px-4 py-3 text-right font-medium text-gray-900">{npr(r.completed_value_cents)}</td>
                          <td className="px-4 py-3 text-right text-gray-700">{r.upcoming_count}</td>
                          <td className="px-4 py-3 text-right text-gray-700">{npr(r.upcoming_value_cents)}</td>
                          <td className="px-4 py-3 text-right text-gray-400">{r.cancelled_count}</td>
                          <td className="px-4 py-3 text-right font-semibold text-gray-900">{npr(r.total_value_cents)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
