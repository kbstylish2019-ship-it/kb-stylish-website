import React from "react";
import dynamic from "next/dynamic";
import { redirect } from "next/navigation";
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import AdminSidebar from "@/components/admin/AdminSidebar";
import FeaturedBrandsClient from "@/components/admin/FeaturedBrandsClient";

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

export default async function FeaturedBrandsPage() {
  // 1. Verify authentication
  const supabase = await createClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  
  if (userError || !user) {
    redirect('/auth/login?redirect=/admin/curation/featured-brands');
  }
  
  // 2. Verify admin role
  const userRoles = user.user_metadata?.user_roles || user.app_metadata?.user_roles || [];
  if (!userRoles.includes('admin')) {
    redirect('/'); // Non-admins redirected to home
  }
  
  // 3. Fetch all brands
  const { data: brands, error: brandsError } = await supabase
    .from('brands')
    .select('id, name, slug, is_featured, logo_url, is_active')
    .eq('is_active', true)
    .order('name');
  
  // 4. Handle error state
  if (brandsError || !brands) {
    return (
      <DashboardLayout title="Featured Brands" sidebar={<AdminSidebar />}>
        <div className="rounded-2xl border border-red-200 bg-red-50 p-6">
          <h2 className="text-lg font-semibold text-red-700">Failed to Load Brands</h2>
          <p className="mt-2 text-sm text-red-600">
            Unable to fetch brand list. Please refresh the page or try again later.
          </p>
        </div>
      </DashboardLayout>
    );
  }
  
  // 5. Render with client component for interactivity
  return (
    <DashboardLayout title="Featured Brands" sidebar={<AdminSidebar />}>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Featured Brands Management</h1>
          <p className="mt-2 text-sm text-gray-600">
            Toggle brands to feature them on the homepage. Featured brands will appear in the "Featured Brands" section.
          </p>
        </div>
        
        <FeaturedBrandsClient brands={brands} />
      </div>
    </DashboardLayout>
  );
}
