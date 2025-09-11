import type { Product } from "@/lib/types";

export default function ProductCard({ product }: { product: Product }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/5 ring-1 ring-white/10">
      <div className="relative aspect-square w-full bg-gradient-to-br from-white/10 to-white/0">
        {product.imageUrl ? (
          <img
            src={product.imageUrl}
            alt={product.name}
            className="absolute inset-0 size-full object-cover"
          />
        ) : null}
        <div className="absolute right-3 top-3">
          {product.badge ? (
            <span className="rounded-full bg-[var(--kb-accent-gold)] px-2 py-1 text-xs font-semibold text-[#111827] shadow">
              {product.badge}
            </span>
          ) : null}
        </div>
      </div>
      <div className="p-4">
        <p className="text-sm text-foreground/70">{product.name}</p>
        <p className="mt-1 text-lg font-semibold">Rs. {product.price.toLocaleString()}</p>
      </div>
    </div>
  );
}
