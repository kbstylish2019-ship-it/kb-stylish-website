import dynamic from "next/dynamic";
import { notFound } from "next/navigation";
import type { ProductDetail, ProductVariant, ProductOption, Review, Media } from "@/lib/types";
import { fetchProductBySlug, fetchProductReviews, fetchProductRecommendations, type ProductWithVariants } from "@/lib/apiClient";
import CustomerReviews from "@/components/product/CustomerReviews";
import CompleteTheLook from "@/components/product/CompleteTheLook";

// Lazy load product detail client for better performance
const ProductDetailClient = dynamic(
  () => import("@/components/product/ProductDetailClient"),
  {
    loading: () => (
      <div className="mx-auto max-w-7xl px-4 py-10">
        <div className="h-96 animate-pulse bg-white/5 rounded-xl" />
      </div>
    ),
  }
);

// Transform raw database product to ProductDetail type
function transformToProductDetail(data: ProductWithVariants): ProductDetail {
  const { product: raw, variants, images, inventory } = data;
  
  // Extract unique options from variants
  const optionsMap = new Map<string, Set<string>>();
  variants.forEach((variant: any) => {
    if (variant.attributes) {
      Object.entries(variant.attributes).forEach(([key, value]) => {
        if (!optionsMap.has(key)) {
          optionsMap.set(key, new Set());
        }
        optionsMap.get(key)!.add(String(value));
      });
    }
  });
  
  // Convert to ProductOption format
  const options: ProductOption[] = Array.from(optionsMap.entries()).map(([name, valuesSet]) => ({
    id: name.toLowerCase().replace(/\s+/g, '-'),
    name,
    values: Array.from(valuesSet).sort()
  }));
  
  // Transform variants to match ProductVariant interface
  const transformedVariants: ProductVariant[] = variants.map((v: any) => ({
    id: v.id,
    options: v.attributes || {},
    price: v.price || raw.price || 0,
    stock: inventory[v.id]?.quantity_available || 0,
    sku: v.sku || v.id
  }));
  
  // Transform images
  const transformedImages: Media[] = images
    .sort((a: any, b: any) => (a.sort_order || 0) - (b.sort_order || 0))
    .map((img: any) => ({
      url: img.image_url || '/placeholder-product.jpg',
      alt: img.alt_text || raw.name || 'Product image'
    }));
  
  // Calculate stock status
  const totalStock = Object.values(inventory).reduce(
    (sum: number, inv: any) => sum + (inv.quantity_available || 0), 
    0
  );
  const stockStatus = totalStock === 0 ? 'out_of_stock' : 
                      totalStock < 10 ? 'low_stock' : 'in_stock';
  
  // Get price range from variants
  const prices = transformedVariants.map(v => v.price).filter(p => p > 0);
  const minPrice = prices.length > 0 ? Math.min(...prices) : (raw.price || 0);
  const maxPrice = prices.length > 0 ? Math.max(...prices) : (raw.price || 0);
  
  // Mock reviews for now (would come from database in production)
  const reviews: Review[] = [
    {
      id: "r1",
      author: "Anisha S.",
      rating: 5,
      title: "Excellent quality",
      content: "Amazing product, exactly as described. Fast delivery!",
      date: new Date().toISOString().split('T')[0]
    }
  ];
  
  return {
    id: raw.id,
    slug: raw.slug,
    name: raw.name || 'Unnamed Product',
    description: raw.description || 'No description available',
    price: minPrice,
    compareAtPrice: maxPrice > minPrice ? maxPrice : undefined,
    currency: "NPR",
    vendor: {
      id: raw.vendor_id || 'unknown',
      name: raw.vendor?.display_name || 'KB Stylish',
      rating: 4.8
    },
    images: transformedImages.length > 0 ? transformedImages : [
      { url: '/placeholder-product.jpg', alt: 'Product placeholder' }
    ],
    options,
    variants: transformedVariants,
    badges: raw.is_featured ? ['Featured'] : [],
    avgRating: raw.average_rating || 0,
    reviewCount: raw.review_count || 0,
    reviews,
    stockStatus,
    shipping: {
      estimated: "2-4 days in KTM | 3-6 days nationwide",
      cost: "Free over NPR 2,000 | NPR 99 standard",
      codAvailable: true
    },
    returns: {
      days: 7,
      summary: "7-day easy returns on unused items with tags."
    }
  };
}

export default async function ProductPage(props: { params: Promise<{ slug: string }> }) {
  const params = await props.params;
  const { slug } = params;
  
  // Fetch product from database with caching
  const productData = await fetchProductBySlug(slug);
  
  // Handle product not found
  if (!productData) {
    notFound();
  }
  
  // Transform to ProductDetail type
  const product: ProductDetail = transformToProductDetail(productData);
  
  // Fetch real recommendations from curation engine (self-healing: auto-filters inactive/out-of-stock)
  const recommendations = await fetchProductRecommendations(product.id, 4);
  
  // TEMP FIX: Skip server-side review fetching to avoid duplicates
  // The client-side Edge Function (review-manager v7) handles review fetching
  const initialReviews: any[] = [];
  const reviewStats = {
    average: product.avgRating,
    total: product.reviewCount,
    distribution: {}
  };

  // Review eligibility will be determined client-side via API call
  // This prevents SSR hydration issues with auth state
  // The API endpoint /api/user/reviews/eligibility will verify:
  // 1. User is authenticated
  // 2. User has purchased this product
  // 3. Order is delivered/completed
  // 4. Review window hasn't expired (90 days)
  // 5. User hasn't already reviewed this product

  return (
    <main>
      <ProductDetailClient product={product} />
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <CustomerReviews 
          productId={product.id}
          avgRating={reviewStats.average} 
          reviewCount={reviewStats.total} 
          initialReviews={initialReviews}
          stats={reviewStats}
        />
        <CompleteTheLook 
          recommendations={recommendations}
          sourceProductId={product.id}
        />
      </div>
    </main>
  );
}
