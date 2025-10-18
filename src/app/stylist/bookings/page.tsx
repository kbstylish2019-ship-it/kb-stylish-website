import React from "react";
import { redirect } from "next/navigation";
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import DashboardLayout from "@/components/layout/DashboardLayout";
import StylistSidebar from "@/components/stylist/StylistSidebar";
import BookingsListClient from "@/components/stylist/BookingsListClientV2";

/**
 * Stylist Bookings Page (Server Component)
 * 
 * Complete booking management interface for stylists
 * Features: filtering, search, status management, notes
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

export default async function StylistBookingsPage() {
  // ========================================================================
  // AUTHENTICATION & AUTHORIZATION
  // ========================================================================
  
  const supabase = await createClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();

  if (userError || !user) {
    redirect('/login?redirect=/stylist/bookings');
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
      <div className="p-6">
        <BookingsListClient userId={user.id} />
      </div>
    </DashboardLayout>
  );
}
