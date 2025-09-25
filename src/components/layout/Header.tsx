import React from "react";
import Link from "next/link";
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
  if (capabilities.canAccessAdmin) caps.push("admin_access");
  if (capabilities.canAccessVendorDashboard) caps.push("vendor_access");
  if (capabilities.canViewProfile) caps.push("view_profile");
  if (capabilities.canBookServices) caps.push("view_bookings");
  // Add other mappings as needed based on existing UserCapability types
  caps.push("view_shop", "view_about", "view_cart");
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
    <header className="sticky top-0 z-50 border-b border-white/10 bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      {/* Top accent bar */}
      <div
        className="h-[2px] bg-gradient-to-r from-[var(--kb-primary-brand)] via-[var(--kb-accent-gold)] to-[var(--kb-primary-brand)] opacity-70"
        aria-hidden
      />

      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          {/* Brand */}
          <Link href="/" className="group inline-flex items-center gap-2">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-[var(--kb-primary-brand)]/15 ring-1 ring-[var(--kb-primary-brand)]/30 group-hover:ring-[var(--kb-primary-brand)]/50 transition">
              <svg
                className="h-5 w-5 text-[var(--kb-primary-brand)]"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <circle cx="6" cy="6" r="3" />
                <circle cx="6" cy="18" r="3" />
                <line x1="20" y1="7" x2="8.12" y2="12.47" />
                <line x1="8.12" y1="11.53" x2="20" y2="17" />
                <line x1="14.47" y1="12" x2="20" y2="12" />
              </svg>
            </span>
            <span className="text-lg font-semibold tracking-tight">KB Stylish</span>
          </Link>

          {/* Desktop Nav */}
          <nav className="hidden md:flex items-center gap-6">
            {primaryNav.map((item) => (
              <Link
                key={item.id}
                href={item.href}
                className={cn(
                  "text-sm font-medium text-foreground/80 hover:text-foreground transition-colors",
                  item.emphasis === "cta" &&
                    "relative text-foreground before:absolute before:inset-x-0 before:-bottom-1 before:h-[2px] before:bg-gradient-to-r before:from-[var(--kb-primary-brand)] before:via-[var(--kb-accent-gold)] before:to-[var(--kb-primary-brand)] before:opacity-70"
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
    </header>
  );
}
