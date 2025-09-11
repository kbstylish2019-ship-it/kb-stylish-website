"use client";
import React from "react";
import type { ProductDetail, ProductVariant } from "@/lib/types";
import { formatNPR, cn } from "@/lib/utils";
import { Truck, RotateCcw, ShieldCheck } from "lucide-react";
import { useCartStore } from "@/lib/store/cartStore";

export default function ProductActions({
  product,
  selectedVariant,
}: {
  product: ProductDetail;
  selectedVariant?: ProductVariant;
}) {
  const [qty, setQty] = React.useState(1);
  const addProduct = useCartStore((state) => state.addProduct);
  const stock = selectedVariant ? selectedVariant.stock : 0;
  const canAdd = selectedVariant && stock > 0;

  const handleAddToCart = () => {
    if (!canAdd || !selectedVariant) return;
    
    addProduct({
      id: product.id,
      name: product.name,
      variant: selectedVariant.id,
      imageUrl: product.images[0]?.url,
      price: selectedVariant.price || product.price,
      quantity: qty,
    });
    
    // Reset quantity after adding
    setQty(1);
  };

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between">
        <div>
          <div className="text-xs uppercase tracking-wide text-foreground/60">Price</div>
          <div className="flex items-center gap-2">
            <span className="text-2xl font-bold">{formatNPR((selectedVariant?.price ?? product.price))}</span>
            {product.compareAtPrice && product.compareAtPrice > product.price && (
              <span className="text-sm text-foreground/60 line-through">{formatNPR(product.compareAtPrice)}</span>
            )}
          </div>
        </div>
        <div className="text-sm text-foreground/60">{stock > 0 ? `${stock} in stock` : "Out of stock"}</div>
      </div>

      <div className="flex items-center gap-3">
        <label className="sr-only" htmlFor="qty">Quantity</label>
        <input
          id="qty"
          type="number"
          min={1}
          value={qty}
          onChange={(e) => setQty(Math.max(1, Number(e.target.value)))}
          className="w-20 rounded-lg bg-white/5 px-3 py-2 text-foreground ring-1 ring-white/10"
        />
        <button
          type="button"
          disabled={!canAdd}
          onClick={handleAddToCart}
          className={cn(
            "flex-1 rounded-lg px-5 py-3 text-sm font-semibold shadow-sm ring-1 transition",
            canAdd
              ? "bg-gradient-to-r from-[color-mix(in_oklab,var(--kb-primary-brand)_75%,black)] to-[var(--kb-primary-brand)] ring-white/10 hover:from-[var(--kb-primary-brand)] hover:to-[var(--kb-primary-brand)]"
              : "bg-white/5 text-foreground/60 ring-white/10 cursor-not-allowed"
          )}
          aria-disabled={!canAdd}
        >
          Add to Cart
        </button>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 p-3 text-sm">
          <Truck className="h-4 w-4 text-[var(--kb-accent-gold)]" />
          <div>
            <div className="font-medium">Fast Delivery</div>
            <div className="text-foreground/70">{product.shipping.estimated}</div>
          </div>
        </div>
        <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 p-3 text-sm">
          <RotateCcw className="h-4 w-4 text-[var(--kb-accent-gold)]" />
          <div>
            <div className="font-medium">Easy Returns</div>
            <div className="text-foreground/70">{product.returns.summary}</div>
          </div>
        </div>
        <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 p-3 text-sm">
          <ShieldCheck className="h-4 w-4 text-[var(--kb-accent-gold)]" />
          <div>
            <div className="font-medium">Secure Payment</div>
            <div className="text-foreground/70">COD {product.shipping.codAvailable ? "available" : "unavailable"}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
