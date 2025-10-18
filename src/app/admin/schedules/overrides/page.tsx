import React from "react";
import { redirect } from "next/navigation";
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import DashboardLayout from "@/components/layout/DashboardLayout";
import AdminSidebar from "@/components/admin/AdminSidebar";
import ScheduleOverridesClient from "@/components/admin/ScheduleOverridesClient";

// Helper to create Supabase server client
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

// Type definition for override
interface ScheduleOverride {
  id: string;
  override_type: string;
  applies_to_all_stylists: boolean;
  stylist_user_id: string | null;
  start_date: string;
  end_date: string;
  override_start_time: string | null;
  override_end_time: string | null;
  is_closed: boolean;
  priority: number;
  reason: string | null;
  created_at: string;
  stylist_display_name?: string | null;
}

interface Stylist {
  user_id: string;
  display_name: string;
  title: string | null;
}

/**
 * Admin Schedule Overrides Page
 * Server Component - handles auth check and data fetching
 */
export default async function ScheduleOverridesPage() {
  // 1. Get user session and verify authentication
  const supabase = await createClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  
  if (userError || !user) {
    redirect('/auth/login?redirect=/admin/schedules/overrides');
  }
  
  // 2. Verify admin role
  const { data: isAdmin } = await supabase.rpc('user_has_role', {
    user_uuid: user.id,
    role_name: 'admin'
  });
  
  if (!isAdmin) {
    redirect('/'); // Non-admins redirected to home
  }
  
  // 3. Fetch existing schedule overrides with stylist names
  const { data: overrides, error: overridesError } = await supabase
    .from('schedule_overrides')
    .select(`
      *,
      stylist_profiles!stylist_user_id (
        display_name
      )
    `)
    .order('start_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(100);

  const overridesWithNames: ScheduleOverride[] = (overrides || []).map(override => ({
    id: override.id,
    override_type: override.override_type,
    applies_to_all_stylists: override.applies_to_all_stylists,
    stylist_user_id: override.stylist_user_id,
    start_date: override.start_date,
    end_date: override.end_date,
    override_start_time: override.override_start_time,
    override_end_time: override.override_end_time,
    is_closed: override.is_closed,
    priority: override.priority,
    reason: override.reason,
    created_at: override.created_at,
    stylist_display_name: (override as any).stylist_profiles?.display_name || null
  }));

  // 4. Fetch active stylists for dropdown
  const { data: stylists } = await supabase
    .from('stylist_profiles')
    .select('user_id, display_name, title')
    .eq('is_active', true)
    .order('display_name');

  // 5. Render the UI (Client Component)
  return (
    <DashboardLayout 
      title="Schedule Overrides" 
      sidebar={<AdminSidebar />}
    >
      <div className="max-w-7xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold">Schedule Overrides</h1>
          <p className="text-sm text-foreground/60 mt-1">
            Manage business closures, stylist vacations, and scheduling events
          </p>
        </div>
        
        <ScheduleOverridesClient 
          initialOverrides={overridesWithNames}
          stylists={stylists || []}
        />
      </div>
    </DashboardLayout>
  );
}
