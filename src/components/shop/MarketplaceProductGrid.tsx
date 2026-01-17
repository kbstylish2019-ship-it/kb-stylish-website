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
      {products.map((product) => {
        // For combo products, calculate original price from savings
        // Combo products have badge 'COMBO' and may have combo_savings_cents in the data
        const isCombo = product.badge === 'COMBO';
        const comboSavings = (product as any).combo_savings_cents;
        const originalPrice = isCombo && comboSavings
          ? product.price + (comboSavings / 100)
          : undefined;
          
        return (
          <MarketplaceProductCard
            key={product.id}
            id={product.id}
            name={product.name}
            slug={product.slug || product.id}
            price={product.price}
            originalPrice={originalPrice}
            imageUrl={product.imageUrl}
            badge={product.badge}
          />
        );
      })}
    </div>
  );
}
