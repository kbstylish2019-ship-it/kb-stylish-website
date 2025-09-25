"use client";
import React from "react";
import type { ProductDetail, ProductVariant } from "@/lib/types";
import { formatNPR, cn } from "@/lib/utils";
import { Truck, RotateCcw, ShieldCheck } from "lucide-react";
import useDecoupledCartStore from '@/lib/store/decoupledCartStore';

export default function ProductActions({
  product,
  selectedVariant,
}: {
  product: ProductDetail;
  selectedVariant?: ProductVariant;
}) {
  const [qty, setQty] = React.useState(1);
  const [isAdding, setIsAdding] = React.useState(false);
  const [justAdded, setJustAdded] = React.useState(false);
  const addProductItem = useDecoupledCartStore((state) => state.addProductItem);
  const stock = selectedVariant ? selectedVariant.stock : 0;
  const canAdd = selectedVariant && stock > 0 && qty <= stock && !isAdding;

  const handleAddToCart = async () => {
    if (!canAdd || !selectedVariant) return;
    
    setIsAdding(true);
    
    // Create a variant descriptor from the selected options
    const variantDescriptor = Object.entries(selectedVariant.options)
      .map(([key, value]) => `${value}`)
      .join(' / ');
    
    // Add product to the decoupled cart using the new architecture
    await addProductItem(
      selectedVariant.id, // variant_id
      qty, // quantity
      {
        variant_id: selectedVariant.id,
        product_id: product.id,
        product_name: product.name,
        variant_name: variantDescriptor,
        sku: selectedVariant.sku,
        price: selectedVariant.price || product.price,
        image_url: product.images[0]?.url
      }
    );
    
    // Show elegant success feedback
    setJustAdded(true);
    
    // Reset quantity after adding
    setQty(1);
    
    // Reset states after feedback period
    setTimeout(() => {
      setIsAdding(false);
      setJustAdded(false);
    }, 2000);
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
        <div className={cn(
          "text-sm",
          stock === 0 
            ? "text-red-400 font-medium" 
            : stock < 5 
            ? "text-amber-400"
            : "text-foreground/60"
        )}>
          {stock === 0 ? "Out of stock" : stock < 5 ? `Only ${stock} left!` : `${stock} in stock`}
        </div>
      </div>

      <div className="flex items-center gap-3">
        <label className="sr-only" htmlFor="qty">Quantity</label>
        <input
          id="qty"
          type="number"
          min={1}
          max={stock}
          value={qty}
          onChange={(e) => {
            const value = Math.max(1, Math.min(stock, Number(e.target.value)));
            setQty(value);
          }}
          disabled={!selectedVariant || stock === 0}
          className={cn(
            "w-20 rounded-lg bg-white/5 px-3 py-2 text-foreground ring-1 ring-white/10",
            (!selectedVariant || stock === 0) && "opacity-50 cursor-not-allowed"
          )}
        />
        <button
          type="button"
          disabled={!canAdd}
          onClick={handleAddToCart}
          className={cn(
            "flex-1 rounded-lg px-5 py-3 text-sm font-semibold shadow-sm ring-1 transition-all duration-300",
            justAdded
              ? "bg-green-600 text-white ring-green-500/20"
              : canAdd
              ? "bg-gradient-to-r from-[color-mix(in_oklab,var(--kb-primary-brand)_75%,black)] to-[var(--kb-primary-brand)] ring-white/10 hover:from-[var(--kb-primary-brand)] hover:to-[var(--kb-primary-brand)] hover:shadow-lg"
              : "bg-white/5 text-foreground/60 ring-white/10 cursor-not-allowed"
          )}
          aria-disabled={!canAdd}
        >
          {isAdding ? (
            <span className="flex items-center justify-center gap-2">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
              Adding...
            </span>
          ) : justAdded ? (
            <span className="flex items-center justify-center gap-2">
              <span className="text-lg">✓</span>
              Added to Cart
            </span>
          ) : (
            "Add to Cart"
          )}
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
