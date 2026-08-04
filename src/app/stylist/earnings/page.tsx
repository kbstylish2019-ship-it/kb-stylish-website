import React from "react";
import { redirect } from "next/navigation";
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import DashboardLayout from "@/components/layout/DashboardLayout";
import StylistSidebar from "@/components/stylist/StylistSidebar";
import { format } from 'date-fns';

/**
 * Stylist Earnings Page (Server Component)
 * 
 * Track earnings, view payment history, and analyze performance
 * Future feature - not critical for MVP
 */
async function createClient() {
  const cookieStore = await cookies();
  
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // Server Component - can't set cookies
          }
        },
      },
    }
  );
}

export default async function StylistEarningsPage() {
  // ========================================================================
  // AUTHENTICATION & AUTHORIZATION
  // ========================================================================
  
  const supabase = await createClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();

  if (userError || !user) {
    redirect('/login?redirect=/stylist/earnings');
  }

  // Verify stylist role
  const { data: isStylist, error: roleError } = await supabase
    .rpc('user_has_role', {
      user_uuid: user.id,
      role_name: 'stylist'
    });

  if (roleError || !isStylist) {
    redirect('/?error=unauthorized');
  }

  const { data: bookings, error: bookingsError } = await supabase
    .from('bookings')
    .select(`
      id,
      customer_name,
      start_time,
      end_time,
      status,
      price_cents,
      services(
        name,
        duration_minutes,
        category
      )
    `)
    .eq('stylist_user_id', user.id)
    .order('start_time', { ascending: false });

  const completedBookings = (bookings || []).filter((booking: any) => booking.status === 'completed');
  const activeBookings = (bookings || []).filter((booking: any) => ['confirmed', 'in_progress'].includes(booking.status));
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const totalCompleted = completedBookings.length;
  const totalEarningsCents = completedBookings.reduce((sum: number, booking: any) => sum + (booking.price_cents || 0), 0);
  const thisMonthEarningsCents = completedBookings.reduce((sum: number, booking: any) => {
    return new Date(booking.start_time) >= monthStart ? sum + (booking.price_cents || 0) : sum;
  }, 0);
  const activeRevenueCents = activeBookings.reduce((sum: number, booking: any) => sum + (booking.price_cents || 0), 0);
  const averageCompletedBookingCents = totalCompleted > 0 ? Math.round(totalEarningsCents / totalCompleted) : 0;
  const recentCompletedBookings = completedBookings.slice(0, 5);

  const formatCurrency = (cents: number) => `NPR ${(cents / 100).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

  // ========================================================================
  // RENDER
  // ========================================================================

  return (
    <DashboardLayout sidebar={<StylistSidebar />}>
      <div className="p-6">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900">Earnings</h1>
          <p className="text-gray-600 mt-1">
            Track completed booking revenue and upcoming earning opportunities
          </p>
        </div>

        {bookingsError ? (
          <div className="rounded-2xl border border-red-200 dark:border-red-500/20 bg-red-50 dark:bg-red-500/10 p-6">
            <h2 className="text-lg font-semibold text-red-800 dark:text-red-300">Failed to Load Earnings</h2>
            <p className="mt-2 text-sm text-red-800 dark:text-red-200/80">
              We couldn&apos;t load your booking earnings right now. Please refresh and try again.
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-2xl border border-white/10 bg-white/5 p-5 ring-1 ring-white/10">
                <p className="text-sm text-foreground/60">Lifetime Earnings</p>
                <p className="mt-2 text-3xl font-semibold text-foreground">{formatCurrency(totalEarningsCents)}</p>
                <p className="mt-1 text-xs text-foreground/50">From {totalCompleted} completed bookings</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-5 ring-1 ring-white/10">
                <p className="text-sm text-foreground/60">This Month</p>
                <p className="mt-2 text-3xl font-semibold text-foreground">{formatCurrency(thisMonthEarningsCents)}</p>
                <p className="mt-1 text-xs text-foreground/50">Completed services since {format(monthStart, 'MMM d')}</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-5 ring-1 ring-white/10">
                <p className="text-sm text-foreground/60">Upcoming Revenue</p>
                <p className="mt-2 text-3xl font-semibold text-foreground">{formatCurrency(activeRevenueCents)}</p>
                <p className="mt-1 text-xs text-foreground/50">From {activeBookings.length} confirmed or active bookings</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-5 ring-1 ring-white/10">
                <p className="text-sm text-foreground/60">Average Booking Value</p>
                <p className="mt-2 text-3xl font-semibold text-foreground">{formatCurrency(averageCompletedBookingCents)}</p>
                <p className="mt-1 text-xs text-foreground/50">Across completed appointments</p>
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/5 ring-1 ring-white/10 overflow-hidden">
              <div className="border-b border-white/10 px-5 py-4">
                <h2 className="text-lg font-semibold text-foreground">Recent Completed Bookings</h2>
                <p className="mt-1 text-sm text-foreground/60">Your latest paid appointments based on booking totals</p>
              </div>

              {recentCompletedBookings.length === 0 ? (
                <div className="p-8 text-center">
                  <p className="text-foreground/70">No completed bookings yet</p>
                  <p className="mt-2 text-sm text-foreground/50">
                    Completed services will appear here once customers finish appointments with you.
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-white/10">
                  {recentCompletedBookings.map((booking: any) => {
                    const service = Array.isArray(booking.services) ? booking.services[0] : booking.services;

                    return (
                      <div key={booking.id} className="flex flex-col gap-3 px-5 py-4 md:flex-row md:items-center md:justify-between">
                        <div>
                          <p className="font-medium text-foreground">{booking.customer_name || 'Customer'}</p>
                          <p className="mt-1 text-sm text-foreground/60">
                            {service?.name || 'Service'}
                            {service?.duration_minutes ? ` • ${service.duration_minutes} min` : ''}
                          </p>
                          <p className="mt-1 text-xs text-foreground/50">
                            {format(new Date(booking.start_time), 'MMM d, yyyy • h:mm a')}
                          </p>
                        </div>
                        <div className="text-left md:text-right">
                          <p className="font-semibold text-foreground">{formatCurrency(booking.price_cents || 0)}</p>
                          <p className="mt-1 text-xs uppercase tracking-wide text-emerald-300">Completed</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
