'use client';

import Image from "next/image";
import Link from "next/link";
import { memo, useState } from "react";
import type { Product } from "@/lib/types";

interface ProductCardProps {
  product: Product;
  onClick?: () => void;
}

function ProductCard({ product, onClick }: ProductCardProps) {
  const [imageError, setImageError] = useState(false);

  const formatPrice = (amount: number) => {
    return `Rs. ${amount.toLocaleString('en-NP')}`;
  };

  return (
    <Link
      href={`/product/${product.slug || product.id}`}
      onClick={onClick}
      className="group block bg-white rounded-lg border border-gray-200 overflow-hidden hover:shadow-lg transition-shadow"
    >
      {/* Image */}
      <div className="relative aspect-square bg-gray-100">
        {product.badge && (
          <span className="absolute top-2 left-2 z-10 bg-[#E31B23] text-white text-[10px] font-bold px-2 py-1 rounded">
            {product.badge}
          </span>
        )}
        {product.is_combo && (
          <span className="absolute top-2 right-2 z-10 bg-purple-600 text-white text-[10px] font-bold px-2 py-1 rounded shadow-md">
            COMBO
          </span>
        )}
        {product.imageUrl && !imageError ? (
          <Image
            src={product.imageUrl}
            alt={product.name}
            fill
            className="object-contain p-4 group-hover:scale-105 transition-transform duration-300"
            onError={() => setImageError(true)}
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-gray-400">
            <svg className="h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
        )}
      </div>

      {/* Info */}
      <div className="p-3">
        <h3 className="text-sm text-gray-800 font-medium line-clamp-2 min-h-[40px] group-hover:text-[#1976D2] transition-colors">
          {product.name}
        </h3>
        <p className="text-lg font-bold text-[#E31B23] mt-2">
          {formatPrice(product.price)}
        </p>
        {product.is_combo && product.combo_savings_cents && product.combo_savings_cents > 0 && (
          <p className="text-xs text-green-600 font-semibold mt-1">
            Save {formatPrice(product.combo_savings_cents / 100)}
          </p>
        )}
        {product.category && (
          <p className="text-xs text-gray-500 mt-1">{product.category}</p>
        )}
      </div>
    </Link>
  );
}

export default memo(ProductCard);
