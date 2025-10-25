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
            {tab === "login" ? (
              <LoginForm key={`login-${open}`} onClose={onClose} />
            ) : (
              <RegisterForm key={`register-${open}`} onClose={onClose} />
            )}
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
  const [isRedirecting, setIsRedirecting] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);

  const handleGoogleSignIn = async () => {
    setIsGoogleLoading(true);
    setError("");
    
    try {
      const { createClient } = await import('@/lib/supabase/client');
      const supabase = createClient();
      
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
        }
      });
      
      if (error) {
        console.error('[AuthModal] Google sign-in error:', error);
        setError(error.message || 'Google sign-in failed');
        setIsGoogleLoading(false);
      }
      // If no error, user will be redirected to Google
    } catch (err) {
      console.error('[AuthModal] Google sign-in error:', err);
      setError('Failed to initiate Google sign-in');
      setIsGoogleLoading(false);
    }
  };

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
      // Clear form fields for better UX
      const emailInput = document.getElementById('email') as HTMLInputElement;
      const passwordInput = document.getElementById('password') as HTMLInputElement;
      if (emailInput) emailInput.value = '';
      if (passwordInput) passwordInput.value = '';
      
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
          // Show loading state during redirect
          setIsRedirecting(true);
          // After successful login with merge (via redirect), clear guest token
          if (guestToken) {
            document.cookie = 'guest_token=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';
          }
          // Close modal after a brief moment to show the spinner
          setTimeout(() => {
            onClose();
          }, 500);
          return; // Don't show error for redirects
        }
        
        console.error('[AuthModal] Login error:', error);
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
      
      {/* Google Sign-In Button */}
      <button
        type="button"
        onClick={handleGoogleSignIn}
        disabled={isGoogleLoading || isPending || isRedirecting}
        className="flex items-center justify-center gap-3 rounded-lg border border-white/10 bg-white px-4 py-2.5 text-sm font-medium text-gray-900 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {isGoogleLoading ? (
          <svg className="animate-spin h-5 w-5 text-gray-900" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
        ) : (
          <svg className="h-5 w-5" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
          </svg>
        )}
        <span>{isGoogleLoading ? "Connecting to Google..." : "Continue with Google"}</span>
      </button>

      {/* Divider */}
      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-white/10"></div>
        </div>
        <div className="relative flex justify-center text-xs uppercase">
          <span className="bg-background px-2 text-foreground/60">Or continue with email</span>
        </div>
      </div>

      <Field id="email" label="Email" type="email" placeholder="you@example.com" />
      <Field id="password" label="Password" type="password" placeholder="••••••••" />
      {isRedirecting && (
        <div className="rounded-lg bg-blue-500/10 border border-blue-500/20 px-3 py-2 text-sm text-blue-400 flex items-center gap-2">
          <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          <span>Logging you in...</span>
        </div>
      )}
      <button
        type="submit"
        disabled={isPending || isRedirecting}
        className="mt-2 inline-flex items-center justify-center rounded-lg bg-gradient-to-r from-[var(--kb-primary-brand)] to-[color-mix(in_oklab,var(--kb-primary-brand)_70%,black)] px-4 py-2 text-sm font-semibold text-foreground ring-1 ring-white/10 hover:from-[var(--kb-primary-brand)] hover:to-[var(--kb-primary-brand)] disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isPending || isRedirecting ? "Signing in..." : "Sign in"}
      </button>
    </form>
  );
};

const RegisterForm = ({ onClose }: { onClose: () => void }) => {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string>("");
  const [message, setMessage] = useState<string>("");
  const [isRedirecting, setIsRedirecting] = useState(false);

  const handleSubmit = async (formData: FormData) => {
    setError("");
    setMessage("");
    startTransition(async () => {
      // Clear form fields for better UX
      const fullNameInput = document.getElementById('fullName') as HTMLInputElement;
      const emailInput = document.getElementById('email') as HTMLInputElement;
      const passwordInput = document.getElementById('password') as HTMLInputElement;
      if (fullNameInput) fullNameInput.value = '';
      if (emailInput) emailInput.value = '';
      if (passwordInput) passwordInput.value = '';
      
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
          // Success case - redirect will happen automatically
          onClose();
        }
      } catch (error) {
        // BUGFIX (2025-10-18): Next.js redirect() throws an error - don't show it as error
        // Check if this is a NEXT_REDIRECT error (expected behavior)
        if (error && typeof error === 'object' && 'digest' in error) {
          const digest = (error as any).digest;
          if (typeof digest === 'string' && digest.includes('NEXT_REDIRECT')) {
            // Show loading state during redirect
            setIsRedirecting(true);
            // Close modal after brief delay
            setTimeout(() => {
              onClose();
            }, 500);
            return;
          }
        }
        
        // Only show error for actual errors, not redirects
        console.error('[AuthModal] Signup error:', error);
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
      <Field id="fullName" label="Full Name" type="text" placeholder="Your name" />
      <Field id="email" label="Email" type="email" placeholder="you@example.com" />
      <Field id="password" label="Password" type="password" placeholder="Create a password" />
      {isRedirecting && (
        <div className="rounded-lg bg-blue-500/10 border border-blue-500/20 px-3 py-2 text-sm text-blue-400 flex items-center gap-2">
          <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          <span>Setting up your account...</span>
        </div>
      )}
      <button
        type="submit"
        disabled={isPending || isRedirecting}
        className="mt-2 inline-flex items-center justify-center rounded-lg bg-gradient-to-r from-[var(--kb-primary-brand)] to-[color-mix(in_oklab,var(--kb-primary-brand)_70%,black)] px-4 py-2 text-sm font-semibold text-foreground ring-1 ring-white/10 hover:from-[var(--kb-primary-brand)] hover:to-[var(--kb-primary-brand)] disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isPending || isRedirecting ? "Creating account..." : "Create account"}
      </button>
    </form>
  );
};
