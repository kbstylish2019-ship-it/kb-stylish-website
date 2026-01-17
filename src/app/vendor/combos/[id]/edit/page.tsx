import { redirect } from 'next/navigation';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import dynamic from 'next/dynamic';
import { isAuthorizedComboVendor } from '@/lib/constants/combo';

const DashboardLayout = dynamic(() => import('@/components/layout/DashboardLayout'));
const ComboEditForm = dynamic(() => import('@/components/vendor/ComboEditForm'));

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

export default async function EditComboPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const { id } = params;

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

  // 3. Fetch combo details with constituents
  const { data: combo, error: comboError } = await supabase
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
        constituent_product_id,
        constituent_variant_id,
        quantity,
        display_order,
        products!combo_items_constituent_product_id_fkey (
          id,
          name,
          slug
        ),
        product_variants!combo_items_constituent_variant_id_fkey (
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
        )
      )
    `
    )
    .eq('id', id)
    .eq('vendor_id', user.id)
    .eq('is_combo', true)
    .single();

  if (comboError || !combo) {
    console.error('[EditCombo] Error fetching combo:', comboError);
    redirect('/vendor/combos');
  }

  return (
    <DashboardLayout title={`Edit Combo: ${combo.name}`} sidebar={<VendorSidebar />}>
      <ComboEditForm combo={combo} vendorId={user.id} />
    </DashboardLayout>
  );
}