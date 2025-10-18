import React from "react";
import dynamic from "next/dynamic";
import { redirect } from "next/navigation";
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import AdminSidebar from "@/components/admin/AdminSidebar";
import SpecialtiesClient from "@/components/admin/SpecialtiesClient";

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

export default async function SpecialtiesManagementPage() {
  // 1. Verify authentication
  const supabase = await createClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  
  if (userError || !user) {
    redirect('/auth/login?redirect=/admin/curation/specialties');
  }
  
  // 2. Verify admin role
  const userRoles = user.user_metadata?.user_roles || user.app_metadata?.user_roles || [];
  if (!userRoles.includes('admin')) {
    redirect('/');
  }
  
  // 3. Fetch all specialty types
  const { data: specialties, error: specialtiesError } = await supabase
    .from('specialty_types')
    .select('*')
    .order('display_order', { ascending: true });
  
  // 4. Handle error state
  if (specialtiesError || !specialties) {
    return (
      <DashboardLayout title="Manage Specialties" sidebar={<AdminSidebar />}>
        <div className="rounded-2xl border border-red-500/20 bg-red-500/10 p-6">
          <h2 className="text-lg font-semibold text-red-500">Failed to Load Specialties</h2>
          <p className="mt-2 text-sm text-red-400">
            Unable to fetch specialty list. Please refresh the page or try again later.
          </p>
        </div>
      </DashboardLayout>
    );
  }
  
  // 5. Render with client component
  return (
    <DashboardLayout title="Manage Specialties" sidebar={<AdminSidebar />}>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold">Specialty Types Management</h1>
          <p className="mt-2 text-sm text-foreground/70">
            Manage specialty types that stylists can be assigned to. These are used for filtering and discovery.
          </p>
        </div>
        
        <SpecialtiesClient specialties={specialties} />
      </div>
    </DashboardLayout>
  );
}
