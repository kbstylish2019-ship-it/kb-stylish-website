import React from "react";
import Link from "next/link";
import type { ProductDetail } from "@/lib/types";
import { Star } from "lucide-react";

export default function ProductMeta({ product }: { product: ProductDetail }) {
  return (
    <div className="space-y-2">
      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{product.name}</h1>
      <div className="flex flex-wrap items-center gap-3 text-sm text-foreground/70">
        <Link 
          href={`/vendor/${product.vendor.id}`} 
          className="hover:text-foreground transition-colors underline decoration-foreground/20 hover:decoration-foreground/60"
        >
          by {product.vendor.name}
        </Link>
        <span className="inline-flex items-center gap-1">
          <Star className="h-4 w-4 text-[var(--kb-accent-gold)]" />
          <span className="font-medium text-foreground/90">{product.avgRating.toFixed(1)}</span>
          <span>({product.reviewCount} reviews)</span>
        </span>
        {product.badges && product.badges.length > 0 && (
          <span className="inline-flex items-center gap-2">
            {product.badges.map((b) => (
              <span
                key={b}
                className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-xs"
              >
                {b}
              </span>
            ))}
          </span>
        )}
      </div>
    </div>
  );
}
