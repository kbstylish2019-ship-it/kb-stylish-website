"use client";
import React from "react";
import Link from "next/link";

export type ErrorBoundaryProps = {
  children: React.ReactNode;
  className?: string;
  /**
   * A static fallback element to render when an error is caught.
   * If omitted, a default, user-friendly fallback UI will be used.
   */
  fallback?: React.ReactNode;
  /** Called after the boundary has been reset (via the Try again button or resetKeys change). */
  onReset?: () => void;
  /** Called when an error is caught. */
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
  /**
   * If provided, changing the values in this array will automatically
   * reset the error boundary to its initial (non-error) state.
   */
  resetKeys?: Array<unknown>;
};

type ErrorBoundaryState = {
  hasError: boolean;
  error: Error | null;
};

export default class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = {
    hasError: false,
    error: null,
  };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    if (process.env.NODE_ENV !== "production") {
      // Log to console in development to aid debugging
      console.error("ErrorBoundary caught an error:", error, errorInfo);
    }
    this.props.onError?.(error, errorInfo);
  }

  componentDidUpdate(prevProps: ErrorBoundaryProps) {
    // Auto-reset when resetKeys change
    if (
      this.state.hasError &&
      JSON.stringify(prevProps.resetKeys) !== JSON.stringify(this.props.resetKeys)
    ) {
      this.reset();
    }
  }

  private reset = () => {
    this.setState({ hasError: false, error: null });
    this.props.onReset?.();
  };

  private DefaultFallback() {
    const isDev = process.env.NODE_ENV !== "production";
    const message = isDev && this.state.error ? this.state.error.message : undefined;
    return (
      <div
        role="alert"
        aria-live="assertive"
        className="mx-auto my-10 max-w-2xl rounded-2xl border border-white/10 bg-white/5 p-8 text-center ring-1 ring-white/10"
      >
        <div className="mx-auto mb-4 h-12 w-12 rounded-full bg-[var(--kb-accent-red)]/10 text-[var(--kb-accent-red)] ring-1 ring-[var(--kb-accent-red)]/20 flex items-center justify-center">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path d="M12 9v4m0 4h.01M12 3a9 9 0 100 18 9 9 0 000-18z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <h2 className="text-lg font-semibold">Something went wrong</h2>
        <p className="mt-2 text-sm text-foreground/70">
          We’re sorry, but an unexpected error occurred. You can try again or return to the previous page.
        </p>
        {message ? (
          <p className="mt-3 text-xs text-foreground/50">{message}</p>
        ) : null}
        <div className="mt-6 flex items-center justify-center gap-3">
          <button
            type="button"
            onClick={this.reset}
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
    );
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback ?? this.DefaultFallback();
    }
    return this.props.children;
  }
}
