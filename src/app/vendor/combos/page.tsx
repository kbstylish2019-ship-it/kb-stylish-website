import { redirect } from 'next/navigation';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import dynamic from 'next/dynamic';
import { isAuthorizedComboVendor } from '@/lib/constants/combo';
import VendorComboList from '@/components/vendor/VendorComboList';

const DashboardLayout = dynamic(() => import('@/components/layout/DashboardLayout'));

function VendorSidebar() {
  const items = [
    { id: 'dashboard', label: 'Dashboard', href: '/vendor/dashboard' },
    { id: 'products', label: 'Products', href: '/vendor/products' },
    { id: 'combos', label: 'Combos', href: '/vendor/combos' },
    { id: 'orders', label: 'Orders', href: '/vendor/orders' },
    { id: 'payouts', label: 'Payouts', href: '/vendor/payouts' },
    { id: 'settings', label: 'Settings', href: '/vendor/settings' },
  ];
  return (
    <nav className="flex flex-col gap-1 text-sm">
      {items.map((i) => (
        <a
          key={i.id}
          href={i.href}
          className={`rounded-lg px-3 py-2 text-foreground/90 hover:bg-white/5 ring-1 ring-transparent hover:ring-white/10 ${
            i.id === 'combos' ? 'bg-white/10 ring-white/10' : ''
          }`}
        >
          {i.label}
        </a>
      ))}
    </nav>
  );
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
            // Ignore - Server Component limitation
          }
        },
      },
    }
  );
}

export default async function VendorCombosPage() {
  // 1. Verify authentication
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    redirect('/auth/login?redirect=/vendor/combos');
  }

  // 2. Verify vendor role AND KB Stylish authorization
  const userRoles = user.user_metadata?.user_roles || user.app_metadata?.user_roles || [];
  if (!userRoles.includes('vendor')) {
    redirect('/');
  }

  // Only authorized vendors can access combos
  if (!isAuthorizedComboVendor(user.id)) {
    redirect('/vendor/dashboard');
  }

  // 3. Fetch combos for this vendor - specify FK relationship to avoid ambiguity
  const { data: combos, error: combosError } = await supabase
    .from('products')
    .select(
      `
      id,
      name,
      slug,
      description,
      is_active,
      is_combo,
      combo_price_cents,
      combo_savings_cents,
      combo_quantity_limit,
      combo_quantity_sold,
      created_at,
      combo_items!combo_items_combo_product_id_fkey (
        id,
        constituent_variant_id,
        quantity,
        display_order
      )
    `
    )
    .eq('vendor_id', user.id)
    .eq('is_combo', true)
    .order('created_at', { ascending: false });

  if (combosError) {
    console.error('[VendorCombos] Error fetching combos:', combosError);
  }

  return (
    <DashboardLayout title="Combo Products" sidebar={<VendorSidebar />}>
      <VendorComboList initialCombos={combos || []} vendorId={user.id} />
    </DashboardLayout>
  );
}
