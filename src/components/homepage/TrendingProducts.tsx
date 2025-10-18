'use client';

import Link from "next/link";
import ProductCard from "./ProductCard";
import type { Product } from "@/lib/types";
import type { TrendingProduct } from "@/lib/apiClient";
import { trackCurationEvent } from "@/lib/curationClient";

interface TrendingProductsProps {
  products: TrendingProduct[];
}

export default function TrendingProducts({ products }: TrendingProductsProps) {
  // Handle product click tracking
  const handleProductClick = (productId: string) => {
    // Fire-and-forget tracking (non-blocking)
    trackCurationEvent({
      eventType: 'click',
      curationType: 'trending_products',
      targetId: productId,
    }).catch(console.warn);
  };
  
  // Don't render if no products
  if (products.length === 0) {
    return null;
  }
  
  // Show only first 8 products for cleaner UI (2 rows of 4)
  const displayProducts = products.slice(0, 8);
  
  return (
    <section className="mx-auto max-w-7xl px-4 py-16">
      {/* Header with better spacing and typography */}
      <div className="flex items-end justify-between mb-8">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Trending Now</h2>
          <p className="mt-2 text-sm text-foreground/60">
            {products.length > 8 ? `Showing ${displayProducts.length} of ${products.length} trending items` : 'Discover our most popular products'}
          </p>
        </div>
        <Link 
          href="/shop" 
          className="group flex items-center gap-2 text-sm font-medium text-foreground/70 transition-colors hover:text-foreground"
        >
          View all
          <svg className="h-4 w-4 transition-transform group-hover:translate-x-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </Link>
      </div>
      
      {/* Grid with better spacing and responsive design */}
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {displayProducts.map((p) => (
          <ProductCard 
            key={p.product_id} 
            product={{
              id: p.product_id,
              name: p.name,
              slug: p.slug,
              price: p.min_price,
              imageUrl: p.image_url,
              badge: p.source === 'trending' ? 'Trending' : p.source === 'new' ? 'New' : undefined,
            }}
            onClick={() => handleProductClick(p.product_id)}
          />
        ))}
      </div>
    </section>
  );
}
