"use client";
import React from "react";
import Image from "next/image";
import Link from "next/link";
import type { Product } from "@/lib/types";
import NavigationLoader from "@/components/ui/NavigationLoader";

/**
 * ProductCard component displays product information in a card layout.
 * Memoized to prevent unnecessary re-renders in product lists.
 * 
 * @param product - Product data to display
 * @param onClick - Optional click handler for tracking
 * @returns Memoized product card component
 */
interface ProductCardProps {
  product: Product;
  onClick?: () => void;
}

const ProductCard = React.memo(function ProductCard({ product, onClick }: ProductCardProps) {
  // Use slug if available, otherwise generate from name
  const productSlug = product.slug || product.name.toLowerCase().replace(/\s+/g, '-');
  
  // Handle click event
  const handleClick = () => {
    if (onClick) {
      onClick(); // Fire tracking (non-blocking)
    }
  };
  
  return (
    <NavigationLoader 
      href={`/product/${productSlug}`}
      onClick={handleClick}
      className="overflow-hidden rounded-2xl border border-white/10 bg-white/5 ring-1 ring-white/10 transition-all hover:ring-2 hover:ring-white/20 cursor-pointer"
    >
        <div className="relative aspect-square w-full bg-gradient-to-br from-white/10 to-white/0">
          {product.imageUrl && product.imageUrl !== '/placeholder-product.jpg' ? (
            <Image
              src={product.imageUrl}
              alt={product.name}
              fill
              className="object-cover"
              sizes="(max-width: 768px) 50vw, (max-width: 1200px) 33vw, 25vw"
              onError={(e) => {
                // Fallback to placeholder if image fails to load
                e.currentTarget.style.display = 'none';
                // Show placeholder div
                const placeholder = e.currentTarget.parentElement?.querySelector('.image-placeholder');
                if (placeholder) {
                  (placeholder as HTMLElement).style.display = 'flex';
                }
              }}
            />
          ) : null}
          {/* Elegant placeholder for missing images - always present but conditionally visible */}
          <div 
            className={`image-placeholder flex items-center justify-center h-full text-4xl text-foreground/30 ${
              product.imageUrl && product.imageUrl !== '/placeholder-product.jpg' ? 'hidden' : 'flex'
            }`}
          >
            📸
          </div>
          <div className="absolute right-3 top-3">
            {product.badge ? (
              <span className="rounded-full bg-[var(--kb-accent-gold)] px-2 py-1 text-xs font-semibold text-[#111827] shadow">
                {product.badge}
              </span>
            ) : null}
          </div>
        </div>
        <div className="p-4">
          <p className="text-sm text-foreground/70 hover:text-foreground transition-colors">{product.name}</p>
          <p className="mt-1 text-lg font-semibold">Rs. {product.price.toLocaleString()}</p>
        </div>
    </NavigationLoader>
  );
});

export default ProductCard;
