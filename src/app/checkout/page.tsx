"use client";
import dynamic from "next/dynamic";
import ErrorBoundary from "@/components/ui/ErrorBoundary";

// Dynamic import for heavy checkout component
const CheckoutClient = dynamic(() => import("@/components/checkout/CheckoutClient"), {
  loading: () => (
    <div className="mx-auto max-w-7xl px-4 py-10">
      <div className="h-96 animate-pulse bg-white/5 rounded-xl" />
    </div>
  ),
});

export default function CheckoutPage() {
  return (
    <main>
      <ErrorBoundary
        fallback={
          <div className="mx-auto max-w-3xl px-4 py-8">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-8 text-center ring-1 ring-white/10">
              <h2 className="text-lg font-semibold">Checkout is temporarily unavailable</h2>
              <p className="mt-2 text-sm text-foreground/70">
                Please try again. If the problem persists, return to the cart and try later.
              </p>
            </div>
          </div>
        }
      >
        <CheckoutClient />
      </ErrorBoundary>
    </main>
  );
}
