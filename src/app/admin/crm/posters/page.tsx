import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createServerClient } from '@supabase/ssr';
import PostersClient from '@/components/admin/PostersClient';

export const metadata = {
  title: 'QR Posters | KB Stylish Admin',
};

export default async function PostersPage() {
  const cookieStore = await cookies();
  const supabase = createServerClient(
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

  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) {
    redirect('/auth/login?redirect=/admin/crm/posters');
  }
  const roles = user.user_metadata?.user_roles || user.app_metadata?.user_roles || [];
  if (!roles.includes('admin')) {
    redirect('/');
  }

  const { data: branches } = await supabase
    .from('kb_branches')
    .select('id, name, referral_code')
    .eq('is_active', true)
    .not('referral_code', 'is', null)
    .order('name');

  return <PostersClient branches={branches ?? []} />;
}
