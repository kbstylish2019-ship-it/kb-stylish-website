'use client';

import Image from "next/image";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useRef } from "react";
import type { FeaturedBrand } from "@/lib/apiClient";

interface BrandCarouselProps {
  brands: FeaturedBrand[];
}

// Fallback brands matching actual database brands
const fallbackBrands = [
  { brand_id: "1", brand_name: "Athletic Edge", brand_slug: "athletic-edge", logo_url: null },
  { brand_id: "2", brand_name: "Boho Chic", brand_slug: "boho-chic", logo_url: null },
  { brand_id: "3", brand_name: "Elegant Essence", brand_slug: "elegant-essence", logo_url: null },
  { brand_id: "4", brand_name: "Urban Threads", brand_slug: "urban-threads", logo_url: null },
  { brand_id: "5", brand_name: "Vintage Revival", brand_slug: "vintage-revival", logo_url: null },
];

export default function BrandCarousel({ brands }: BrandCarouselProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const displayBrands = brands.length > 0 ? brands : fallbackBrands;

  const scroll = (direction: 'left' | 'right') => {
    if (scrollRef.current) {
      const scrollAmount = 200;
      scrollRef.current.scrollBy({
        left: direction === 'left' ? -scrollAmount : scrollAmount,
        behavior: 'smooth',
      });
    }
  };

  return (
    <div className="relative">
      {/* Scroll Buttons */}
      <button
        onClick={() => scroll('left')}
        className="absolute left-0 top-1/2 -translate-y-1/2 z-10 w-8 h-8 bg-white shadow-md rounded-full flex items-center justify-center hover:bg-gray-50 transition-colors"
        aria-label="Scroll left"
      >
        <ChevronLeft className="h-5 w-5 text-gray-600" />
      </button>
      <button
        onClick={() => scroll('right')}
        className="absolute right-0 top-1/2 -translate-y-1/2 z-10 w-8 h-8 bg-white shadow-md rounded-full flex items-center justify-center hover:bg-gray-50 transition-colors"
        aria-label="Scroll right"
      >
        <ChevronRight className="h-5 w-5 text-gray-600" />
      </button>

      {/* Brands Container */}
      <div
        ref={scrollRef}
        className="flex gap-6 overflow-x-auto pb-2 px-10 scrollbar-hide"
      >
        {displayBrands.map((brand) => (
          <Link
            key={brand.brand_id}
            href={`/shop?brand=${brand.brand_slug}`}
            className="flex-shrink-0 group"
          >
            <div className="w-24 h-24 rounded-full border-2 border-gray-200 bg-white flex items-center justify-center overflow-hidden group-hover:border-[#1976D2] group-hover:shadow-lg transition-all">
              {brand.logo_url ? (
                <Image
                  src={brand.logo_url}
                  alt={brand.brand_name}
                  width={80}
                  height={80}
                  className="object-contain p-2"
                />
              ) : (
                <span className="text-lg font-bold text-gray-400 text-center px-2">
                  {brand.brand_name.substring(0, 2).toUpperCase()}
                </span>
              )}
            </div>
            <p className="text-xs text-center text-gray-600 mt-2 font-medium group-hover:text-[#1976D2] transition-colors">
              {brand.brand_name}
            </p>
          </Link>
        ))}
      </div>
    </div>
  );
}
