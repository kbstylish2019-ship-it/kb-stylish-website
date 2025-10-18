import React from "react";
import { redirect } from "next/navigation";
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import DashboardLayout from "@/components/layout/DashboardLayout";
import StylistSidebar from "@/components/stylist/StylistSidebar";

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

  // ========================================================================
  // RENDER
  // ========================================================================

  return (
    <DashboardLayout sidebar={<StylistSidebar />}>
      <div className="p-6">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900">Earnings</h1>
          <p className="text-gray-600 mt-1">
            Track your earnings and payment history
          </p>
        </div>
        
        <div className="bg-white/5 border border-white/10 rounded-lg p-8 text-center">
          <p className="text-foreground/70">
            💰 Earnings tracking coming soon...
          </p>
          <p className="text-sm text-foreground/50 mt-2">
            This will show your daily, weekly, and monthly earnings with charts and analytics.
          </p>
        </div>
      </div>
    </DashboardLayout>
  );
}
