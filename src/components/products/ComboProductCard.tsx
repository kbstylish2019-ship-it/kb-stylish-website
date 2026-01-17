'use client';

import Image from "next/image";
import Link from "next/link";
import { memo, useState } from "react";
import { COMBO_CONFIG } from "@/lib/constants/combo";
import type { ComboProduct } from "@/types/combo";

interface ComboProductCardProps {
  combo: ComboProduct;
  onClick?: () => void;
}

function ComboProductCard({ combo, onClick }: ComboProductCardProps) {
  const [imageError, setImageError] = useState(false);

  const formatPrice = (cents: number) => {
    return `Rs. ${(cents / 100).toLocaleString('en-NP')}`;
  };

  // Calculate original price and savings percentage
  const originalPriceCents = combo.combo_price_cents + combo.combo_savings_cents;
  const savingsPercentage = Math.round((combo.combo_savings_cents / originalPriceCents) * 100);
  
  // Calculate remaining quantity
  const remaining = combo.combo_quantity_limit 
    ? combo.combo_quantity_limit - (combo.combo_quantity_sold || 0)
    : null;
  const isSoldOut = remaining !== null && remaining <= 0;
  const isLimited = remaining !== null && remaining > 0 && remaining <= 5;

  // Accessibility label
  const a11yLabel = `${COMBO_CONFIG.A11Y.COMBO_BADGE}: ${combo.name}, ${savingsPercentage}% off${remaining !== null ? `, ${remaining} remaining` : ''}`;

  return (
    <Link
      href={`/product/${combo.slug || combo.id}`}
      onClick={onClick}
      className={`group block bg-white rounded-lg border border-gray-200 overflow-hidden hover:shadow-lg transition-shadow ${isSoldOut ? 'opacity-60' : ''}`}
      aria-label={a11yLabel}
    >
      {/* Image */}
      <div className="relative aspect-square bg-gray-100">
        {/* COMBO Badge */}
        <span 
          className="absolute top-2 left-2 z-10 bg-gradient-to-r from-purple-600 to-indigo-600 text-white text-[10px] font-bold px-2 py-1 rounded"
          aria-hidden="true"
        >
          {COMBO_CONFIG.LABELS.BADGE}
        </span>
        
        {/* Limited/Sold Out Badge */}
        {isSoldOut && (
          <span className="absolute top-2 right-2 z-10 bg-gray-800 text-white text-[10px] font-bold px-2 py-1 rounded">
            {COMBO_CONFIG.LABELS.SOLD_OUT}
          </span>
        )}
        {isLimited && !isSoldOut && (
          <span 
            className="absolute top-2 right-2 z-10 bg-orange-500 text-white text-[10px] font-bold px-2 py-1 rounded animate-pulse"
            aria-live="polite"
          >
            {remaining} {COMBO_CONFIG.LABELS.LIMITED_SUFFIX}
          </span>
        )}

        {combo.imageUrl && !imageError ? (
          <Image
            src={combo.imageUrl}
            alt={combo.name}
            fill
            className="object-contain p-4 group-hover:scale-105 transition-transform duration-300"
            onError={() => setImageError(true)}
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-gray-400">
            <svg className="h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
            </svg>
          </div>
        )}
      </div>

      {/* Info */}
      <div className="p-3">
        <h3 className="text-sm text-gray-800 font-medium line-clamp-2 min-h-[40px] group-hover:text-purple-600 transition-colors">
          {combo.name}
        </h3>
        
        {/* Pricing */}
        <div className="mt-2 space-y-1">
          {/* Original price (crossed out) */}
          <p className="text-sm text-gray-400 line-through">
            {formatPrice(originalPriceCents)}
          </p>
          
          {/* Combo price */}
          <div className="flex items-center gap-2">
            <p className="text-lg font-bold text-purple-600">
              {formatPrice(combo.combo_price_cents)}
            </p>
            
            {/* Savings badge */}
            <span 
              className="text-xs font-semibold text-green-600 bg-green-50 px-1.5 py-0.5 rounded"
              aria-label={COMBO_CONFIG.A11Y.SAVINGS_ANNOUNCEMENT(combo.combo_savings_cents / 100)}
            >
              {COMBO_CONFIG.LABELS.SAVINGS_PREFIX} {savingsPercentage}%
            </span>
          </div>
        </div>

        {combo.category && (
          <p className="text-xs text-gray-500 mt-1">{combo.category}</p>
        )}
      </div>
    </Link>
  );
}

export default memo(ComboProductCard);
