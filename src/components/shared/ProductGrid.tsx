import type { Product } from "@/lib/types";
import ProductCard from "@/components/homepage/ProductCard";

export default function ProductGrid({ products }: { products: Product[] }) {
  if (!products?.length) {
    return (
      <div className="rounded-2xl border border-white/10 bg-white/5 p-8 text-center text-sm text-foreground/70 ring-1 ring-white/10">
        No products found.
      </div>
    );
  }
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {products.map((p) => (
        <ProductCard key={p.id} product={p} />
      ))}
    </div>
  );
}
