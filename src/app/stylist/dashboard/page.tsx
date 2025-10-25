import React from "react";
import { redirect } from "next/navigation";
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import DashboardLayout from "@/components/layout/DashboardLayout";
import StylistDashboardClient from "@/components/stylist/StylistDashboardClient";
import StylistSidebar from "@/components/stylist/StylistSidebar";

/**
 * Stylist Dashboard Page (Server Component)
 * 
 * Security: Verifies stylist role before rendering
 * Features: Context-rich bookings, budget tracker, real-time updates
 * Privacy: Displays PII flags only; actual data accessed via audit-logged modal
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

export default async function StylistDashboardPage() {
  // ========================================================================
  // AUTHENTICATION & AUTHORIZATION
  // ========================================================================
  
  const supabase = await createClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();

  if (userError || !user) {
    redirect('/login?redirect=/stylist/dashboard');
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

  // ========================================================================
  // RENDER
  // ========================================================================

  return (
    <DashboardLayout sidebar={<StylistSidebar />}>
      <div className="p-3 sm:p-4">
        <div className="mb-3 sm:mb-4">
          <h1 className="text-xl sm:text-2xl font-bold text-foreground">Dashboard</h1>
          <p className="text-xs sm:text-sm text-foreground/70 mt-1">
            View your upcoming appointments and manage your schedule
          </p>
        </div>
        
        {/* Client component handles data fetching and real-time updates */}
        <StylistDashboardClient userId={user.id} />
      </div>
    </DashboardLayout>
  );
}
