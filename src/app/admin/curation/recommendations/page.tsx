import React from "react";
import dynamic from "next/dynamic";
import { redirect } from "next/navigation";
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import AdminSidebar from "@/components/admin/AdminSidebar";
import RecommendationsClient from "@/components/admin/RecommendationsClient";

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

export default async function RecommendationsPage() {
  // 1. Verify authentication
  const supabase = await createClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  
  if (userError || !user) {
    redirect('/auth/login?redirect=/admin/curation/recommendations');
  }
  
  // 2. Verify admin role
  const userRoles = user.user_metadata?.user_roles || user.app_metadata?.user_roles || [];
  if (!userRoles.includes('admin')) {
    redirect('/'); // Non-admins redirected to home
  }
  
  // 3. Render with client component for interactivity
  return (
    <DashboardLayout title="Product Recommendations" sidebar={<AdminSidebar />}>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold">Product Recommendations</h1>
          <p className="mt-2 text-sm text-foreground/70">
            Manage "Complete the Look" recommendations. Select a source product and add recommended products.
          </p>
        </div>
        
        <RecommendationsClient />
      </div>
    </DashboardLayout>
  );
}
