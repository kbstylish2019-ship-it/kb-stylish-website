'use client';

import Image from "next/image";
import Link from "next/link";
import { ShoppingCart, Heart, Check, Loader2 } from "lucide-react";
import { useState } from "react";
import { useDecoupledCartStore } from "@/lib/store/decoupledCartStore";

interface MarketplaceProductCardProps {
  id: string;
  name: string;
  slug: string;
  price: number;
  originalPrice?: number | null;
  imageUrl?: string | null;
  badge?: string | null;
  rating?: number;
  soldCount?: number;
  variantId?: string; // Optional variant ID for direct add to cart
}

export default function MarketplaceProductCard({
  id,
  name,
  slug,
  price,
  originalPrice,
  imageUrl,
  badge,
  rating,
  soldCount,
  variantId,
}: MarketplaceProductCardProps) {
  const [isWishlisted, setIsWishlisted] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [justAdded, setJustAdded] = useState(false);
  
  const addProductItem = useDecoupledCartStore((state) => state.addProductItem);

  const discount = originalPrice && originalPrice > price
    ? Math.round(((originalPrice - price) / originalPrice) * 100)
    : 0;

  const savings = originalPrice && originalPrice > price
    ? originalPrice - price
    : 0;

  const formatPrice = (amount: number) => {
    return `Rs. ${amount.toLocaleString('en-NP')}`;
  };

  const handleAddToCart = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (isAdding || justAdded) return;
    
    setIsAdding(true);
    
    try {
      // If we have a variantId, use it directly
      // Otherwise, we need to fetch the default variant for this product
      let targetVariantId = variantId;
      
      if (!targetVariantId) {
        // Fetch the default variant for this product
        const response = await fetch(`/api/products/${slug}/default-variant`);
        if (response.ok) {
          const data = await response.json();
          targetVariantId = data.variantId;
        }
      }
      
      if (targetVariantId) {
        const success = await addProductItem(targetVariantId, 1, {
          product_id: id,
          product_name: name,
          price: price,
          image_url: imageUrl || undefined,
        });
        
        if (success) {
          setJustAdded(true);
          setTimeout(() => setJustAdded(false), 2000);
        }
      } else {
        // If no variant found, redirect to product page
        window.location.href = `/product/${slug}`;
      }
    } catch (error) {
      console.error('Failed to add to cart:', error);
      // Redirect to product page on error
      window.location.href = `/product/${slug}`;
    } finally {
      setIsAdding(false);
    }
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden hover:shadow-lg transition-shadow group">
      {/* Image Container */}
      <Link href={`/product/${slug}`} className="block relative aspect-square bg-gray-100">
        {/* Discount Badge */}
        {discount > 0 && (
          <div className="absolute top-2 left-2 z-10">
            <span className="bg-[#E31B23] text-white text-[10px] font-bold px-2 py-1 rounded">
              SAVE Rs.{savings.toLocaleString('en-NP')}
            </span>
          </div>
        )}

        {/* Badge (New, Trending, etc.) */}
        {badge && !discount && (
          <div className="absolute top-2 left-2 z-10">
            <span className="bg-[#1976D2] text-white text-[10px] font-bold px-2 py-1 rounded">
              {badge}
            </span>
          </div>
        )}

        {/* Wishlist Button */}
        <button
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setIsWishlisted(!isWishlisted);
          }}
          className="absolute top-2 right-2 z-10 w-8 h-8 bg-white rounded-full shadow-md flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
          aria-label={isWishlisted ? "Remove from wishlist" : "Add to wishlist"}
        >
          <Heart
            className={`h-4 w-4 ${isWishlisted ? 'fill-red-500 text-red-500' : 'text-gray-400'}`}
          />
        </button>

        {/* Product Image */}
        {imageUrl && !imageError ? (
          <Image
            src={imageUrl}
            alt={name}
            fill
            className="object-contain p-4 group-hover:scale-105 transition-transform duration-300"
            onError={() => setImageError(true)}
            sizes="200px"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-gray-400">
            <ShoppingCart className="h-12 w-12" />
          </div>
        )}
      </Link>

      {/* Product Info */}
      <div className="p-3">
        {/* Product Name */}
        <Link href={`/product/${slug}`}>
          <h3 className="text-sm text-gray-800 font-medium line-clamp-2 min-h-[40px] hover:text-[#1976D2] transition-colors">
            {name}
          </h3>
        </Link>

        {/* Rating & Sold Count */}
        {(rating || soldCount) && (
          <div className="flex items-center gap-2 mt-1 text-xs text-gray-500">
            {rating && (
              <span className="flex items-center gap-1">
                <span className="text-yellow-500">★</span>
                {rating.toFixed(1)}
              </span>
            )}
            {soldCount && <span>{soldCount}+ sold</span>}
          </div>
        )}

        {/* Price Section */}
        <div className="mt-2">
          <div className="flex items-baseline gap-2">
            <span className="text-lg font-bold text-[#E31B23]">
              {formatPrice(price)}
            </span>
            {originalPrice && originalPrice > price && (
              <span className="text-xs text-gray-400 line-through">
                {formatPrice(originalPrice)}
              </span>
            )}
          </div>
          {discount > 0 && (
            <span className="text-xs text-green-600 font-medium">
              {discount}% OFF
            </span>
          )}
        </div>

        {/* Add to Cart Button */}
        <button
          onClick={handleAddToCart}
          disabled={isAdding}
          className={`w-full mt-3 py-2 border-2 text-sm font-semibold rounded-lg transition-all flex items-center justify-center gap-2 ${
            justAdded
              ? 'border-green-500 bg-green-500 text-white'
              : 'border-[#1976D2] text-[#1976D2] hover:bg-[#1976D2] hover:text-white'
          } disabled:opacity-50 disabled:cursor-not-allowed`}
        >
          {isAdding ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Adding...
            </>
          ) : justAdded ? (
            <>
              <Check className="h-4 w-4" />
              Added!
            </>
          ) : (
            <>
              <ShoppingCart className="h-4 w-4" />
              ADD
            </>
          )}
        </button>
      </div>
    </div>
  );
}
