import React from "react";
import { redirect } from "next/navigation";
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import DashboardLayout from "@/components/layout/DashboardLayout";
import AdminSidebar from "@/components/admin/AdminSidebar";
import ScheduleManagementClient from "@/components/admin/ScheduleManagementClient";

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

/**
 * Admin Schedule Management Page
 * 
 * Allows admins to create and manage stylist base schedules
 */
export default async function AdminScheduleManagePage() {
  // ========================================================================
  // AUTHENTICATION & AUTHORIZATION
  // ========================================================================
  
  const supabase = await createClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();

  if (userError || !user) {
    redirect('/auth/login?redirect=/admin/schedules/manage');
  }

  const { data: isAdmin, error: roleError } = await supabase.rpc('user_has_role', {
    user_uuid: user.id,
    role_name: 'admin'
  });

  if (roleError || !isAdmin) {
    redirect('/?error=unauthorized');
  }

  // ========================================================================
  // FETCH INITIAL DATA
  // ========================================================================
  
  const { data: schedules, error: schedulesError } = await supabase.rpc('admin_get_all_schedules');

  // ========================================================================
  // RENDER
  // ========================================================================

  return (
    <DashboardLayout sidebar={<AdminSidebar />}>
      <div className="max-w-7xl mx-auto p-6">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900">Manage Stylist Schedules</h1>
          <p className="text-gray-600 mt-1">
            Set working hours for each stylist to enable bookings
          </p>
        </div>

        {schedulesError ? (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <p className="text-red-800">Failed to load schedules. Please refresh the page.</p>
          </div>
        ) : (
          <ScheduleManagementClient initialSchedules={schedules || []} />
        )}
      </div>
    </DashboardLayout>
  );
}
