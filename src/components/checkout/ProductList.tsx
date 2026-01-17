"use client";
import React from "react";
import Image from "next/image";
import { Trash2 } from "lucide-react";
import type { CartProductItem } from "@/lib/types";
import { formatNPR, cn } from "@/lib/utils";

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
      <section aria-labelledby="your-products" className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <h2 id="your-products" className="mb-2 text-lg font-semibold tracking-tight text-gray-900">
          Your Products
        </h2>
        <p className="text-sm text-gray-500">Your bag is empty.</p>
      </section>
    );
  }

  return (
    <section aria-labelledby="your-products" className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <h2 id="your-products" className="mb-3 text-lg font-semibold tracking-tight text-gray-900">
        Your Products
      </h2>
      <ul className="divide-y divide-gray-100">
        {items.map((it, index) => (
          <li key={`${it.id}-${it.variantId || it.variant || ''}-${index}`} className="flex gap-3 py-3">
            <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-lg border border-gray-200 bg-gray-50">
              {it.imageUrl ? (
                <Image 
                  src={it.imageUrl} 
                  alt={it.name} 
                  fill
                  className="object-cover" 
                  sizes="80px"
                />
              ) : (
                <div className="flex size-full items-center justify-center text-xs text-gray-400">No image</div>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-gray-900">{it.name}</div>
                  
                  {it.variantData && Object.keys(it.variantData).filter(k => k !== 'colorHex' && it.variantData![k]).length > 0 ? (
                    <div className="flex flex-wrap items-center gap-2 mt-1.5">
                      {/* Show color first if present */}
                      {it.variantData.color && (
                        <span key={`color-${it.id}-${it.variant || ''}`} className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs bg-gray-100 text-gray-700 border border-gray-200">
                          <span 
                            className="w-3 h-3 rounded-full border border-gray-300 shadow-sm" 
                            style={{ backgroundColor: it.variantData.colorHex || '#666' }} 
                          />
                          {it.variantData.color}
                        </span>
                      )}
                      {/* Show all other attributes */}
                      {Object.entries(it.variantData)
                        .filter(([key, value]) => key !== 'color' && key !== 'colorHex' && value)
                        .map(([key, value]) => (
                          <span key={`${key}-${it.id}-${it.variant || ''}-${value}`} className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-gray-100 text-gray-700 font-medium border border-gray-200">
                            {value}
                          </span>
                        ))
                      }
                    </div>
                  ) : it.variant ? (
                    <div className="text-xs text-gray-500 mt-1">{it.variant}</div>
                  ) : null}
                </div>
                <div className="text-sm font-medium text-gray-900 whitespace-nowrap">{formatNPR(it.price)}</div>
              </div>
              <div className="mt-2 flex items-center gap-3">
                <div className="inline-flex items-center rounded-lg border border-gray-300">
                  <button
                    type="button"
                    aria-label="Decrease quantity"
                    data-testid={`dec-${it.id}`}
                    className="h-8 w-8 text-gray-600 hover:bg-gray-50 disabled:opacity-50 rounded-l-lg"
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
                    className="h-8 w-14 bg-transparent text-center text-sm text-gray-900 border-x border-gray-300"
                  />
                  <button
                    type="button"
                    aria-label="Increase quantity"
                    data-testid={`inc-${it.id}`}
                    className="h-8 w-8 text-gray-600 hover:bg-gray-50 rounded-r-lg"
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
                    "inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-red-600 border border-gray-200 hover:bg-red-50 hover:border-red-200",
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
