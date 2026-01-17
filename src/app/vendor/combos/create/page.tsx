import { redirect } from 'next/navigation';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import dynamic from 'next/dynamic';
import { isAuthorizedComboVendor } from '@/lib/constants/combo';
import ComboCreationWizard from '@/components/vendor/ComboCreationWizard';

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
            // Ignore
          }
        },
      },
    }
  );
}

export default async function CreateComboPage() {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    redirect('/auth/login?redirect=/vendor/combos/create');
  }

  // Only authorized vendors can create combos
  if (!isAuthorizedComboVendor(user.id)) {
    redirect('/vendor/dashboard');
  }

  // Fetch vendor's products with variants for selection
  const { data: products, error: productsError } = await supabase
    .from('products')
    .select(
      `
      id,
      name,
      slug,
      is_active,
      is_combo,
      product_variants (
        id,
        sku,
        price,
        variant_attribute_values (
          attribute_value_id,
          attribute_values (
            value,
            display_value,
            product_attributes (
              name
            )
          )
        )
      ),
      product_images (
        image_url,
        sort_order
      )
    `
    )
    .eq('vendor_id', user.id)
    .eq('is_combo', false)
    .eq('is_active', true)
    .order('name');

  if (productsError) {
    console.error('[CreateCombo] Error fetching products:', productsError);
  }
  
  console.log('[CreateCombo] Fetched products for vendor:', user.id, 'Count:', products?.length || 0);

  return (
    <DashboardLayout title="Create Combo" sidebar={<VendorSidebar />}>
      <ComboCreationWizard products={products || []} vendorId={user.id} />
    </DashboardLayout>
  );
}
