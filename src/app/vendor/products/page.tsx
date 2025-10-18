import React from "react";
import { redirect } from "next/navigation";
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { fetchVendorProductsList } from "@/lib/apiClient";
import ProductsPageClient from "@/components/vendor/ProductsPageClient";
import dynamic from "next/dynamic";

const isTest = process.env.NODE_ENV === "test";

let DashboardLayout: React.ComponentType<any>;

if (isTest) {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  DashboardLayout = require("@/components/layout/DashboardLayout").default;
} else {
  DashboardLayout = dynamic(() => import("@/components/layout/DashboardLayout"));
}

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
        <a
          key={i.id}
          href={i.href}
          className="rounded-lg px-3 py-2 text-foreground/90 hover:bg-white/5 ring-1 ring-transparent hover:ring-white/10"
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

export default async function VendorProductsPage() {
  // 1. Verify authentication
  const supabase = await createClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  
  if (userError || !user) {
    redirect('/auth/login?redirect=/vendor/products');
  }
  
  // 2. Verify vendor role
  const userRoles = user.user_metadata?.user_roles || user.app_metadata?.user_roles || [];
  if (!userRoles.includes('vendor')) {
    redirect('/'); // Non-vendors redirected to home
  }
  
  // 3. Fetch initial products (first page)
  const productsData = await fetchVendorProductsList({ page: 1, per_page: 20 });
  
  // 4. Handle error state
  if (!productsData) {
    return (
      <DashboardLayout title="Products" sidebar={<VendorSidebar />}>
        <div className="rounded-2xl border border-red-500/20 bg-red-500/10 p-6">
          <h2 className="text-lg font-semibold text-red-500">Failed to Load Products</h2>
          <p className="mt-2 text-sm text-red-400">
            Unable to fetch your products. Please refresh the page or try again later.
          </p>
        </div>
      </DashboardLayout>
    );
  }
  
  // 5. Render with client component for interactivity
  return (
    <DashboardLayout title="Products" sidebar={<VendorSidebar />}>
      <ProductsPageClient 
        initialData={productsData}
        userId={user.id}
      />
    </DashboardLayout>
  );
}
