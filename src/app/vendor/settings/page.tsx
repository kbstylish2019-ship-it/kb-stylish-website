import React from "react";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import dynamic from "next/dynamic";
import PaymentMethodsSettings from "@/components/vendor/PaymentMethodsSettings";

const isTest = process.env.NODE_ENV === "test";

let DashboardLayout: React.ComponentType<any>;

if (isTest) {
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

export default async function VendorSettingsPage() {
  // 1. Verify authentication
  const supabase = await createClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  
  if (userError || !user) {
    redirect('/auth/login?redirect=/vendor/settings');
  }
  
  // 2. Verify vendor role
  const userRoles = user.user_metadata?.user_roles || user.app_metadata?.user_roles || [];
  if (!userRoles.includes('vendor')) {
    redirect('/');
  }

  // 3. Fetch vendor profile
  const { data: vendorProfile } = await supabase
    .from('vendor_profiles')
    .select('*')
    .eq('user_id', user.id)
    .single();

  return (
    <DashboardLayout title="Settings" sidebar={<VendorSidebar />}>
      {/* Back Button */}
      <div className="mb-6">
        <Link 
          href="/vendor/dashboard"
          className="inline-flex items-center gap-2 text-sm text-foreground/70 hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Dashboard
        </Link>
      </div>

      <div className="space-y-6">
        {/* Page Header */}
        <div>
          <h1 className="text-2xl font-bold mb-2">Vendor Settings</h1>
          <p className="text-foreground/70">Manage your payout methods and business information</p>
        </div>

        {/* Payment Methods Section */}
        <PaymentMethodsSettings
          vendorProfile={vendorProfile || {
            user_id: user.id,
            bank_account_name: null,
            bank_account_number: null,
            bank_name: null,
            bank_branch: null,
            esewa_number: null,
            khalti_number: null,
          }}
        />
      </div>
    </DashboardLayout>
  );
}
