"use client";
import React, { useState, useMemo } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ProductDetail, ProductVariant } from "@/lib/types";
import { 
  ChevronRight, 
  Star, 
  Heart, 
  Share2, 
  Truck, 
  Shield, 
  RotateCcw, 
  Minus, 
  Plus,
  ShoppingCart,
  Check,
  Store,
  Zap
} from "lucide-react";
import { useDecoupledCartStore } from "@/lib/store/decoupledCartStore";

type ProductSelection = { [key: string]: string | undefined };

function findVariant(variants: ProductVariant[], selection: ProductSelection) {
  return variants.find((v) =>
    Object.entries(selection).every(([k, val]) => val && v.options[k] === val)
  );
}

export default function ProductDetailClient({ product }: { product: ProductDetail }) {
  const router = useRouter();
  const initial: ProductSelection = Object.fromEntries(product.options.map((o) => [o.name, undefined]));
  const [selection, setSelection] = useState<ProductSelection>(initial);
  const [selectedImage, setSelectedImage] = useState(0);
  const [quantity, setQuantity] = useState(1);
  const [isWishlisted, setIsWishlisted] = useState(false);
  const [isAddingToCart, setIsAddingToCart] = useState(false);
  const [isBuyingNow, setIsBuyingNow] = useState(false);
  const [addedToCart, setAddedToCart] = useState(false);

  const addProductItem = useDecoupledCartStore((state) => state.addProductItem);

  const selectedVariant = useMemo(
    () => findVariant(product.variants, selection),
    [product.variants, selection]
  );

  const currentPrice = selectedVariant?.price ?? product.price;
  const currentStock = selectedVariant?.stock ?? 0;
  const isInStock = product.stockStatus !== 'out_of_stock' && currentStock > 0;

  const discount = product.compareAtPrice && product.compareAtPrice > currentPrice
    ? Math.round(((product.compareAtPrice - currentPrice) / product.compareAtPrice) * 100)
    : 0;

  const formatPrice = (amount: number) => `Rs. ${amount.toLocaleString('en-NP')}`;

  const handleQuantityChange = (delta: number) => {
    const newQty = quantity + delta;
    if (newQty >= 1 && newQty <= Math.min(currentStock, 10)) {
      setQuantity(newQty);
    }
  };

  const handleAddToCart = async () => {
    if (!isInStock) return;
    
    setIsAddingToCart(true);
    try {
      const variantId = selectedVariant?.id || product.variants[0]?.id || product.id;
      
      // Use decoupled cart store for proper cart functionality
      const success = await addProductItem(variantId, quantity, {
        product_id: product.id,
        product_name: product.name,
        price: currentPrice,
        image_url: product.images[0]?.url,
      });
      
      if (success) {
        setAddedToCart(true);
        setTimeout(() => setAddedToCart(false), 2000);
      }
    } catch (error) {
      console.error('Failed to add to cart:', error);
    } finally {
      setIsAddingToCart(false);
    }
  };

  const handleBuyNow = async () => {
    if (!isInStock) return;
    
    setIsBuyingNow(true);
    try {
      const variantId = selectedVariant?.id || product.variants[0]?.id || product.id;
      
      // Add to cart first
      const success = await addProductItem(variantId, quantity, {
        product_id: product.id,
        product_name: product.name,
        price: currentPrice,
        image_url: product.images[0]?.url,
      });
      
      if (success) {
        // Redirect to checkout immediately
        router.push('/checkout');
      }
    } catch (error) {
      console.error('Failed to buy now:', error);
    } finally {
      setIsBuyingNow(false);
    }
  };

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
            <span className="text-gray-800 font-medium line-clamp-1">{product.name}</span>
          </nav>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="bg-white rounded-lg shadow-sm overflow-hidden">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-0">
            {/* Left: Image Gallery */}
            <div className="p-6 border-b lg:border-b-0 lg:border-r">
              {/* Main Image */}
              <div className="relative aspect-square bg-gray-50 rounded-lg overflow-hidden mb-4">
                {discount > 0 && (
                  <div className="absolute top-4 left-4 z-10">
                    <span className="bg-[#E31B23] text-white text-sm font-bold px-3 py-1 rounded">
                      -{discount}%
                    </span>
                  </div>
                )}
                <button
                  onClick={() => setIsWishlisted(!isWishlisted)}
                  className="absolute top-4 right-4 z-10 w-10 h-10 bg-white rounded-full shadow-md flex items-center justify-center hover:bg-gray-50 transition-colors"
                >
                  <Heart className={`h-5 w-5 ${isWishlisted ? 'fill-red-500 text-red-500' : 'text-gray-400'}`} />
                </button>
                {product.images[selectedImage] && (
                  <Image
                    src={product.images[selectedImage].url}
                    alt={product.images[selectedImage].alt}
                    fill
                    className="object-contain p-8"
                    priority
                  />
                )}
              </div>

              {/* Thumbnail Gallery */}
              {product.images.length > 1 && (
                <div className="flex gap-2 overflow-x-auto pb-2">
                  {product.images.map((img, idx) => (
                    <button
                      key={idx}
                      onClick={() => setSelectedImage(idx)}
                      className={`flex-shrink-0 w-16 h-16 rounded-lg overflow-hidden border-2 transition-colors ${
                        selectedImage === idx ? 'border-[#1976D2]' : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <Image
                        src={img.url}
                        alt={img.alt}
                        width={64}
                        height={64}
                        className="object-contain w-full h-full"
                      />
                    </button>
                  ))}
                </div>
              )}

              {/* Share Button */}
              <div className="mt-4 flex items-center gap-4">
                <span className="text-sm text-gray-500">Share:</span>
                <button className="p-2 hover:bg-gray-100 rounded-full transition-colors">
                  <Share2 className="h-5 w-5 text-gray-500" />
                </button>
              </div>
            </div>

            {/* Right: Product Info */}
            <div className="p-6">
              {/* Badges */}
              {product.badges && product.badges.length > 0 && (
                <div className="flex gap-2 mb-3">
                  {product.badges.map((badge) => (
                    <span key={badge} className="bg-[#1976D2] text-white text-xs font-medium px-2 py-1 rounded">
                      {badge}
                    </span>
                  ))}
                </div>
              )}

              {/* Product Name */}
              <h1 className="text-xl lg:text-2xl font-bold text-gray-800 leading-tight">
                {product.name}
              </h1>

              {/* Rating & Reviews */}
              <div className="flex items-center gap-4 mt-3">
                <div className="flex items-center gap-1">
                  {[...Array(5)].map((_, i) => (
                    <Star
                      key={i}
                      className={`h-4 w-4 ${
                        i < Math.floor(product.avgRating)
                          ? 'fill-yellow-400 text-yellow-400'
                          : 'text-gray-300'
                      }`}
                    />
                  ))}
                  <span className="ml-1 text-sm font-medium text-gray-700">
                    {product.avgRating.toFixed(1)}
                  </span>
                </div>
                <span className="text-sm text-gray-500">
                  {product.reviewCount} Reviews
                </span>
              </div>

              {/* Price Section */}
              <div className="mt-4 p-4 bg-gray-50 rounded-lg">
                <div className="flex items-baseline gap-3">
                  <span className="text-3xl font-bold text-[#E31B23]">
                    {formatPrice(currentPrice)}
                  </span>
                  {product.compareAtPrice && product.compareAtPrice > currentPrice && (
                    <>
                      <span className="text-lg text-gray-400 line-through">
                        {formatPrice(product.compareAtPrice)}
                      </span>
                      <span className="text-sm font-medium text-green-600 bg-green-50 px-2 py-1 rounded">
                        Save {formatPrice(product.compareAtPrice - currentPrice)}
                      </span>
                    </>
                  )}
                </div>
                <p className="text-xs text-gray-500 mt-1">Inclusive of all taxes</p>
              </div>

              {/* Vendor Info */}
              <div className="mt-4 flex items-center gap-3 p-3 border rounded-lg">
                <div className="w-10 h-10 bg-[#1976D2] rounded-full flex items-center justify-center">
                  <Store className="h-5 w-5 text-white" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-800">{product.vendor.name}</p>
                  <div className="flex items-center gap-1 text-xs text-gray-500">
                    <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
                    <span>{product.vendor.rating?.toFixed(1) || '4.5'} Seller Rating</span>
                  </div>
                </div>
                <Link href={`/vendor/${product.vendor.id}`} className="text-sm text-[#1976D2] hover:underline">
                  Visit Store
                </Link>
              </div>

              {/* Product Options */}
              {product.options.length > 0 && (
                <div className="mt-6 space-y-4">
                  {product.options.map((option) => (
                    <div key={option.id}>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        {option.name}: <span className="text-[#1976D2]">{selection[option.name] || 'Select'}</span>
                      </label>
                      <div className="flex flex-wrap gap-2">
                        {option.values.map((value) => {
                          const isSelected = selection[option.name] === value;
                          // Check if this option value has any available variants
                          const variantsWithValue = product.variants.filter(v => v.options[option.name] === value);
                          const hasStock = variantsWithValue.some(v => (v.stock || 0) > 0);
                          const isUnavailable = variantsWithValue.length > 0 && !hasStock;
                          
                          return (
                            <div key={value} className="relative group">
                              <button
                                onClick={() => !isUnavailable && setSelection(prev => ({ ...prev, [option.name]: value }))}
                                disabled={isUnavailable}
                                className={`px-4 py-2 rounded-lg border text-sm font-medium transition-colors ${
                                  isUnavailable
                                    ? 'border-gray-200 bg-gray-100 text-gray-400 cursor-not-allowed line-through'
                                    : isSelected
                                      ? 'border-[#1976D2] bg-blue-50 text-[#1976D2]'
                                      : 'border-gray-300 text-gray-700 hover:border-gray-400'
                                }`}
                                title={isUnavailable ? 'Out of stock' : undefined}
                              >
                                {value}
                              </button>
                              {/* Tooltip for unavailable options */}
                              {isUnavailable && (
                                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-gray-800 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-10">
                                  Out of stock
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Quantity Selector */}
              <div className="mt-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">Quantity</label>
                <div className="flex items-center gap-4">
                  <div className="flex items-center border rounded-lg">
                    <button
                      onClick={() => handleQuantityChange(-1)}
                      disabled={quantity <= 1}
                      className="p-3 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      <Minus className="h-4 w-4" />
                    </button>
                    <span className="w-12 text-center font-medium">{quantity}</span>
                    <button
                      onClick={() => handleQuantityChange(1)}
                      disabled={quantity >= Math.min(currentStock, 10)}
                      className="p-3 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="flex flex-col">
                    {isInStock ? (
                      currentStock <= 5 ? (
                        <span className="text-sm font-medium text-amber-600 flex items-center gap-1">
                          <span className="inline-block w-2 h-2 bg-amber-500 rounded-full animate-pulse"></span>
                          Only {currentStock} left!
                        </span>
                      ) : currentStock < 10 ? (
                        <span className="text-sm text-amber-600">Only {currentStock} left in stock</span>
                      ) : (
                        <span className="text-sm text-green-600 flex items-center gap-1">
                          <Check className="h-4 w-4" />
                          In Stock
                        </span>
                      )
                    ) : (
                      <span className="text-sm font-medium text-red-500">Out of Stock</span>
                    )}
                    {selectedVariant && (
                      <span className="text-xs text-gray-500">
                        SKU: {selectedVariant.sku || 'N/A'}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="mt-6 flex gap-3">
                <button
                  onClick={handleAddToCart}
                  disabled={!isInStock || isAddingToCart}
                  className={`flex-1 py-4 rounded-lg font-semibold text-lg flex items-center justify-center gap-2 transition-all ${
                    addedToCart
                      ? 'bg-green-500 text-white'
                      : isInStock
                        ? 'bg-[#FFD400] text-gray-800 hover:bg-[#FFC107]'
                        : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                  }`}
                >
                  {addedToCart ? (
                    <>
                      <Check className="h-5 w-5" />
                      Added to Cart
                    </>
                  ) : isAddingToCart ? (
                    'Adding...'
                  ) : (
                    <>
                      <ShoppingCart className="h-5 w-5" />
                      Add to Cart
                    </>
                  )}
                </button>
                <button
                  onClick={handleBuyNow}
                  disabled={!isInStock || isBuyingNow}
                  className={`flex-1 py-4 rounded-lg font-semibold text-lg flex items-center justify-center gap-2 transition-colors ${
                    isInStock
                      ? 'bg-[#1976D2] text-white hover:bg-[#1565C0]'
                      : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                  }`}
                >
                  {isBuyingNow ? (
                    'Processing...'
                  ) : (
                    <>
                      <Zap className="h-5 w-5" />
                      Buy Now
                    </>
                  )}
                </button>
              </div>

              {/* Trust Badges */}
              <div className="mt-6 grid grid-cols-3 gap-4">
                <div className="text-center p-3 bg-gray-50 rounded-lg">
                  <Truck className="h-6 w-6 mx-auto text-[#1976D2] mb-1" />
                  <p className="text-xs font-medium text-gray-700">Free Delivery</p>
                  <p className="text-[10px] text-gray-500">Above Rs. 2000</p>
                </div>
                <div className="text-center p-3 bg-gray-50 rounded-lg">
                  <Shield className="h-6 w-6 mx-auto text-[#1976D2] mb-1" />
                  <p className="text-xs font-medium text-gray-700">Genuine Product</p>
                  <p className="text-[10px] text-gray-500">100% Authentic</p>
                </div>
                <div className="text-center p-3 bg-gray-50 rounded-lg">
                  <RotateCcw className="h-6 w-6 mx-auto text-[#1976D2] mb-1" />
                  <p className="text-xs font-medium text-gray-700">Easy Returns</p>
                  <p className="text-[10px] text-gray-500">7 Days Policy</p>
                </div>
              </div>
            </div>
          </div>

          {/* Product Description */}
          <div className="border-t p-6">
            <h2 className="text-lg font-bold text-gray-800 mb-4">Product Description</h2>
            <div className="prose prose-sm max-w-none text-gray-600">
              <p>{product.description}</p>
            </div>
          </div>

          {/* Shipping & Returns Info */}
          <div className="border-t p-6 bg-gray-50">
            <div className="grid md:grid-cols-2 gap-6">
              <div>
                <h3 className="font-semibold text-gray-800 mb-2">Shipping Information</h3>
                <ul className="text-sm text-gray-600 space-y-1">
                  <li>• {product.shipping?.estimated || '2-4 days in Kathmandu'}</li>
                  <li>• {product.shipping?.cost || 'Free delivery on orders above Rs. 2000'}</li>
                  {product.shipping?.codAvailable && <li>• Cash on Delivery available</li>}
                </ul>
              </div>
              <div>
                <h3 className="font-semibold text-gray-800 mb-2">Return Policy</h3>
                <ul className="text-sm text-gray-600 space-y-1">
                  <li>• {product.returns?.days || 7} days easy return</li>
                  <li>• {product.returns?.summary || 'Return unused items with original packaging'}</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
