import React from "react";
import { redirect } from "next/navigation";
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import DashboardLayout from "@/components/layout/DashboardLayout";
import MyBookingsClient from "@/components/customer/MyBookingsClient";

/**
 * Customer My Bookings Page (Server Component)
 * 
 * Displays customer's booking history with filters, search, and rebook functionality
 * 
 * Features:
 * - View all bookings (past & upcoming)
 * - Search by service/stylist
 * - Filter by status
 * - Rebook with same stylist
 * - Cancel upcoming bookings
 * - Real-time updates
 * 
 * Security:
 * - Requires authentication
 * - RLS enforces customer can only see their own bookings
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

export default async function MyBookingsPage() {
  // ========================================================================
  // AUTHENTICATION
  // ========================================================================
  
  const supabase = await createClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();

  if (userError || !user) {
    redirect('/login?redirect=/bookings');
  }

  // No role check needed - all authenticated users can view their bookings

  // ========================================================================
  // RENDER
  // ========================================================================

  return (
    <DashboardLayout>
      <div className="p-6">
        <MyBookingsClient userId={user.id} />
      </div>
    </DashboardLayout>
  );
}
