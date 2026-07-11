import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createServerClient } from '@supabase/ssr';
import DashboardLayout from '@/components/layout/DashboardLayout';
import AdminSidebar from '@/components/admin/AdminSidebar';
import CrmClient from '@/components/admin/CrmClient';
import { fetchAdminCrmStats } from '@/lib/crmApi';

export const metadata = {
  title: 'CRM & Loyalty | KB Stylish Admin',
};

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

export default async function AdminCrmPage() {
  const supabase = await createClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();

  if (userError || !user) {
    redirect('/auth/login?redirect=/admin/crm');
  }

  const userRoles = user.user_metadata?.user_roles || user.app_metadata?.user_roles || [];
  if (!userRoles.includes('admin')) {
    redirect('/');
  }

  const { data: { session } } = await supabase.auth.getSession();
  const stats = session ? await fetchAdminCrmStats(session.access_token) : null;

  if (!stats) {
    return (
      <DashboardLayout title="CRM & Loyalty" sidebar={<AdminSidebar />}>
        <div className="rounded-2xl border border-red-200 bg-red-50 p-6">
          <h2 className="text-lg font-semibold text-red-700">Failed to Load CRM</h2>
          <p className="mt-2 text-sm text-red-600">
            Unable to fetch CRM data. Please refresh the page or try again later.
          </p>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout title="CRM & Loyalty" sidebar={<AdminSidebar />}>
      <CrmClient initialStats={stats} />
    </DashboardLayout>
  );
}
