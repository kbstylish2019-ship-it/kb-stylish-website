import React from 'react';
import { redirect } from 'next/navigation';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import dynamic from 'next/dynamic';
import Link from 'next/link';

// Use dynamic import for client component
const VendorOrdersClient = dynamic(() => import('@/components/vendor/VendorOrdersClient'));

// Sidebar navigation
function VendorSidebar() {
  const items = [
    { id: "dashboard", label: "Dashboard", href: "/vendor/dashboard" },
    { id: "products", label: "Products", href: "/vendor/products" },
    { id: "orders", label: "Orders", href: "/vendor/orders" },
    { id: "payouts", label: "Payouts", href: "/vendor/payouts" },
    { id: "analytics", label: "Analytics", href: "/vendor/analytics" },
    { id: "support", label: "Support", href: "/vendor/support" },
    { id: "settings", label: "Settings", href: "/vendor/settings" },
  ];
  return (
    <nav className="flex flex-col gap-1 text-sm">
      {items.map((i) => (
        <Link
          key={i.id}
          href={i.href}
          className="rounded-lg px-3 py-2 text-foreground/90 hover:bg-white/5 ring-1 ring-transparent hover:ring-white/10"
        >
          {i.label}
        </Link>
      ))}
    </nav>
  );
}

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
            // Ignore - Server Component limitation
          }
        },
      },
    }
  );
}

// Use real DashboardLayout in tests
const isTest = process.env.NODE_ENV === "test";
let DashboardLayout: React.ComponentType<any>;
if (isTest) {
  DashboardLayout = require("@/components/layout/DashboardLayout").default;
} else {
  DashboardLayout = dynamic(() => import("@/components/layout/DashboardLayout"));
}

export default async function VendorOrdersPage() {
  const supabase = await createClient();

  // Check authentication
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/auth/login');
  }

  // Verify vendor role
  const { data: roles } = await supabase
    .from('user_roles')
    .select('role:roles(name)')
    .eq('user_id', user.id)
    .eq('is_active', true);

  const hasVendorRole = roles?.some((r: any) => r.role?.name === 'vendor');

  if (!hasVendorRole) {
    redirect('/');
  }

  // Fetch vendor's orders (orders containing their products)
  // Note: Using regular join (not !inner) to bypass RLS on orders table
  // The vendor_id filter on order_items already ensures we only get this vendor's orders
  const { data: orderItems, error } = await supabase
    .from('order_items')
    .select(`
      id,
      order_id,
      product_name,
      variant_sku,
      quantity,
      unit_price_cents,
      total_price_cents,
      fulfillment_status,
      created_at,
      orders (
        id,
        order_number,
        status,
        total_cents,
        currency,
        shipping_name,
        shipping_phone,
        shipping_address_line1,
        shipping_address_line2,
        shipping_city,
        shipping_state,
        shipping_postal_code,
        shipping_country,
        created_at,
        confirmed_at,
        shipped_at,
        delivered_at
      )
    `)
    .eq('vendor_id', user.id)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching orders:', error);
  }
  
  // Debug log to see what we got
  console.log('[Orders Page] Fetched order items:', orderItems?.length || 0, 'items');
  if (orderItems && orderItems.length > 0) {
    console.log('[Orders Page] First item structure:', JSON.stringify(orderItems[0], null, 2));
  }

  return (
    <DashboardLayout title="Orders" sidebar={<VendorSidebar />}>
      <VendorOrdersClient orderItems={orderItems || []} />
    </DashboardLayout>
  );
}
