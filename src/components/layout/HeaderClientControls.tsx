"use client";

import React from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { cn } from "@/lib/utils";
import useDecoupledCartStore from '@/lib/store/decoupledCartStore';
import { signOut } from "@/app/actions/auth";

// In tests, resolve icons/AuthModal synchronously to avoid next/dynamic mocks returning null
const isTest = process.env.NODE_ENV === "test";
let MenuIcon: React.ComponentType<any>;
let XIcon: React.ComponentType<any>;
let LogInIcon: React.ComponentType<any>;
let LogOutIcon: React.ComponentType<any>;
let UserIcon: React.ComponentType<any>;
let ChevronDownIcon: React.ComponentType<any>;
let ShoppingCartIcon: React.ComponentType<any>;
let AuthModal: React.ComponentType<any>;

if (isTest) {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const icons = require("lucide-react");
  MenuIcon = icons.Menu;
  XIcon = icons.X;
  LogInIcon = icons.LogIn;
  LogOutIcon = icons.LogOut;
  UserIcon = icons.User;
  ChevronDownIcon = icons.ChevronDown;
  ShoppingCartIcon = icons.ShoppingCart;
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const AM = require("@/components/features/AuthModal");
  AuthModal = (AM.default ?? AM) as React.ComponentType<any>;
} else {
  // Lazy-load icons
  MenuIcon = dynamic(() => import("lucide-react").then((m) => m.Menu), { ssr: false }) as any;
  XIcon = dynamic(() => import("lucide-react").then((m) => m.X), { ssr: false }) as any;
  LogInIcon = dynamic(() => import("lucide-react").then((m) => m.LogIn), { ssr: false }) as any;
  LogOutIcon = dynamic(() => import("lucide-react").then((m) => m.LogOut), { ssr: false }) as any;
  UserIcon = dynamic(() => import("lucide-react").then((m) => m.User), { ssr: false }) as any;
  ChevronDownIcon = dynamic(() => import("lucide-react").then((m) => m.ChevronDown), { ssr: false }) as any;
  ShoppingCartIcon = dynamic(() => import("lucide-react").then((m) => m.ShoppingCart), { ssr: false }) as any;
  // Lazy load AuthModal only when opened
  AuthModal = dynamic(() => import("@/components/features/AuthModal"), {
    loading: () => null,
    ssr: false,
  }) as any;
}

// Cart store is client-side
export type PrimaryNavItem = { id: string; href: string; label: string; emphasis?: string };

export default function HeaderClientControls({
  isAuthed,
  primaryNav,
  profileNav,
  showCart,
}: {
  isAuthed: boolean;
  primaryNav: PrimaryNavItem[];
  profileNav: PrimaryNavItem[];
  showCart: boolean;
}) {
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const [authOpen, setAuthOpen] = React.useState(false);
  const [profileOpen, setProfileOpen] = React.useState(false);
  // Avoid SSR/client markup mismatch: only show client-derived UI (badge) after mount
  const [hasHydrated, setHasHydrated] = React.useState(isTest);
  React.useEffect(() => {
    setHasHydrated(true);
  }, []);
  // Use the new decoupled store - get total items (products + bookings)
  const cartCount = useDecoupledCartStore((state) => state.totalItems);

  return (
    <>
      <div className="flex items-center gap-3">
        {showCart && (
          <Link
            href="/checkout"
            aria-label="Cart"
            className="relative inline-flex h-9 w-9 items-center justify-center rounded-full ring-1 ring-white/10 hover:bg-white/5"
            data-testid="cart-button"
          >
            <ShoppingCartIcon className="h-5 w-5" />
            {hasHydrated && cartCount > 0 && (
              <span
                data-testid="cart-badge"
                className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-[var(--kb-accent-gold)] text-black text-[11px] leading-[18px] font-bold text-center shadow"
              >
                {cartCount > 99 ? "99+" : cartCount}
              </span>
            )}
          </Link>
        )}
        {!isAuthed ? (
          <button
            onClick={() => setAuthOpen(true)}
            className="hidden sm:inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold text-foreground shadow-sm ring-1 ring-white/10 transition bg-gradient-to-r from-[color-mix(in_oklab,var(--kb-primary-brand)_75%,black)] to-[var(--kb-primary-brand)] hover:from-[var(--kb-primary-brand)] hover:to-[var(--kb-primary-brand)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--kb-accent-gold)]"
          >
            <LogInIcon className="h-4 w-4" aria-hidden />
            <span>Login / Register</span>
          </button>
        ) : (
          <div className="relative hidden sm:block">
            <button
              onClick={() => setProfileOpen((s) => !s)}
              aria-haspopup="menu"
              aria-expanded={profileOpen}
              className="inline-flex items-center gap-2 rounded-full px-3 py-2 text-sm font-medium ring-1 ring-white/10 hover:bg-white/5"
            >
              <UserIcon className="h-4 w-4" />
              <span>Profile</span>
              <ChevronDownIcon className="h-4 w-4" />
            </button>
            <div
              role="menu"
              className={cn(
                "absolute right-0 mt-2 w-56 overflow-hidden rounded-xl border border-white/10 bg-background/95 backdrop-blur shadow-xl",
                profileOpen ? "opacity-100" : "pointer-events-none opacity-0"
              )}
            >
              <div className="p-2">
                {profileNav.map((item) => (
                  <Link
                    key={item.id}
                    href={item.href}
                    className="block rounded-lg px-3 py-2 text-sm text-foreground/90 hover:bg-white/5"
                    onClick={() => setProfileOpen(false)}
                  >
                    {item.label}
                  </Link>
                ))}
                <div className="border-t border-white/10 mt-2 pt-2">
                  <form action={async () => {
                    // Don't clear the cart - preserve guest items
                    // The server will handle user-specific cleanup
                    await signOut();
                  }}>
                    <button
                      type="submit"
                      className="w-full flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-foreground/90 hover:bg-white/5 text-left"
                      data-testid="logout-button"
                    >
                      <LogOutIcon className="h-4 w-4" />
                      Log Out
                    </button>
                  </form>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Mobile Toggle */}
        <button
          type="button"
          aria-label="Toggle menu"
          aria-expanded={mobileOpen}
          aria-controls="kb-mobile-nav"
          onClick={() => setMobileOpen((s) => !s)}
          className="inline-flex md:hidden items-center justify-center rounded-md p-2 text-foreground hover:bg-white/5 ring-1 ring-white/10"
        >
          {mobileOpen ? <XIcon className="h-5 w-5" /> : <MenuIcon className="h-5 w-5" />}
        </button>
      </div>

      {/* Mobile Sheet */}
      <div
        id="kb-mobile-nav"
        className={cn(
          "md:hidden fixed inset-x-0 top-[66px] z-40 origin-top rounded-b-2xl border-t border-white/10 bg-background/95 backdrop-blur px-4 pb-6 pt-4 shadow-xl transition-all",
          mobileOpen ? "pointer-events-auto scale-100 opacity-100" : "pointer-events-none scale-95 opacity-0"
        )}
      >
        <nav className="flex flex-col gap-2">
          {primaryNav.map((item) => (
            <Link
              key={`m-${item.id}`}
              href={item.href}
              className={cn(
                "rounded-lg px-3 py-3 text-base font-medium text-foreground/90 hover:bg-white/5",
                item.emphasis === "cta" &&
                  "ring-1 ring-[var(--kb-primary-brand)]/40 bg-[var(--kb-primary-brand)]/10"
              )}
              onClick={() => setMobileOpen(false)}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </div>

      <AuthModal open={authOpen} onClose={() => setAuthOpen(false)} />
    </>
  );
}
