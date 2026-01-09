'use client';

import MarketplaceProductCard from "@/components/homepage/MarketplaceProductCard";
import type { Product } from "@/lib/types";

interface MarketplaceProductGridProps {
  products: Product[];
}

export default function MarketplaceProductGrid({ products }: MarketplaceProductGridProps) {
  if (!products?.length) {
    return null;
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
      {products.map((product) => (
        <MarketplaceProductCard
          key={product.id}
          id={product.id}
          name={product.name}
          slug={product.slug || product.id}
          price={product.price}
          imageUrl={product.imageUrl}
          badge={product.badge}
        />
      ))}
    </div>
  );
}
