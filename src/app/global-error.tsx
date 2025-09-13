"use client";

import Link from "next/link";

import React from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const isDev = process.env.NODE_ENV !== "production";
  return (
    <html>
      <body>
        <div
          role="alert"
          aria-live="assertive"
          className="mx-auto my-16 max-w-2xl rounded-2xl border border-white/10 bg-white/5 p-8 text-center ring-1 ring-white/10"
        >
          <div className="mx-auto mb-4 h-12 w-12 rounded-full bg-red-500/10 text-red-600 ring-1 ring-red-500/20 flex items-center justify-center">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M12 9v4m0 4h.01M12 3a9 9 0 100 18 9 9 0 000-18z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <h2 className="text-lg font-semibold">Something went wrong</h2>
          <p className="mt-2 text-sm text-foreground/70">
            We’re sorry, but an unexpected error occurred. You can try again or return to the home page.
          </p>
          {isDev && error?.message ? (
            <p className="mt-3 text-xs text-foreground/50">{error.message}</p>
          ) : null}
          <div className="mt-6 flex items-center justify-center gap-3">
            <button
              type="button"
              onClick={() => reset()}
              className="rounded-full bg-[var(--kb-primary-brand)] px-4 py-2 text-sm font-semibold text-white hover:bg-[color-mix(in_oklab,var(--kb-primary-brand)_90%,black)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--kb-accent-gold)]"
            >
              Try again
            </button>
            <Link
              href="/"
              className="inline-flex items-center justify-center rounded-full px-6 py-3 text-sm font-semibold transition bg-[var(--kb-primary-brand)] text-white hover:brightness-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--kb-accent-gold)]"
            >
              Return to Homepage
            </Link>
          </div>
        </div>
      </body>
    </html>
  );
}
