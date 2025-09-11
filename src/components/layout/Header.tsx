"use client";

import React from "react";
import Link from "next/link";
import { Menu, X, Scissors, LogIn, User, ChevronDown, ShoppingCart } from "lucide-react";
import { cn } from "@/lib/utils";
import type { UserCapability } from "@/lib/types";
import { filterNav } from "@/lib/nav";
import AuthModal from "@/components/features/AuthModal";
import { useCartStore } from "@/lib/store/cartStore";

export interface HeaderProps {
  capabilities: UserCapability[];
  // optional compatibility prop (store value is used internally)
  cartItemCount?: number;
}

export default function Header({ capabilities }: HeaderProps) {
  const cartItemCount = useCartStore((state) => state.getItemCount());
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const [authOpen, setAuthOpen] = React.useState(false);
  const [profileOpen, setProfileOpen] = React.useState(false);
  const [isClient, setIsClient] = React.useState(false);

  React.useEffect(() => {
    setIsClient(true);
  }, []);

  const isAuthed = capabilities.includes("authenticated");
  const primaryNav = filterNav(capabilities, "primary");
  const profileNav = filterNav(capabilities, "profile");
  const utilityNav = filterNav(capabilities, "utility");
  const cartItem = utilityNav.find((i) => i.id === "cart");

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
          <a href="/" className="group inline-flex items-center gap-2">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-[var(--kb-primary-brand)]/15 ring-1 ring-[var(--kb-primary-brand)]/30 group-hover:ring-[var(--kb-primary-brand)]/50 transition">
              <Scissors className="h-5 w-5 text-[var(--kb-primary-brand)]" aria-hidden />
            </span>
            <span className="text-lg font-semibold tracking-tight">KB Stylish</span>
          </a>

          {/* Desktop Nav */}
          <nav className="hidden md:flex items-center gap-6">
            {primaryNav.map((item) => (
              <a
                key={item.id}
                href={item.href}
                className={cn(
                  "text-sm font-medium text-foreground/80 hover:text-foreground transition-colors",
                  item.emphasis === "cta" &&
                    "relative text-foreground before:absolute before:inset-x-0 before:-bottom-1 before:h-[2px] before:bg-gradient-to-r before:from-[var(--kb-primary-brand)] before:via-[var(--kb-accent-gold)] before:to-[var(--kb-primary-brand)] before:opacity-70"
                )}
              >
                {item.label}
              </a>
            ))}
          </nav>

          {/* Right Actions */}
          <div className="flex items-center gap-3">
            {cartItem && (
              <Link
                href="/checkout"
                aria-label="Cart"
                className="relative inline-flex h-9 w-9 items-center justify-center rounded-full ring-1 ring-white/10 hover:bg-white/5"
                data-testid="cart-button"
              >
                <ShoppingCart className="h-5 w-5" />
                {isClient && cartItemCount > 0 && (
                  <span
                    data-testid="cart-badge"
                    className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-[var(--kb-accent-gold)] text-black text-[11px] leading-[18px] font-bold text-center shadow"
                  >
                    {cartItemCount > 99 ? "99+" : cartItemCount}
                  </span>
                )}
              </Link>
            )}
            {!isAuthed ? (
              <button
                onClick={() => setAuthOpen(true)}
                className="hidden sm:inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold text-foreground shadow-sm ring-1 ring-white/10 transition bg-gradient-to-r from-[color-mix(in_oklab,var(--kb-primary-brand)_75%,black)] to-[var(--kb-primary-brand)] hover:from-[var(--kb-primary-brand)] hover:to-[var(--kb-primary-brand)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--kb-accent-gold)]"
              >
                <LogIn className="h-4 w-4" aria-hidden />
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
                  <User className="h-4 w-4" />
                  <span>Profile</span>
                  <ChevronDown className="h-4 w-4" />
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
                      <a
                        key={item.id}
                        href={item.href}
                        className="block rounded-lg px-3 py-2 text-sm text-foreground/90 hover:bg-white/5"
                        onClick={() => setProfileOpen(false)}
                      >
                        {item.label}
                      </a>
                    ))}
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
              {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>
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
            <a
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
            </a>
          ))}

          {!isAuthed ? (
            <button
              onClick={() => {
                setAuthOpen(true);
                setMobileOpen(false);
              }}
              className="mt-2 inline-flex items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-[var(--kb-primary-brand)] to-[color-mix(in_oklab,var(--kb-primary-brand)_70%,black)] px-4 py-3 text-base font-semibold text-foreground shadow-sm ring-1 ring-white/10"
            >
              <LogIn className="h-4 w-4" aria-hidden />
              Login / Register
            </button>
          ) : (
            <div className="mt-2 rounded-xl border border-white/10 p-2">
              {profileNav.map((item) => (
                <a
                  key={`mp-${item.id}`}
                  href={item.href}
                  className="block rounded-lg px-3 py-2 text-base font-medium hover:bg-white/5"
                  onClick={() => setMobileOpen(false)}
                >
                  {item.label}
                </a>
              ))}
            </div>
          )}
        </nav>
      </div>
      <AuthModal open={authOpen} onClose={() => setAuthOpen(false)} />
    </header>
  );
}
