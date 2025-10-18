import React from "react";
import { redirect } from "next/navigation";
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import AdminSidebar from "@/components/admin/AdminSidebar";
import DashboardLayout from "@/components/layout/DashboardLayout";
import ServicesListClient from "@/components/admin/services/ServicesListClient";

/**
 * Admin Services Management Page
 * 
 * Allows admins to:
 * - View all services
 * - Create new services
 * - Edit existing services
 * - Activate/deactivate services
 * - Filter and search services
 */

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

export default async function AdminServicesPage() {
  // ========================================================================
  // AUTHENTICATION & AUTHORIZATION
  // ========================================================================
  
  const supabase = await createClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  
  if (userError || !user) {
    redirect('/login?redirect=/admin/services');
  }
  
  // Verify admin role
  const { data: isAdmin, error: roleError } = await supabase.rpc('user_has_role', {
    user_uuid: user.id,
    role_name: 'admin'
  });
  
  if (roleError || !isAdmin) {
    redirect('/?error=unauthorized');
  }

  // ========================================================================
  // RENDER
  // ========================================================================
  
  return (
    <DashboardLayout sidebar={<AdminSidebar />}>
      <ServicesListClient />
    </DashboardLayout>
  );
}
