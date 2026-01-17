'use client';

import React, { useState, useEffect } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ChevronRight,
  Package,
  ShoppingCart,
  Check,
  Truck,
  Shield,
  RotateCcw,
  AlertTriangle,
  Sparkles,
} from 'lucide-react';
import { COMBO_CONFIG } from '@/lib/constants/combo';
import type { ComboProduct, ComboItem, ComboAvailability } from '@/types/combo';
import { formatNPR, cn } from '@/lib/utils';
import { cartAPI } from '@/lib/api/cartClient';

interface ComboDetailClientProps {
  combo: ComboProduct;
  constituents: ComboItem[];
}

export default function ComboDetailClient({ combo, constituents }: ComboDetailClientProps) {
  const router = useRouter();
  const [selectedImage, setSelectedImage] = useState(0);
  const [isAddingToCart, setIsAddingToCart] = useState(false);
  const [addedToCart, setAddedToCart] = useState(false);
  const [availability, setAvailability] = useState<ComboAvailability | null>(null);
  const [isLoadingAvailability, setIsLoadingAvailability] = useState(true);

  // DEBUG: Log combo data on mount
  useEffect(() => {
    console.log('[ComboDetail] Combo:', combo);
    console.log('[ComboDetail] Constituents:', constituents);
    console.log('[ComboDetail] Constituents Length:', constituents.length);
    constituents.forEach((item, i) => {
      console.log(`[Constituent ${i}]:`, {
        product: item.product?.name,
        variant: item.variant,
        variantPrice: item.variant?.price,
        quantity: item.quantity
      });
    });
  }, [combo, constituents]);

  // Calculate prices
  // NOTE: Variant prices are in RUPEES, combo prices are in CENTS
  // Convert variant prices to cents for consistent calculation
  const originalPriceCents = constituents.reduce(
    (sum, item) => sum + ((item.variant?.price || 0) * 100) * item.quantity,
    0
  );
  
  console.log('[ComboDetail] originalPriceCents:', originalPriceCents);
  
  const savingsPercentage = originalPriceCents > 0 
    ? Math.round(((originalPriceCents - combo.combo_price_cents) / originalPriceCents) * 100)
    : 0;
  const comboRemaining = combo.combo_quantity_limit
    ? combo.combo_quantity_limit - combo.combo_quantity_sold
    : null;

  // Fetch availability on mount
  useEffect(() => {
    async function fetchAvailability() {
      try {
        const response = await fetch(`/api/products/combo/${combo.id}/availability`);
        if (response.ok) {
          const data = await response.json();
          setAvailability(data);
        }
      } catch (error) {
        console.error('Failed to fetch combo availability:', error);
      } finally {
        setIsLoadingAvailability(false);
      }
    }
    fetchAvailability();
  }, [combo.id]);

  const isAvailable = availability?.available ?? (comboRemaining === null || comboRemaining > 0);

  const handleAddToCart = async () => {
    if (!isAvailable || isAddingToCart) return;

    setIsAddingToCart(true);
    try {
      // Use the cartAPI client which handles authentication properly
      const result = await cartAPI.addComboToCart(combo.id);
      
      if (result.success) {
        setAddedToCart(true);
        setTimeout(() => setAddedToCart(false), 2000);
      } else {
        console.error('Failed to add combo to cart:', result.error);
        // Show user-friendly error message
        alert(result.error || 'Failed to add combo to cart. Please try again.');
      }
    } catch (error) {
      console.error('Failed to add combo to cart:', error);
      alert('Failed to add combo to cart. Please try again.');
    } finally {
      setIsAddingToCart(false);
    }
  };

  const handleBuyNow = async () => {
    if (!isAvailable) return;
    await handleAddToCart();
    router.push('/checkout');
  };

  // Get combo images (use first constituent images if combo has none)
  const images = combo.images?.length
    ? combo.images
    : constituents
        .filter((c) => c.product?.images?.[0])
        .slice(0, 4)
        .map((c) => c.product!.images![0]);

  return (
    <div className="min-h-screen bg-[#F5F5F5]">
      {/* Breadcrumb */}
      <div className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-4 py-3">
          <nav className="flex items-center gap-2 text-sm text-gray-500">
            <Link href="/" className="hover:text-[#1976D2]">Home</Link>
            <ChevronRight className="h-4 w-4" />
            <Link href="/shop" className="hover:text-[#1976D2]">Shop</Link>
            <ChevronRight className="h-4 w-4" />
            <span className="text-gray-800 font-medium line-clamp-1">{combo.name}</span>
          </nav>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="bg-white rounded-lg shadow-sm overflow-hidden">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-0">
            {/* Left: Image Gallery */}
            <div className="p-6 border-b lg:border-b-0 lg:border-r">
              {/* Main Image */}
              <div className="relative aspect-square bg-gradient-to-br from-purple-50 to-indigo-50 rounded-lg overflow-hidden mb-4">
                {/* Combo Badge */}
                <div className="absolute top-4 left-4 z-10 flex items-center gap-2">
                  <span className="bg-gradient-to-r from-purple-600 to-indigo-600 text-white text-sm font-bold px-3 py-1 rounded-full flex items-center gap-1">
                    <Package className="h-4 w-4" />
                    {COMBO_CONFIG.LABELS.BADGE}
                  </span>
                  {savingsPercentage > 0 && (
                    <span className="bg-green-500 text-white text-sm font-bold px-3 py-1 rounded-full">
                      -{savingsPercentage}%
                    </span>
                  )}
                </div>

                {images[selectedImage] && (
                  <Image
                    src={typeof images[selectedImage] === 'string' ? images[selectedImage] : images[selectedImage].url}
                    alt={combo.name}
                    fill
                    className="object-contain p-8"
                    priority
                  />
                )}
              </div>

              {/* Thumbnail Gallery */}
              {images.length > 1 && (
                <div className="flex gap-2 overflow-x-auto pb-2">
                  {images.map((img, idx) => (
                    <button
                      key={idx}
                      onClick={() => setSelectedImage(idx)}
                      className={cn(
                        'flex-shrink-0 w-16 h-16 rounded-lg overflow-hidden border-2 transition-colors',
                        selectedImage === idx
                          ? 'border-purple-500'
                          : 'border-gray-200 hover:border-gray-300'
                      )}
                    >
                      <Image
                        src={typeof img === 'string' ? img : img.url}
                        alt={`${combo.name} ${idx + 1}`}
                        width={64}
                        height={64}
                        className="object-contain w-full h-full"
                      />
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Right: Combo Info */}
            <div className="p-6">
              {/* Combo Name */}
              <h1 className="text-xl lg:text-2xl font-bold text-gray-800 leading-tight">
                {combo.name}
              </h1>

              {/* Limited Quantity Alert */}
              {comboRemaining !== null && comboRemaining <= 5 && comboRemaining > 0 && (
                <div
                  className="mt-3 flex items-center gap-2 text-amber-600 bg-amber-50 px-3 py-2 rounded-lg"
                  role="alert"
                  aria-live="polite"
                >
                  <AlertTriangle className="h-4 w-4" />
                  <span className="text-sm font-medium">
                    Only {comboRemaining} {COMBO_CONFIG.LABELS.LIMITED_SUFFIX}
                  </span>
                </div>
              )}

              {/* Price Section */}
              <div className="mt-4 p-4 bg-gradient-to-r from-purple-50 to-indigo-50 rounded-lg border border-purple-100">
                <div className="flex items-baseline gap-3">
                  <span className="text-3xl font-bold text-purple-600">
                    {formatNPR(combo.combo_price_cents / 100)}
                  </span>
                  <span className="text-lg text-gray-400 line-through">
                    {formatNPR(originalPriceCents / 100)}
                  </span>
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-green-500" />
                  <span className="text-sm font-semibold text-green-600">
                    {COMBO_CONFIG.LABELS.SAVINGS_PREFIX} {formatNPR(combo.combo_savings_cents / 100)} ({savingsPercentage}%)
                  </span>
                </div>
                <p className="text-xs text-gray-500 mt-1">Inclusive of all taxes</p>
              </div>

              {/* What's Included */}
              <div className="mt-6">
                <h2 className="text-lg font-semibold text-gray-800 mb-3 flex items-center gap-2">
                  <Package className="h-5 w-5 text-purple-500" />
                  What&apos;s Included ({constituents.length} items)
                </h2>
                <ul className="space-y-3">
                  {constituents.map((item, index) => (
                    <li
                      key={item.id || index}
                      className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg border border-gray-100"
                    >
                      {/* Item Image */}
                      <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-md border border-gray-200 bg-white">
                        {item.product?.images?.[0] ? (
                          <Image
                            src={item.product.images[0].url || item.product.images[0]}
                            alt={item.product?.name || 'Product'}
                            fill
                            className="object-cover"
                            sizes="56px"
                          />
                        ) : (
                          <div className="flex size-full items-center justify-center text-xs text-gray-400">
                            <Package className="w-4 h-4" />
                          </div>
                        )}
                      </div>

                      {/* Item Details */}
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-gray-900 truncate">
                          {item.product?.name || 'Product'}
                        </div>
                        {item.variant && (
                          <div className="text-xs text-gray-500">
                            {item.variant.options
                              ? Object.values(item.variant.options).join(' / ')
                              : ''}
                          </div>
                        )}
                        {item.quantity > 1 && (
                          <div className="text-xs text-purple-600 font-medium">
                            Qty: {item.quantity}
                          </div>
                        )}
                      </div>

                      {/* Item Price */}
                      <div className="text-right">
                        <div className="text-sm font-medium text-gray-700">
                          {formatNPR(item.variant?.price || 0)}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Action Buttons */}
              <div className="mt-6 flex gap-3">
                <button
                  onClick={handleAddToCart}
                  disabled={!isAvailable || isAddingToCart}
                  aria-label={COMBO_CONFIG.LABELS.ADD_TO_CART}
                  className={cn(
                    'flex-1 py-4 rounded-lg font-semibold text-lg flex items-center justify-center gap-2 transition-all',
                    addedToCart
                      ? 'bg-green-500 text-white'
                      : isAvailable
                        ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white hover:from-purple-700 hover:to-indigo-700'
                        : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                  )}
                >
                  {addedToCart ? (
                    <>
                      <Check className="h-5 w-5" />
                      Added to Cart
                    </>
                  ) : isAddingToCart ? (
                    'Adding...'
                  ) : !isAvailable ? (
                    COMBO_CONFIG.LABELS.SOLD_OUT
                  ) : (
                    <>
                      <ShoppingCart className="h-5 w-5" />
                      {COMBO_CONFIG.LABELS.ADD_TO_CART}
                    </>
                  )}
                </button>
              </div>

              {/* Trust Badges */}
              <div className="mt-6 grid grid-cols-3 gap-4">
                <div className="text-center p-3 bg-gray-50 rounded-lg">
                  <Truck className="h-6 w-6 mx-auto text-purple-500 mb-1" />
                  <p className="text-xs font-medium text-gray-700">Free Delivery</p>
                  <p className="text-[10px] text-gray-500">Above Rs. 2000</p>
                </div>
                <div className="text-center p-3 bg-gray-50 rounded-lg">
                  <Shield className="h-6 w-6 mx-auto text-purple-500 mb-1" />
                  <p className="text-xs font-medium text-gray-700">Genuine Products</p>
                  <p className="text-[10px] text-gray-500">100% Authentic</p>
                </div>
                <div className="text-center p-3 bg-gray-50 rounded-lg">
                  <RotateCcw className="h-6 w-6 mx-auto text-purple-500 mb-1" />
                  <p className="text-xs font-medium text-gray-700">Easy Returns</p>
                  <p className="text-[10px] text-gray-500">7 Days Policy</p>
                </div>
              </div>
            </div>
          </div>

          {/* Product Description */}
          {combo.description && (
            <div className="border-t p-6">
              <h2 className="text-lg font-bold text-gray-800 mb-4">Bundle Description</h2>
              <div className="prose prose-sm max-w-none text-gray-600">
                <p>{combo.description}</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
