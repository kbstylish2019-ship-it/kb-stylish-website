"use client";
import React from "react";
import type { CartProductItem } from "@/lib/types";
import { formatNPR, cn } from "@/lib/utils";
import { Trash2 } from "lucide-react";

export default function ProductList({
  items,
  onQtyChange,
  onRemove,
}: {
  items: CartProductItem[];
  onQtyChange: (id: string, qty: number, variant?: string) => void;
  onRemove: (id: string, variant?: string) => void;
}) {
  if (items.length === 0) {
    return (
      <section aria-labelledby="your-products" className="rounded-xl border border-white/10 bg-white/5 p-4">
        <h2 id="your-products" className="mb-2 text-lg font-semibold tracking-tight">
          Your Products
        </h2>
        <p className="text-sm text-foreground/70">Your bag is empty.</p>
      </section>
    );
  }

  return (
    <section aria-labelledby="your-products" className="rounded-xl border border-white/10 bg-white/5 p-4">
      <h2 id="your-products" className="mb-3 text-lg font-semibold tracking-tight">
        Your Products
      </h2>
      <ul className="divide-y divide-white/10">
        {items.map((it) => (
          <li key={`${it.id}-${it.variant || ''}`} className="flex gap-3 py-3">
            <div className="h-20 w-20 shrink-0 overflow-hidden rounded-lg border border-white/10 bg-black/10">
              {it.imageUrl ? (
                <img src={it.imageUrl} alt={it.name} className="size-full object-cover" />
              ) : (
                <div className="flex size-full items-center justify-center text-xs text-foreground/60">No image</div>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">{it.name}</div>
                  {it.variant && (
                    <div className="text-xs text-foreground/70">{it.variant}</div>
                  )}
                </div>
                <div className="text-sm font-medium">{formatNPR(it.price)}</div>
              </div>
              <div className="mt-2 flex items-center gap-3">
                <div className="inline-flex items-center rounded-lg ring-1 ring-white/10">
                  <button
                    type="button"
                    aria-label="Decrease quantity"
                    data-testid={`dec-${it.id}`}
                    className="h-8 w-8 disabled:opacity-50"
                    onClick={() => onQtyChange(it.id, Math.max(1, it.quantity - 1), it.variant)}
                    disabled={it.quantity <= 1}
                  >
                    −
                  </button>
                  <input
                    aria-label="Quantity"
                    data-testid={`qty-${it.id}`}
                    type="number"
                    min={1}
                    value={it.quantity}
                    onChange={(e) => onQtyChange(it.id, Math.max(1, Number(e.target.value)), it.variant)}
                    className="h-8 w-14 bg-transparent text-center text-sm"
                  />
                  <button
                    type="button"
                    aria-label="Increase quantity"
                    data-testid={`inc-${it.id}`}
                    className="h-8 w-8"
                    onClick={() => onQtyChange(it.id, it.quantity + 1, it.variant)}
                  >
                    +
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => onRemove(it.id, it.variant)}
                  aria-label={`Remove ${it.name}`}
                  className={cn(
                    "inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs ring-1 ring-white/10 hover:bg-white/5",
                  )}
                >
                  <Trash2 className="h-4 w-4" /> Remove
                </button>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
