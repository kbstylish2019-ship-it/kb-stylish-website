import React from "react";
import Link from "next/link";
import Image from "next/image";
import dynamic from "next/dynamic";
import { cn } from "@/lib/utils";
import type { UserCapability } from "@/lib/types";
import { getCurrentUser } from '@/lib/auth';
import { filterNav } from '@/lib/nav';

// In tests, resolve HeaderClientControls synchronously to avoid next/dynamic mocks returning null
const isTest = process.env.NODE_ENV === "test";
let HeaderClientControls: React.ComponentType<any>;
if (isTest) {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const HCC = require("./HeaderClientControls");
  HeaderClientControls = (HCC.default ?? HCC) as React.ComponentType<any>;
} else {
  HeaderClientControls = dynamic(() => import("./HeaderClientControls"), {
    loading: () => <div className="inline-flex items-center gap-3 h-9" aria-hidden />,
  }) as unknown as React.ComponentType<any>;
}

// Convert capabilities object to legacy capability array format
function capabilitiesToArray(capabilities: any): UserCapability[] {
  const caps: UserCapability[] = [];
  
  // Base capabilities for everyone
  caps.push("view_shop", "view_about", "view_cart");
  
  // Role-based capabilities
  if (capabilities.canAccessAdmin) caps.push("admin_access");
  if (capabilities.canAccessVendorDashboard) caps.push("vendor_access");
  if (capabilities.canAccessStylistDashboard) caps.push("stylist_access");
  if (capabilities.canBookServices) caps.push("view_bookings");
  if (capabilities.canViewProfile) caps.push("view_profile");
  
  // Show "Become a Vendor" to non-vendors only
  // This includes guests, customers, stylists, and admins (but not existing vendors)
  if (!capabilities.canAccessVendorDashboard) {
    caps.push("apply_vendor");
  }
  
  return caps;
}

export interface HeaderProps {
  // optional compatibility prop (store value is used internally)
  cartItemCount?: number;
}

export default async function Header({ }: HeaderProps) {
  // Get current user and capabilities from server-side auth
  const user = await getCurrentUser();
  const capabilities = user ? capabilitiesToArray(user.capabilities) : ["view_shop", "view_about", "apply_vendor", "view_cart"] as UserCapability[];
  
  // Add authenticated capability if user exists
  if (user) {
    capabilities.push("authenticated");
  }
  
  const isAuthed = capabilities.includes("authenticated");
  const primaryNav = filterNav(capabilities, "primary");
  const profileNav = filterNav(capabilities, "profile");
  const utilityNav = filterNav(capabilities, "utility");
  const cartNavItem = utilityNav.find((item) => item.id === "cart");

  return (
    <header className="sticky top-0 z-50 bg-[var(--kb-primary-brand)] text-white shadow-lg">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          {/* Brand */}
          <Link href="/" className="group inline-flex items-center gap-3">
            <div className="relative h-10 w-10 overflow-hidden rounded-full bg-white/10 ring-1 ring-white/30 group-hover:ring-white/50 transition">
              <Image
                src="/kbstylishlogo.png"
                alt="KB Stylish Logo"
                fill
                className="object-cover"
                priority
              />
            </div>
            <span className="text-lg font-semibold tracking-tight">KB Stylish</span>
          </Link>

          {/* Desktop Nav */}
          <nav className="hidden md:flex items-center gap-6">
            {primaryNav.map((item) => (
              <Link
                key={item.id}
                href={item.href}
                className={cn(
                  "text-sm font-medium text-white/90 hover:text-white transition-colors",
                  item.emphasis === "cta" &&
                    "relative text-white before:absolute before:inset-x-0 before:-bottom-1 before:h-[2px] before:bg-[var(--kb-accent-gold)]"
                )}
              >
                {item.label}
              </Link>
            ))}
          </nav>

          {/* Right Actions (client) */}
          <HeaderClientControls
            isAuthed={isAuthed}
            primaryNav={primaryNav}
            profileNav={profileNav}
            showCart={Boolean(cartNavItem)}
          />
        </div>
      </div>
      {/* Strong bottom accent bar for separation */}
      <div className="h-[4px] bg-[var(--kb-accent-gold)]" aria-hidden />
    </header>
  );
}
