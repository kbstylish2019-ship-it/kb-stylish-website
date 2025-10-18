import React from "react";
import { redirect } from "next/navigation";
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import DashboardLayout from "@/components/layout/DashboardLayout";
import StylistSidebar from "@/components/stylist/StylistSidebar";
import SchedulePageClient from "@/components/stylist/SchedulePageClient";

/**
 * Stylist Schedule Page (Server Component)
 * 
 * Manage working hours, time off, and availability
 * Uses existing stylist_schedules and schedule_overrides tables
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

export default async function StylistSchedulePage() {
  // ========================================================================
  // AUTHENTICATION & AUTHORIZATION
  // ========================================================================
  
  const supabase = await createClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();

  if (userError || !user) {
    redirect('/login?redirect=/stylist/schedule');
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
      <SchedulePageClient userId={user.id} />
    </DashboardLayout>
  );
}
