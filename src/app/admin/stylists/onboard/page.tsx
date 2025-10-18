import React from "react";
import { redirect } from "next/navigation";
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import DashboardLayout from "@/components/layout/DashboardLayout";
import AdminSidebar from "@/components/admin/AdminSidebar";
import OnboardingWizardClient from "@/components/admin/OnboardingWizardClient";

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

/**
 * Admin Stylist Onboarding Page
 * Server Component - handles auth check, then delegates to Client Component for wizard
 */
export default async function StylistOnboardPage() {
  // 1. Get user session and verify authentication
  const supabase = await createClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  
  if (userError || !user) {
    redirect('/auth/login?redirect=/admin/stylists/onboard');
  }
  
  // 2. Verify admin role
  const { data: isAdmin } = await supabase.rpc('user_has_role', {
    user_uuid: user.id,
    role_name: 'admin'
  });
  
  if (!isAdmin) {
    redirect('/'); // Non-admins redirected to home
  }
  
  // 3. Render the wizard (Client Component)
  return (
    <DashboardLayout 
      title="Onboard New Stylist" 
      sidebar={<AdminSidebar />}
    >
      <div className="max-w-4xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold">Stylist Onboarding Wizard</h1>
          <p className="text-sm text-foreground/60 mt-1">
            Promote a user to stylist with full verification workflow
          </p>
        </div>
        
        <OnboardingWizardClient />
      </div>
    </DashboardLayout>
  );
}
