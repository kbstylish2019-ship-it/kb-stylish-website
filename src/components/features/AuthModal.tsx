"use client";

import React, { useRef, useEffect, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import FocusTrap from "focus-trap-react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { signIn, signUp } from "@/app/actions/auth";

export interface AuthModalProps {
  open: boolean;
  onClose: () => void;
}

export default function AuthModal({ open, onClose }: AuthModalProps) {
  const [tab, setTab] = React.useState<"login" | "register">("login");
  const [mounted, setMounted] = React.useState(false);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  // Set initial focus when modal opens
  useEffect(() => {
    if (open && closeButtonRef.current) {
      closeButtonRef.current.focus();
    }
  }, [open]);

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!mounted) return null;

  return createPortal(
    <FocusTrap active={open}>
      <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="kb-auth-title"
      className={cn(
        "fixed inset-0 z-[60] overflow-y-auto transition",
        open ? "opacity-100" : "pointer-events-none opacity-0"
      )}
    >
      {/* Overlay */}
      <div
        className={cn(
          "fixed inset-0 bg-black/60 backdrop-blur-sm",
          open ? "" : "hidden"
        )}
        onClick={onClose}
      />

      {/* Centering wrapper */}
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="relative w-full max-w-md overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-b from-white/10 to-transparent shadow-2xl ring-1 ring-white/10">
          {/* Top gradient accent */}
          <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-[var(--kb-primary-brand)] via-[var(--kb-accent-gold)] to-[var(--kb-primary-brand)]" />

          {/* Header */}
          <div className="flex items-center justify-between px-6 pt-5">
            <div>
              <h2 id="kb-auth-title" className="text-xl font-semibold">
                Welcome to KB Stylish
              </h2>
              <p className="mt-1 text-sm text-foreground/80">
                Sign in or create an account to continue.
              </p>
            </div>
            <button
              ref={closeButtonRef}
              onClick={onClose}
              aria-label="Close"
              className="rounded-md p-2 text-foreground/80 hover:bg-white/10"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Tabs */}
          <div className="mt-4 px-6">
            <div className="inline-flex rounded-full bg-white/5 p-1 ring-1 ring-white/10">
              <button
                onClick={() => setTab("login")}
                className={cn(
                  "rounded-full px-4 py-2 text-sm font-medium",
                  tab === "login" ? "bg-white/10" : "hover:bg-white/5"
                )}
              >
                Login
              </button>
              <button
                onClick={() => setTab("register")}
                className={cn(
                  "rounded-full px-4 py-2 text-sm font-medium",
                  tab === "register" ? "bg-white/10" : "hover:bg-white/5"
                )}
              >
                Register
              </button>
            </div>
          </div>

          {/* Content */}
          <div className="px-6 pb-6 pt-5">
            {tab === "login" ? <LoginForm onClose={onClose} /> : <RegisterForm onClose={onClose} />}
          </div>
        </div>
      </div>
    </div>
    </FocusTrap>,
    document.body
  );
}

const Field = ({ id, label, type = "text", placeholder }: { id: string; label: string; type?: string; placeholder?: string }) => {
  return (
    <label htmlFor={id} className="block">
      <span className="text-sm text-foreground/80">{label}</span>
      <input
        id={id}
        name={id}
        type={type}
        placeholder={placeholder}
        className="mt-1 w-full rounded-lg border border-white/10 bg-white/[.06] px-3 py-2 text-sm text-foreground placeholder:text-foreground/50 outline-none ring-1 ring-inset ring-white/10 focus:ring-2 focus:ring-[var(--kb-primary-brand)]"
        autoComplete="off"
      />
    </label>
  );
};

const LoginForm = ({ onClose }: { onClose: () => void }) => {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string>("");

  const handleSubmit = async (formData: FormData) => {
    setError("");
    
    // Read guest token from cookies before login
    const guestToken = document.cookie
      .split('; ')
      .find(row => row.startsWith('guest_token='))
      ?.split('=')[1];
    
    if (guestToken) {
      formData.append('guestToken', guestToken);
    }
    
    startTransition(async () => {
      try {
        const result = await signIn(formData);
        if (result?.error) {
          setError(result.error);
        } else {
          onClose();
        }
      } catch (error) {
        // NEXT_REDIRECT is expected behavior, not an error
        if (error && typeof error === 'object' && 'digest' in error && 
            typeof error.digest === 'string' && error.digest.includes('NEXT_REDIRECT')) {
          // After successful login with merge (via redirect), clear guest token and fetch cart
          if (guestToken) {
            document.cookie = 'guest_token=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';
            
            const { useCartStore } = await import('@/lib/store/cartStore');
            const { fetchCart } = useCartStore.getState();
            fetchCart();
          }
          onClose(); // Close modal on successful redirect
          return;
        }
        setError("An unexpected error occurred");
      }
    });
  };

  return (
    <form action={handleSubmit} className="grid gap-3">
      {error && (
        <div className="rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2 text-sm text-red-400">
          {error}
        </div>
      )}
      <Field id="email" label="Email" type="email" placeholder="you@example.com" />
      <Field id="password" label="Password" type="password" placeholder="••••••••" />
      <button
        type="submit"
        disabled={isPending}
        className="mt-2 inline-flex items-center justify-center rounded-lg bg-gradient-to-r from-[var(--kb-primary-brand)] to-[color-mix(in_oklab,var(--kb-primary-brand)_70%,black)] px-4 py-2 text-sm font-semibold text-foreground ring-1 ring-white/10 hover:from-[var(--kb-primary-brand)] hover:to-[var(--kb-primary-brand)] disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isPending ? "Signing in..." : "Sign in"}
      </button>
    </form>
  );
};

const RegisterForm = ({ onClose }: { onClose: () => void }) => {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string>("");
  const [message, setMessage] = useState<string>("");

  const handleSubmit = async (formData: FormData) => {
    setError("");
    setMessage("");
    startTransition(async () => {
      try {
        const result = await signUp(formData);
        if (result?.error) {
          setError(result.error);
        } else if (result?.message) {
          setMessage(result.message);
          if (!result.requiresConfirmation) {
            onClose();
          }
        } else {
          onClose();
        }
      } catch (error) {
        setError("An unexpected error occurred");
      }
    });
  };

  return (
    <form action={handleSubmit} className="grid gap-3">
      {error && (
        <div className="rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2 text-sm text-red-400">
          {error}
        </div>
      )}
      {message && (
        <div className="rounded-lg bg-green-500/10 border border-green-500/20 px-3 py-2 text-sm text-green-400">
          {message}
        </div>
      )}
      <Field id="fullName" label="Full Name" placeholder="Your name" />
      <Field id="email" label="Email" type="email" placeholder="you@example.com" />
      <Field id="password" label="Password" type="password" placeholder="Create a password" />
      <button
        type="submit"
        disabled={isPending}
        className="mt-2 inline-flex items-center justify-center rounded-lg bg-gradient-to-r from-[var(--kb-primary-brand)] to-[color-mix(in_oklab,var(--kb-primary-brand)_70%,black)] px-4 py-2 text-sm font-semibold text-foreground ring-1 ring-white/10 hover:from-[var(--kb-primary-brand)] hover:to-[var(--kb-primary-brand)] disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isPending ? "Creating account..." : "Create account"}
      </button>
    </form>
  );
};
