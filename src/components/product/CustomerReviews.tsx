import React from "react";
import type { Review } from "@/lib/types";
import { Star } from "lucide-react";

export default function CustomerReviews({
  avgRating,
  reviewCount,
  reviews,
}: {
  avgRating: number;
  reviewCount: number;
  reviews: Review[];
}) {
  return (
    <section aria-labelledby="customer-reviews" className="mt-12">
      <div className="mb-4 flex items-center justify-between">
        <h2 id="customer-reviews" className="text-lg font-semibold tracking-tight">
          Customer Reviews
        </h2>
        <div className="inline-flex items-center gap-1 text-sm">
          <Star className="h-4 w-4 text-[var(--kb-accent-gold)]" />
          <span className="font-medium text-foreground/90">{avgRating.toFixed(1)}</span>
          <span className="text-foreground/70">({reviewCount})</span>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {reviews.slice(0, 3).map((r) => (
          <article key={r.id} className="rounded-xl border border-white/10 bg-white/5 p-4">
            <div className="mb-1 flex items-center justify-between text-sm">
              <div className="font-medium">{r.author}</div>
              <div className="inline-flex items-center gap-1">
                <Star className="h-4 w-4 text-[var(--kb-accent-gold)]" />
                <span>{r.rating}</span>
              </div>
            </div>
            {r.title && <div className="text-sm font-semibold">{r.title}</div>}
            <p className="mt-1 text-sm text-foreground/80">{r.content}</p>
            <time className="mt-2 block text-xs text-foreground/60">{new Date(r.date).toLocaleDateString()}</time>
          </article>
        ))}
      </div>
      <div className="mt-4 text-right">
        <a href="#" className="text-sm text-[var(--kb-primary-brand)] hover:underline">
          View all reviews
        </a>
      </div>
    </section>
  );
}
