import React from "react";
import dynamic from "next/dynamic";
import { redirect } from "next/navigation";
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import AdminSidebar from "@/components/admin/AdminSidebar";
import { fetchAdminVendorsList } from "@/lib/apiClient";
import VendorsPageClient from "@/components/admin/VendorsPageClient";

const isTest = process.env.NODE_ENV === "test";

let DashboardLayout: React.ComponentType<any>;

if (isTest) {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  DashboardLayout = require("@/components/layout/DashboardLayout").default;
} else {
  DashboardLayout = dynamic(() => import("@/components/layout/DashboardLayout"));
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

export default async function AdminVendorsPage() {
  // 1. Verify authentication
  const supabase = await createClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  
  if (userError || !user) {
    redirect('/auth/login?redirect=/admin/vendors');
  }
  
  // 2. Verify admin role
  const userRoles = user.user_metadata?.user_roles || user.app_metadata?.user_roles || [];
  if (!userRoles.includes('admin')) {
    redirect('/'); // Non-admins redirected to home
  }
  
  // 3. Fetch initial vendors (first page)
  const vendorsData = await fetchAdminVendorsList({ page: 1, per_page: 20 });
  
  // 4. Handle error state
  if (!vendorsData) {
    return (
      <DashboardLayout title="Vendors" sidebar={<AdminSidebar />}>
        <div className="rounded-2xl border border-red-500/20 bg-red-500/10 p-6">
          <h2 className="text-lg font-semibold text-red-500">Failed to Load Vendors</h2>
          <p className="mt-2 text-sm text-red-400">
            Unable to fetch vendor list. Please refresh the page or try again later.
          </p>
        </div>
      </DashboardLayout>
    );
  }
  
  // 5. Render with client component for interactivity
  return (
    <DashboardLayout title="Vendors" sidebar={<AdminSidebar />}>
      <VendorsPageClient initialData={vendorsData} />
    </DashboardLayout>
  );
}
