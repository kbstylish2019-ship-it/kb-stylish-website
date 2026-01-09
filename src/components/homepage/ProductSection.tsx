'use client';

import Link from "next/link";
import { ChevronRight, ChevronLeft } from "lucide-react";
import { useRef } from "react";
import MarketplaceProductCard from "./MarketplaceProductCard";
import type { TrendingProduct } from "@/lib/apiClient";

interface ProductSectionProps {
  title: string;
  subtitle?: string;
  products: TrendingProduct[];
  viewAllLink: string;
  bgColor?: string;
}

export default function ProductSection({
  title,
  subtitle,
  products,
  viewAllLink,
  bgColor = "bg-white",
}: ProductSectionProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const scroll = (direction: 'left' | 'right') => {
    if (scrollRef.current) {
      const scrollAmount = 300;
      scrollRef.current.scrollBy({
        left: direction === 'left' ? -scrollAmount : scrollAmount,
        behavior: 'smooth',
      });
    }
  };

  if (!products || products.length === 0) {
    return null;
  }

  return (
    <div className={`${bgColor} rounded-lg shadow-sm p-6`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-xl font-bold text-gray-800">{title}</h2>
          {subtitle && <p className="text-sm text-gray-500">{subtitle}</p>}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => scroll('left')}
            className="w-8 h-8 bg-gray-100 hover:bg-gray-200 rounded-full flex items-center justify-center transition-colors"
            aria-label="Scroll left"
          >
            <ChevronLeft className="h-5 w-5 text-gray-600" />
          </button>
          <button
            onClick={() => scroll('right')}
            className="w-8 h-8 bg-gray-100 hover:bg-gray-200 rounded-full flex items-center justify-center transition-colors"
            aria-label="Scroll right"
          >
            <ChevronRight className="h-5 w-5 text-gray-600" />
          </button>
          <Link
            href={viewAllLink}
            className="flex items-center gap-1 text-[#1976D2] text-sm font-medium hover:underline ml-2"
          >
            See All <ChevronRight className="h-4 w-4" />
          </Link>
        </div>
      </div>

      {/* Products Grid/Scroll */}
      <div
        ref={scrollRef}
        className="flex gap-4 overflow-x-auto pb-2 scrollbar-hide snap-x snap-mandatory"
      >
        {products.map((product) => (
          <div key={product.product_id} className="flex-shrink-0 w-[200px] snap-start">
            <MarketplaceProductCard
              id={product.product_id}
              name={product.name}
              slug={product.slug}
              price={product.min_price}
              imageUrl={product.image_url}
              rating={product.average_rating}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
