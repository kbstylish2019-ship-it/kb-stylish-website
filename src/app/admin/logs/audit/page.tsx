import React from "react";
import { redirect } from "next/navigation";
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import DashboardLayout from "@/components/layout/DashboardLayout";
import AdminSidebar from "@/components/admin/AdminSidebar";
import AuditLogsClient from "@/components/admin/AuditLogsClient";

/**
 * Helper to create Supabase server client
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

/**
 * Admin Audit Logs Page
 * Server Component - handles auth check and role verification
 * 
 * Access Levels:
 * - Admin: Can view governance & configuration logs (excluding own actions)
 * - Auditor: Can view all logs except own actions
 * - Super Auditor: Unrestricted access to all audit logs
 */
export default async function AuditLogsPage() {
  // 1. Get user session and verify authentication
  const supabase = await createClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  
  if (userError || !user) {
    redirect('/auth/login?redirect=/admin/logs/audit');
  }
  
  // 2. Verify privileged role (admin, auditor, or super_auditor)
  const { data: isAdmin } = await supabase.rpc('user_has_role', {
    user_uuid: user.id,
    role_name: 'admin'
  });

  const { data: isAuditor } = await supabase.rpc('user_has_role', {
    user_uuid: user.id,
    role_name: 'auditor'
  });

  const { data: isSuperAuditor } = await supabase.rpc('user_has_role', {
    user_uuid: user.id,
    role_name: 'super_auditor'
  });
  
  if (!isAdmin && !isAuditor && !isSuperAuditor) {
    redirect('/'); // Non-privileged users redirected to home
  }
  
  // 3. Render the UI (Client Component handles data fetching and interactivity)
  return (
    <DashboardLayout 
      title="Audit Logs" 
      sidebar={<AdminSidebar />}
    >
      <div className="max-w-7xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold">Audit Logs</h1>
          <p className="text-sm text-foreground/60 mt-1">
            View administrative actions and governance events with role-based access
          </p>
        </div>
        
        <AuditLogsClient />
      </div>
    </DashboardLayout>
  );
}
