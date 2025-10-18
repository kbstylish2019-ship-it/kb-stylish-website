import React from "react";
import dynamic from "next/dynamic";
import { redirect } from "next/navigation";
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import AdminSidebar from "@/components/admin/AdminSidebar";
import FeaturedStylistsClient from "@/components/admin/FeaturedStylistsClient";

const isTest = process.env.NODE_ENV === "test";

let DashboardLayout: React.ComponentType<any>;

if (isTest) {
  DashboardLayout = require("@/components/layout/DashboardLayout").default;
} else {
  DashboardLayout = dynamic(() => import("@/components/layout/DashboardLayout"));
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
            // Server Component limitation
          }
        },
      },
    }
  );
}

export default async function FeaturedStylistsPage() {
  // 1. Verify authentication
  const supabase = await createClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  
  if (userError || !user) {
    redirect('/auth/login?redirect=/admin/curation/featured-stylists');
  }
  
  // 2. Verify admin role
  const userRoles = user.user_metadata?.user_roles || user.app_metadata?.user_roles || [];
  if (!userRoles.includes('admin')) {
    redirect('/'); // Non-admins redirected to home
  }
  
  // 3. Fetch ALL stylists (active and inactive for admin management)
  const { data: stylists, error: stylistsError } = await supabase
    .from('stylist_profiles')
    .select(`
      user_id,
      display_name,
      title,
      is_featured,
      featured_at,
      is_active,
      deactivated_at,
      total_bookings,
      rating_average,
      years_experience
    `)
    .order('is_active', { ascending: false })
    .order('total_bookings', { ascending: false, nullsFirst: false });
  
  // 4. Handle error state
  if (stylistsError || !stylists) {
    return (
      <DashboardLayout title="Featured Stylists" sidebar={<AdminSidebar />}>
        <div className="rounded-2xl border border-red-500/20 bg-red-500/10 p-6">
          <h2 className="text-lg font-semibold text-red-500">Failed to Load Stylists</h2>
          <p className="mt-2 text-sm text-red-400">
            Unable to fetch stylist list. Please refresh the page or try again later.
          </p>
        </div>
      </DashboardLayout>
    );
  }
  
  // 5. Render with client component for interactivity
  return (
    <DashboardLayout title="Featured Stylists" sidebar={<AdminSidebar />}>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold">Featured Stylists Management</h1>
          <p className="mt-2 text-sm text-foreground/70">
            Toggle stylists to feature them on the homepage. Featured stylists will appear in the "Featured Stylists" section.
          </p>
        </div>
        
        <FeaturedStylistsClient stylists={stylists} />
      </div>
    </DashboardLayout>
  );
}
