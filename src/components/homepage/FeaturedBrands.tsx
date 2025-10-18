'use client';

import Link from "next/link";
import Image from "next/image";
import type { FeaturedBrand } from "@/lib/apiClient";
import { trackCurationEvent } from "@/lib/curationClient";

interface FeaturedBrandsProps {
  brands: FeaturedBrand[];
}

export default function FeaturedBrands({ brands }: FeaturedBrandsProps) {
  // Handle brand click tracking
  const handleBrandClick = (brandId: string) => {
    // Fire-and-forget tracking (non-blocking)
    trackCurationEvent({
      eventType: 'click',
      curationType: 'featured_brands',
      targetId: brandId,
    }).catch(console.warn);
  };
  
  // Don't render if no brands
  if (brands.length === 0) {
    return null;
  }
  
  return (
    <section className="mx-auto max-w-7xl px-4 py-16 bg-gradient-to-b from-transparent via-white/[0.02] to-transparent">
      {/* Header with better visual hierarchy */}
      <div className="flex items-end justify-between mb-8">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Featured Brands</h2>
          <p className="mt-2 text-sm text-foreground/60">Discover our hand-picked collection of trusted brands</p>
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
      
      {/* Brand cards with improved design */}
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {brands.map((brand) => (
          <Link
            key={brand.brand_id}
            href={`/shop?brand=${brand.brand_slug}`}
            onClick={() => handleBrandClick(brand.brand_id)}
            className="group relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.07] to-white/[0.02] p-8 backdrop-blur-sm transition-all duration-300 hover:border-white/20 hover:bg-white/[0.08] hover:shadow-xl hover:shadow-white/5"
          >
            {/* Logo with premium styling */}
            {brand.logo_url && (
              <div className="relative aspect-[3/2] mb-6 overflow-hidden rounded-2xl border-2 border-white/10 bg-gradient-to-br from-white/[0.08] to-transparent backdrop-blur-sm transition-all duration-300 group-hover:border-white/20 group-hover:shadow-lg group-hover:shadow-white/10">
                {/* Subtle inner glow */}
                <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-white/5 via-transparent to-transparent" />
                {/* Logo container with perfect centering */}
                <div className="absolute inset-0 flex items-center justify-center p-8">
                  <div className="relative h-full w-full">
                    <Image 
                      src={brand.logo_url} 
                      alt={brand.brand_name} 
                      fill 
                      className="object-contain transition-transform duration-300 group-hover:scale-110"
                      sizes="(max-width: 768px) 50vw, (max-width: 1200px) 33vw, 33vw"
                      style={{ filter: 'brightness(1.1) contrast(1.05)' }}
                    />
                  </div>
                </div>
              </div>
            )}
            
            {/* Brand info with better typography */}
            <div className="space-y-2">
              <h3 className="text-xl font-bold tracking-tight transition-colors group-hover:text-foreground/90">
                {brand.brand_name}
              </h3>
              <p className="flex items-center gap-2 text-sm text-foreground/60">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
                </svg>
                {brand.product_count} {brand.product_count === 1 ? 'product' : 'products'} available
              </p>
            </div>
            
            {/* Hover arrow indicator */}
            <div className="absolute bottom-4 right-4 flex h-8 w-8 items-center justify-center rounded-full bg-white/5 opacity-0 ring-1 ring-white/10 transition-all duration-300 group-hover:opacity-100 group-hover:translate-x-1">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
