import type { Product } from "@/lib/types";
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { Redis } from '@upstash/redis';
import { unstable_noStore as noStore } from 'next/cache';

// API client for server-side data fetching with multi-layered caching
// Implements Production-Grade Blueprint v2.1 with:
// L1: Vercel KV Cache (1ms latency)
// L2: PostgreSQL Materialized View (10ms latency)  
// L3: Direct PostgreSQL queries (50ms latency)

// NOTE: Cart API has been moved to /lib/api/cartClient.ts for client-side usage

// Redis client initialization
// Using KV_* variables from Vercel integration (these are Upstash Redis endpoints)
const redis = new Redis({
  url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN!,
});

// Cache configuration
const CACHE_TTL = 300; // 5 minutes in seconds
const CACHE_PREFIX = {
  PRODUCT: 'product:',
  VENDOR_PRODUCTS: 'vendor:',
  CATEGORY: 'category:',
  SEARCH_INDEX: 'search:'
};

// Performance monitoring
interface CacheMetrics {
  hits: number;
  misses: number;
  errors: number;
}

const cacheMetrics: CacheMetrics = {
  hits: 0,
  misses: 0,
  errors: 0
};

export interface UserProfile {
  id: string;
  username: string;
  display_name: string;
  avatar_url?: string;
  bio?: string;
  is_verified: boolean;
  role_version: number;
  created_at: string;
  updated_at: string;
}

export interface ProductFilters {
  search?: string;
  categories?: string[];
  minPrice?: number;
  maxPrice?: number;
}

export interface ProductSort {
  field: "name" | "price" | "created_at";
  order: "asc" | "desc";
}

export interface PaginationParams {
  cursor?: string;
  limit?: number;
}

export interface ProductsResponse {
  data: Product[];
  nextCursor?: string;
  totalCount: number;
  hasMore: boolean;
}

export interface ProductWithVariants {
  product: any;
  variants: any[];
  images: any[];
  inventory: Record<string, any>;
}

export interface CacheStatus {
  source: 'KV_CACHE' | 'MATERIALIZED_VIEW' | 'DATABASE' | 'MOCK';
  latency: number;
  cached: boolean;
}

export interface FetchProductsParams {
  filters?: ProductFilters;
  sort?: ProductSort;
  pagination?: PaginationParams;
}

// Mock dataset - In production, this would be replaced with actual Supabase calls
const MOCK_PRODUCTS: Product[] = [
  {
    id: "p1",
    name: "Classic Denim Jacket",
    price: 3499,
    badge: "Trending",
    category: "streetwear",
    imageUrl: "https://images.unsplash.com/photo-1516822003754-cca485356ecb?q=80&w=1200&auto=format&fit=crop",
  },
  {
    id: "p2",
    name: "Silk Saree - Royal Plum",
    price: 7999,
    badge: "New",
    category: "ethnic",
    imageUrl: "https://unsplash.com/photos/wcgCFUi_Zws/download?force=true&w=1200&q=80",
  },
  {
    id: "p3",
    name: "Minimalist Leather Watch",
    price: 5999,
    category: "formal",
    imageUrl: "https://images.unsplash.com/photo-1511385348-a52b4a160dc2?q=80&w=1200&auto=format&fit=crop",
  },
  {
    id: "p4",
    name: "K-Beauty Skincare Set",
    price: 2599,
    category: "casual",
    imageUrl: "https://unsplash.com/photos/ayBCtRueEtI/download?force=true&w=1200&q=80",
  },
  {
    id: "p5",
    name: "Athleisure Joggers",
    price: 1999,
    category: "casual",
    imageUrl: "https://unsplash.com/photos/YiYv0FBNqjI/download?force=true&w=1200&q=80",
  },
  {
    id: "p6",
    name: "Himalayan Wool Scarf",
    price: 1499,
    category: "casual",
    imageUrl: "https://unsplash.com/photos/x4qSJ-nMmvk/download?force=true&w=1200&q=80",
  },
  {
    id: "p7",
    name: "Premium Formal Shirt",
    price: 2799,
    category: "formal",
    imageUrl: "https://unsplash.com/photos/Xo4YvBp6IBM/download?force=true&w=1200&q=80",
  },
  {
    id: "p8",
    name: "Streetwear Hoodie - Onyx",
    price: 3299,
    category: "streetwear",
    imageUrl: "https://unsplash.com/photos/XEmkHQXAHFs/download?force=true&w=1200&q=80",
  },
  // Additional products to simulate larger dataset
  {
    id: "p9",
    name: "Designer Kurta Set",
    price: 4599,
    category: "ethnic",
    imageUrl: "https://images.unsplash.com/photo-1583391733956-6c78276477e2?q=80&w=1200&auto=format&fit=crop",
  },
  {
    id: "p10",
    name: "Casual Cotton Tee",
    price: 899,
    badge: "Popular",
    category: "casual",
    imageUrl: "https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?q=80&w=1200&auto=format&fit=crop",
  },
];

/**
 * Fetches products from Supabase with advanced filtering and caching
 * Implements L2/L3 cache layers with real database queries
 * 
 * @param params - Filter, sort, and pagination parameters
 * @returns Promise resolving to paginated product results
 */
export async function fetchProducts(params: FetchProductsParams = {}): Promise<ProductsResponse> {
  noStore(); // Disable Next.js cache for real-time data
  const startTime = Date.now();

  try {
    const supabase = await createClient();
    const { filters = {}, sort = { field: "name", order: "asc" }, pagination = {} } = params;
    const { cursor, limit = 12 } = pagination;

    // Build complex query with joins for product data
    // Note: vendor_id references user_profiles, not vendor_profiles
    let query = supabase
      .from('products')
      .select(`
        id,
        name,
        slug,
        description,
        is_featured,
        created_at,
        updated_at,
        categories(
          id,
          name,
          slug
        ),
        product_variants(
          id,
          price,
          inventory(
            quantity_available
          )
        ),
        product_images(
          image_url,
          sort_order
        ),
        user_profiles(
          id,
          display_name
        )
      `, { count: 'exact' })
      .eq('is_active', true);

    // Apply search filter using ilike for text search
    if (filters.search) {
      const searchTerm = `%${filters.search}%`;
      query = query.or(`name.ilike.${searchTerm},description.ilike.${searchTerm}`);
    }

    // Apply category filter
    // Note: We need to filter by category_id since we're joining categories table
    if (filters.categories && filters.categories.length > 0) {
      // First get category IDs from slugs
      const { data: categoryData } = await supabase
        .from('categories')
        .select('id')
        .in('slug', filters.categories);

      if (categoryData && categoryData.length > 0) {
        const categoryIds = categoryData.map((c: any) => c.id);
        query = query.in('category_id', categoryIds);
      }
    }

    // Apply price filters (we'll filter after getting data due to aggregation complexity)
    // For now, we'll implement basic filtering and optimize later with materialized views

    // Apply sorting
    let orderField = 'name';
    let ascending = sort.order === 'asc';

    switch (sort.field) {
      case 'created_at':
        orderField = 'created_at';
        break;
      case 'name':
        orderField = 'name';
        break;
      case 'price':
        // Price sorting will be handled post-query due to aggregation
        orderField = 'name';
        break;
      default:
        orderField = 'name';
    }

    query = query.order(orderField, { ascending });

    // Apply pagination
    if (cursor) {
      query = query.gt('id', cursor);
    }

    // Fetch more than needed to account for price filtering
    const fetchLimit = Math.min(limit * 2, 50);
    query = query.limit(fetchLimit);

    const { data, error, count } = await query;

    if (error) {
      console.error('Error fetching products from Supabase:', error);
      // Fallback to mock data if database is unavailable
      return fetchProductsMock(params);
    }

    const latency = Date.now() - startTime;
    console.log(`[CACHE L2/L3] Supabase Query - Latency: ${latency}ms, Records: ${data?.length || 0}`);

    // Debug: Log the raw data to see what's being returned
    if (data && data.length > 0) {
      console.log('[DEBUG] First product raw data:', JSON.stringify(data[0], null, 2));
    } else {
      console.log('[DEBUG] No products returned from query');
    }

    if (!data) {
      return {
        data: [],
        nextCursor: undefined,
        totalCount: 0,
        hasMore: false
      };
    }

    // Transform raw data into Product interface
    let transformedProducts: Product[] = data.map((rawProduct: any) => {
      // Calculate price from variants
      const prices = rawProduct.product_variants?.map((v: any) => v.price) || [];
      const minPrice = prices.length > 0 ? Math.min(...prices) : 0;
      const maxPrice = prices.length > 0 ? Math.max(...prices) : 0;

      // Calculate total inventory
      const totalInventory = rawProduct.product_variants?.reduce((total: number, variant: any) => {
        const inventory = variant.inventory?.[0]?.quantity_available || 0;
        return total + inventory;
      }, 0) || 0;

      // Get primary image
      const sortedImages = rawProduct.product_images?.sort((a: any, b: any) =>
        (a.sort_order || 0) - (b.sort_order || 0)
      ) || [];
      const primaryImage = sortedImages[0]?.image_url || '/placeholder-product.jpg';

      // Get vendor info from user_profiles
      const vendor = rawProduct.user_profiles?.[0];

      return {
        id: rawProduct.id,
        name: rawProduct.name,
        slug: rawProduct.slug,
        description: rawProduct.description,
        price: minPrice,
        maxPrice: maxPrice !== minPrice ? maxPrice : undefined,
        imageUrl: primaryImage,
        category: rawProduct.categories?.[0]?.name || 'Uncategorized',
        categorySlug: rawProduct.categories?.[0]?.slug || 'uncategorized',
        vendor: vendor ? {
          id: vendor.id,
          name: vendor.display_name || 'Unknown Vendor',
          slug: (vendor.display_name || 'vendor').toLowerCase().replace(/\s+/g, '-')
        } : {
          id: 'unknown',
          name: 'Unknown Vendor',
          slug: 'unknown'
        },
        inStock: totalInventory > 0,
        stockCount: totalInventory,
        isFeatured: rawProduct.is_featured || false,
        badge: rawProduct.is_featured ? 'Featured' : (totalInventory === 0 ? 'Out of Stock' : undefined),
        createdAt: rawProduct.created_at,
        updatedAt: rawProduct.updated_at
      };
    });

    // Apply price filters post-query
    if (filters.minPrice !== undefined) {
      transformedProducts = transformedProducts.filter((p: Product) => p.price >= filters.minPrice!);
    }

    if (filters.maxPrice !== undefined) {
      transformedProducts = transformedProducts.filter((p: Product) => p.price <= filters.maxPrice!);
    }

    // Apply price sorting if needed
    if (sort.field === 'price') {
      transformedProducts.sort((a: Product, b: Product) => {
        const comparison = a.price - b.price;
        return sort.order === 'asc' ? comparison : -comparison;
      });
    }

    // Apply final limit
    const finalProducts = transformedProducts.slice(0, limit);
    const hasMore = transformedProducts.length > limit;

    return {
      data: finalProducts,
      nextCursor: hasMore ? finalProducts[finalProducts.length - 1].id : undefined,
      totalCount: count || 0,
      hasMore
    };
  } catch (error) {
    console.error('fetchProducts error:', error);
    // Fallback to mock data
    return fetchProductsMock(params);
  }
}

/**
 * Fallback function using mock data when database is unavailable
 */
async function fetchProductsMock(params: FetchProductsParams = {}): Promise<ProductsResponse> {
  await new Promise(resolve => setTimeout(resolve, 100));

  const { filters = {}, sort = { field: "name", order: "asc" }, pagination = {} } = params;
  const { cursor, limit = 12 } = pagination;

  let filteredProducts = [...MOCK_PRODUCTS];

  // Apply search filter
  if (filters.search) {
    const searchTerm = filters.search.toLowerCase();
    filteredProducts = filteredProducts.filter(product =>
      product.name.toLowerCase().includes(searchTerm)
    );
  }

  // Apply category filters
  if (filters.categories && filters.categories.length > 0) {
    const categorySet = new Set(filters.categories);
    filteredProducts = filteredProducts.filter(product =>
      product.category && categorySet.has(product.category)
    );
  }

  // Apply price range filters
  if (filters.minPrice !== undefined) {
    filteredProducts = filteredProducts.filter(product => product.price >= filters.minPrice!);
  }

  if (filters.maxPrice !== undefined) {
    filteredProducts = filteredProducts.filter(product => product.price <= filters.maxPrice!);
  }

  // Apply sorting
  filteredProducts.sort((a, b) => {
    let comparison = 0;

    switch (sort.field) {
      case "name":
        comparison = a.name.localeCompare(b.name);
        break;
      case "price":
        comparison = a.price - b.price;
        break;
      case "created_at":
        // Simulate creation date based on product ID
        comparison = parseInt(a.id.slice(1)) - parseInt(b.id.slice(1));
        break;
    }

    return sort.order === "desc" ? -comparison : comparison;
  });

  // Apply cursor-based pagination
  let startIndex = 0;
  if (cursor) {
    const cursorIndex = filteredProducts.findIndex(product => product.id === cursor);
    startIndex = cursorIndex > -1 ? cursorIndex + 1 : 0;
  }

  const paginatedProducts = filteredProducts.slice(startIndex, startIndex + limit);
  const hasMore = startIndex + limit < filteredProducts.length;
  const nextCursor = hasMore && paginatedProducts.length > 0
    ? paginatedProducts[paginatedProducts.length - 1].id
    : undefined;

  return {
    data: paginatedProducts,
    nextCursor,
    totalCount: filteredProducts.length,
    hasMore,
  };
}

/**
 * Get available product categories for filter UI
 * Fetches from categories table
 */
export async function getProductCategories(): Promise<string[]> {
  noStore();

  const supabase = await createClient();

  try {
    const { data, error } = await supabase
      .from('categories')
      .select('slug')
      .eq('is_active', true)
      .order('sort_order')
      .order('name');

    if (error) {
      console.error('Error fetching categories:', error);
      return [];
    }

    return data?.map(c => c.slug) || [];
  } catch (error) {
    console.error('Error fetching categories:', error);
    return [];
  }
}

/**
 * Get price range for filter UI
 * In production, this would be a separate API endpoint or computed field
 */
export async function getPriceRange(): Promise<{ min: number; max: number }> {
  await new Promise(resolve => setTimeout(resolve, 50));

  const prices = MOCK_PRODUCTS.map(product => product.price);
  return {
    min: Math.min(...prices),
    max: Math.max(...prices),
  };
}

/**
 * Fetches a single product by slug with multi-layered caching
 * L1: Vercel KV Cache (1ms)
 * L2: PostgreSQL function get_product_with_variants (50ms)
 * 
 * @param slug - Product slug
 * @returns Product with variants, images, and inventory
 */
export async function fetchProductBySlug(slug: string): Promise<ProductWithVariants | null> {
  noStore();
  const startTime = Date.now();
  const cacheKey = `${CACHE_PREFIX.PRODUCT}${slug}`;

  try {
    // L1: Check Vercel KV Cache
    const supabase = await createClient();
    try {
      const cached = await redis.get<ProductWithVariants>(cacheKey);
      if (cached) {
        const latency = Date.now() - startTime;
        cacheMetrics.hits++;
        console.log(`[CACHE HIT] L1 Vercel KV - Key: ${cacheKey} - Latency: ${latency}ms`);

        // CRITICAL: Even on cache hit, fetch fresh review stats (volatile data)
        try {
          const { data: freshStats } = await supabase
            .from('products')
            .select('average_rating, review_count, rating_distribution')
            .eq('id', cached.product.id)
            .single();

          if (freshStats) {
            cached.product.average_rating = freshStats.average_rating;
            cached.product.review_count = freshStats.review_count;
            cached.product.rating_distribution = freshStats.rating_distribution;
          }
        } catch (statsError) {
          console.warn('Failed to fetch fresh stats on cache hit:', statsError);
        }

        return cached;
      }
    } catch (kvError) {
      console.warn('Vercel KV unavailable, falling back to database:', kvError);
      cacheMetrics.errors++;
    }

    // L2: Cache miss - fetch from PostgreSQL function
    cacheMetrics.misses++;
    console.log(`[CACHE MISS] L1 - Fetching from database for: ${cacheKey}`);

    const { data, error } = await supabase
      .rpc('get_product_with_variants', { product_slug: slug })
      .single<{
        product: any;
        variants: any[];
        images: any[];
        inventory: Record<string, any>;
      }>();

    if (error) {
      console.error('Error fetching product from database:', error);
      return null;
    }

    if (!data || !data.product) {
      console.log(`Product not found: ${slug}`);
      return null;
    }

    const productData: ProductWithVariants = {
      product: data.product,
      variants: data.variants || [],
      images: data.images || [],
      inventory: data.inventory || {}
    };

    // CRITICAL: Always fetch fresh review stats (don't cache these volatile fields)
    // Product stats change frequently when reviews are approved/submitted
    try {
      const { data: freshStats } = await supabase
        .from('products')
        .select('average_rating, review_count, rating_distribution')
        .eq('id', productData.product.id)
        .single();

      if (freshStats) {
        productData.product.average_rating = freshStats.average_rating;
        productData.product.review_count = freshStats.review_count;
        productData.product.rating_distribution = freshStats.rating_distribution;
      }
    } catch (statsError) {
      console.warn('Failed to fetch fresh stats:', statsError);
      // Continue with cached stats if fresh fetch fails
    }

    // Write to L1 cache (fire-and-forget)
    try {
      await redis.set(cacheKey, productData, {
        ex: CACHE_TTL // 5 minute TTL
      });
      console.log(`[CACHE WRITE] L1 - Key: ${cacheKey} - TTL: ${CACHE_TTL}s`);
    } catch (kvWriteError) {
      console.warn('Failed to write to Vercel KV:', kvWriteError);
    }

    const latency = Date.now() - startTime;
    console.log(`[CACHE L3] Database Query - Latency: ${latency}ms`);

    return productData;
  } catch (error) {
    console.error('fetchProductBySlug error:', error);
    return null;
  }
}

/**
 * Invalidates cache entries for a specific product
 * Called by the edge function when receiving NOTIFY events
 * 
 * @param slug - Product slug to invalidate
 */
export async function invalidateProductCache(slug: string): Promise<void> {
  const cacheKey = `${CACHE_PREFIX.PRODUCT}${slug}`;

  try {
    await redis.del(cacheKey);
    console.log(`[CACHE INVALIDATE] Deleted key: ${cacheKey}`);
  } catch (error) {
    console.error('Cache invalidation error:', error);
  }
}

/**
 * Gets current cache metrics for monitoring
 */
export function getCacheMetrics(): CacheMetrics {
  return { ...cacheMetrics };
}

// Create Supabase server client
async function createClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // The `setAll` method was called from a Server Component.
            // This can be ignored if you have middleware refreshing
            // user sessions.
          }
        },
      },
    }
  )
}

/**
 * Fetch all products for a specific vendor
 * @param vendorId - Vendor ID to fetch products for
 * @param params - Optional pagination and filtering parameters
 */
export async function fetchVendorProducts(
  vendorId: string,
  params: {
    pagination?: { cursor?: string; limit?: number };
    sort?: ProductSort;
  } = {}
): Promise<{
  data: Product[];
  totalCount: number;
  hasMore: boolean;
  nextCursor?: string;
}> {
  const { pagination = {}, sort = { field: 'name', order: 'asc' } } = params;
  const { cursor, limit = 12 } = pagination;

  const cacheKey = `vendor_products:${vendorId}:${sort.field}_${sort.order}:${cursor || 'first'}:${limit}`;

  console.log(`[CACHE L2/L3] Fetching vendor products for: ${vendorId}`);
  const startTime = Date.now();

  try {
    const supabase = await createClient();

    // Query products for specific vendor with all related data
    let query = supabase
      .from('products')
      .select(`
        id,
        slug,
        name,
        description,
        short_description,
        is_featured,
        created_at,
        updated_at,
        categories!inner(
          id,
          name,
          slug
        ),
        product_variants!inner(
          id,
          price,
          inventory(
            quantity_available
          )
        ),
        product_images(
          image_url,
          sort_order
        ),
        user_profiles!inner(
          id,
          display_name
        )
      `, { count: 'exact' })
      .eq('is_active', true)
      .eq('vendor_id', vendorId);

    // Apply sorting
    let orderField = 'name';
    let ascending = sort.order === 'asc';

    switch (sort.field) {
      case 'created_at':
        orderField = 'created_at';
        break;
      case 'name':
        orderField = 'name';
        break;
      case 'price':
        // For price sorting, we'll sort after aggregation
        orderField = 'name'; // Fallback to name sorting initially
        break;
      default:
        orderField = 'name';
    }

    query = query.order(orderField, { ascending });

    // Apply pagination
    if (cursor) {
      query = query.gt('created_at', cursor);
    }

    query = query.limit(limit + 1); // Get one extra to check if there are more

    const { data: rawProducts, error, count } = await query;
    const latency = Date.now() - startTime;
    console.log(`[CACHE L2/L3] Supabase Query - Latency: ${latency}ms, Records: ${rawProducts?.length || 0}`);

    if (error) {
      console.error('Error fetching vendor products from Supabase:', error);
      // Return empty result on error
      return {
        data: [],
        totalCount: 0,
        hasMore: false,
        nextCursor: undefined,
      };
    }

    // Transform and process the data
    const products = (rawProducts || []).map((rawProduct: any) => {
      // Calculate price range from variants
      const variantPrices = rawProduct.product_variants?.map((v: any) => v.price || 0).filter((p: number) => p > 0) || [];
      const minPrice = variantPrices.length > 0 ? Math.min(...variantPrices) : 0;
      const maxPrice = variantPrices.length > 0 ? Math.max(...variantPrices) : 0;

      // Calculate total inventory
      const totalInventory = rawProduct.product_variants?.reduce((total: number, variant: any) => {
        const inventory = variant.inventory?.reduce((sum: number, inv: any) => sum + (inv.quantity_available || 0), 0) || 0;
        return total + inventory;
      }, 0) || 0;

      // Get primary image
      const sortedImages = rawProduct.product_images?.sort((a: any, b: any) =>
        (a.sort_order || 0) - (b.sort_order || 0)
      ) || [];
      const primaryImage = sortedImages[0]?.image_url || '/placeholder-product.jpg';

      // Get vendor info from user_profiles
      const vendor = rawProduct.user_profiles?.[0];

      return {
        id: rawProduct.id,
        name: rawProduct.name,
        slug: rawProduct.slug,
        description: rawProduct.description,
        price: minPrice,
        maxPrice: maxPrice !== minPrice ? maxPrice : undefined,
        imageUrl: primaryImage,
        category: rawProduct.categories?.[0]?.name || 'Uncategorized',
        categorySlug: rawProduct.categories?.[0]?.slug || 'uncategorized',
        vendor: vendor ? {
          id: vendor.id,
          display_name: vendor.display_name || 'Unknown Vendor',
          is_verified: vendor.is_verified || false
        } : {
          id: 'unknown',
          display_name: 'Unknown Vendor',
          is_verified: false
        },
        inStock: totalInventory > 0,
        stockCount: totalInventory,
        isFeatured: rawProduct.is_featured || false,
        badge: rawProduct.is_featured ? 'Featured' : (totalInventory === 0 ? 'Out of Stock' : undefined),
        createdAt: rawProduct.created_at,
        updatedAt: rawProduct.updated_at
      };
    });

    // Handle pagination
    const hasMore = products.length > limit;
    const returnProducts = hasMore ? products.slice(0, limit) : products;
    const nextCursor = hasMore ? products[limit - 1].id : undefined;

    return {
      data: returnProducts,
      totalCount: count || 0,
      hasMore,
      nextCursor,
    };

  } catch (error) {
    console.error('fetchVendorProducts error:', error);
    return {
      data: [],
      totalCount: 0,
      hasMore: false,
      nextCursor: undefined,
    };
  }
}

/**
 * Get current user's profile from the database
 * Uses server-side Supabase client with RLS policies
 */
export async function getUserProfile(): Promise<UserProfile | null> {
  try {
    const supabase = await createClient()

    // Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser()

    if (userError || !user) {
      console.error('Error getting user:', userError)
      return null
    }

    // Fetch user profile with RLS enforcement
    const { data: profile, error: profileError } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('id', user.id)
      .single()

    if (profileError) {
      console.error('Error fetching user profile:', profileError)
      return null
    }

    return profile
  } catch (error) {
    console.error('getUserProfile error:', error)
    return null
  }
}

// =====================================================================
// BOOKING ENGINE API FUNCTIONS
// =====================================================================

export interface KBBranch {
  id: string;
  name: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  managerName: string | null;
  operatingHours: Record<string, any>;
  isActive: boolean;
  displayOrder: number;
}

export interface StylistWithServices {
  id: string;
  displayName: string;
  title: string;
  bio: string;
  yearsExperience: number;
  specialties: string[];
  timezone: string;
  isActive: boolean;
  ratingAverage: number | null;
  totalBookings: number;
  isFeatured: boolean;
  avatarUrl: string | null;
  branch?: KBBranch | null;
  services: BookingService[];
}

export interface BookingService {
  id: string;
  name: string;
  slug: string;
  description: string;
  category: string;
  durationMinutes: number;
  priceCents: number;
  customPriceCents?: number;
  customDurationMinutes?: number;
  requiresConsultation: boolean;
}

export interface AvailableSlot {
  slotStartUtc: string;
  slotEndUtc: string;
  slotStartLocal: string;
  slotEndLocal: string;
  slotDisplay: string;
  isAvailable: boolean;
  status: 'available' | 'booked' | 'reserved' | 'in_break' | 'unavailable';
  priceCents: number;
}

export interface BookingParams {
  stylistId: string;
  serviceId: string;
  startTime: string;
  customerName: string;
  customerPhone?: string;
  customerEmail?: string;
  customerNotes?: string;
}

export interface BookingResponse {
  success: boolean;
  bookingId?: string;
  variantId?: string;
  startTime?: string;
  endTime?: string;
  priceCents?: number;
  error?: string;
  code?: string;
}

/**
 * Fetch all active stylists with their services and branch information
 * Performs joins on stylist_profiles, stylist_services, services, and kb_branches
 */
export async function fetchActiveStylistsWithServices(branchId?: string): Promise<StylistWithServices[]> {
  noStore(); // Disable Next.js caching for real-time data
  const startTime = Date.now();

  try {
    const supabase = await createClient();

    // Build query with branch join and optional filtering
    let query = supabase
      .from('stylist_profiles')
      .select(`
        user_id,
        display_name,
        title,
        bio,
        years_experience,
        specialties,
        timezone,
        is_active,
        rating_average,
        total_bookings,
        is_featured,
        branch_id,
        user_profiles!inner (
          avatar_url
        ),
        kb_branches (
          id,
          name,
          address,
          phone,
          email,
          manager_name,
          operating_hours,
          is_active,
          display_order
        ),
        stylist_services!inner (
          service_id,
          custom_price_cents,
          custom_duration_minutes,
          is_available,
          services!inner (
            id,
            name,
            slug,
            description,
            category,
            duration_minutes,
            base_price_cents,
            requires_consultation,
            is_active
          )
        )
      `)
      .eq('is_active', true)
      .eq('stylist_services.is_available', true)
      .eq('stylist_services.services.is_active', true);

    // Add branch filter if specified
    if (branchId) {
      query = query.eq('branch_id', branchId);
    }

    const { data: stylists, error } = await query.order('display_name', { ascending: true });

    const latency = Date.now() - startTime;
    console.log(`[BOOKING API] Fetched stylists - Latency: ${latency}ms, Count: ${stylists?.length || 0}`);

    if (error) {
      console.error('Error fetching stylists:', error);
      return [];
    }

    // Transform the data
    return (stylists || []).map((stylist: any) => ({
      id: stylist.user_id,
      displayName: stylist.display_name,
      title: stylist.title || '',
      bio: stylist.bio || '',
      yearsExperience: stylist.years_experience || 0,
      specialties: stylist.specialties || [],
      timezone: stylist.timezone,
      isActive: stylist.is_active,
      ratingAverage: stylist.rating_average,
      totalBookings: stylist.total_bookings,
      isFeatured: stylist.is_featured || false,
      avatarUrl: stylist.user_profiles?.avatar_url || null,
      branch: stylist.kb_branches ? {
        id: stylist.kb_branches.id,
        name: stylist.kb_branches.name,
        address: stylist.kb_branches.address,
        phone: stylist.kb_branches.phone,
        email: stylist.kb_branches.email,
        managerName: stylist.kb_branches.manager_name,
        operatingHours: stylist.kb_branches.operating_hours || {},
        isActive: stylist.kb_branches.is_active,
        displayOrder: stylist.kb_branches.display_order || 0,
      } : null,
      services: (stylist.stylist_services || []).map((ss: any) => ({
        id: ss.services.id,
        name: ss.services.name,
        slug: ss.services.slug,
        description: ss.services.description || '',
        category: ss.services.category,
        durationMinutes: ss.custom_duration_minutes || ss.services.duration_minutes,
        priceCents: ss.custom_price_cents || ss.services.base_price_cents,
        customPriceCents: ss.custom_price_cents,
        customDurationMinutes: ss.custom_duration_minutes,
        requiresConsultation: ss.services.requires_consultation || false,
      }))
    }));

  } catch (error) {
    console.error('fetchActiveStylistsWithServices error:', error);
    return [];
  }
}

/**
 * Fetch all active KB Stylish branches for location filtering
 * Used in booking page and admin onboarding
 */
export async function fetchActiveBranches(): Promise<KBBranch[]> {
  noStore(); // Disable Next.js caching for real-time data
  const startTime = Date.now();

  try {
    const supabase = await createClient();

    const { data: branches, error } = await supabase
      .from('kb_branches')
      .select(`
        id,
        name,
        address,
        phone,
        email,
        manager_name,
        operating_hours,
        is_active,
        display_order
      `)
      .eq('is_active', true)
      .order('display_order', { ascending: true });

    const latency = Date.now() - startTime;
    console.log(`[BRANCHES API] Fetched branches - Latency: ${latency}ms, Count: ${branches?.length || 0}`);

    if (error) {
      console.error('Error fetching branches:', error);
      return [];
    }

    // Transform the data
    return (branches || []).map((branch: any) => ({
      id: branch.id,
      name: branch.name,
      address: branch.address,
      phone: branch.phone,
      email: branch.email,
      managerName: branch.manager_name,
      operatingHours: branch.operating_hours || {},
      isActive: branch.is_active,
      displayOrder: branch.display_order || 0,
    }));

  } catch (error) {
    console.error('fetchActiveBranches error:', error);
    return [];
  }
}

/**
 * Fetch available time slots for a stylist and service on a specific date
 * Calls the get_available_slots PostgreSQL RPC
 */
export async function fetchAvailableSlots(params: {
  stylistId: string;
  serviceId: string;
  targetDate: string; // YYYY-MM-DD format
  customerTimezone?: string;
}): Promise<AvailableSlot[]> {
  noStore();
  const startTime = Date.now();

  try {
    const supabase = await createClient();

    // Call the PostgreSQL function
    const { data: slots, error } = await supabase
      .rpc('get_available_slots', {
        p_stylist_id: params.stylistId,
        p_service_id: params.serviceId,
        p_target_date: params.targetDate,
        p_customer_timezone: params.customerTimezone || 'Asia/Kathmandu'
      });

    const latency = Date.now() - startTime;
    console.log(`[BOOKING API] Fetched slots - Latency: ${latency}ms, Count: ${slots?.length || 0}`);

    if (error) {
      console.error('Error fetching available slots:', error);
      return [];
    }

    // Transform the data (snake_case to camelCase)
    return (slots || []).map((slot: any) => {
      const status: AvailableSlot['status'] = (slot.status as any) || (slot.is_available ? 'available' : 'unavailable');
      return {
        slotStartUtc: slot.slot_start_utc,
        slotEndUtc: slot.slot_end_utc,
        slotStartLocal: slot.slot_start_local,
        slotEndLocal: slot.slot_end_local,
        slotDisplay: slot.slot_display,
        status,
        isAvailable: status === 'available',
        priceCents: slot.price_cents
      };
    });

  } catch (error) {
    console.error('fetchAvailableSlots error:', error);
    return [];
  }
}

/**
 * Create a booking by calling the create_booking PostgreSQL RPC
 * Requires authenticated user
 */
export async function createBooking(params: BookingParams): Promise<BookingResponse> {
  noStore();
  const startTime = Date.now();

  try {
    const supabase = await createClient();

    // Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      return {
        success: false,
        error: 'You must be logged in to book an appointment',
        code: 'AUTH_REQUIRED'
      };
    }

    // Call the PostgreSQL function
    const { data: result, error } = await supabase
      .rpc('create_booking', {
        p_customer_id: user.id,
        p_stylist_id: params.stylistId,
        p_service_id: params.serviceId,
        p_start_time: params.startTime,
        p_customer_name: params.customerName,
        p_customer_phone: params.customerPhone || null,
        p_customer_email: params.customerEmail || user.email || null,
        p_customer_notes: params.customerNotes || null
      });

    const latency = Date.now() - startTime;
    console.log(`[BOOKING API] Created booking - Latency: ${latency}ms, Success: ${result?.success || false}`);

    if (error) {
      console.error('Error creating booking:', error);
      return {
        success: false,
        error: 'Failed to create booking. Please try again.',
        code: 'BOOKING_ERROR'
      };
    }

    // The function returns JSONB, parse it if needed
    const bookingResult = typeof result === 'string' ? JSON.parse(result) : result;

    return {
      success: bookingResult.success || false,
      bookingId: bookingResult.booking_id,
      startTime: bookingResult.start_time,
      endTime: bookingResult.end_time,
      priceCents: bookingResult.price_cents,
      error: bookingResult.error,
      code: bookingResult.code
    };

  } catch (error) {
    console.error('createBooking error:', error);
    return {
      success: false,
      error: 'An unexpected error occurred. Please try again.',
      code: 'UNEXPECTED_ERROR'
    };
  }
}

/**
 * Fetch product reviews for server-side rendering
 * Direct database query for initial page load performance
 * Part of Trust Engine Integration Phase 1
 */
export async function fetchProductReviews(
  productId: string,
  options?: {
    limit?: number;
    cursor?: string;
    includeStats?: boolean;
  }
): Promise<{
  reviews: any[];
  stats?: any;
  nextCursor?: string;
  error?: string;
}> {
  noStore(); // Disable caching for fresh reviews

  try {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) {
            return cookieStore.get(name)?.value;
          }
        }
      }
    );

    // Build query with proper joins for user profiles and vendor replies
    let query = supabase
      .from('reviews')
      .select(`
        *,
        user:user_profiles!reviews_user_id_fkey(display_name, avatar_url),
        vendor_reply:review_replies(id, comment, created_at)
      `)
      .eq('product_id', productId)
      .eq('is_approved', true)
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

    // Apply pagination
    if (options?.cursor) {
      query = query.lt('created_at', options.cursor);
    }

    const limit = options?.limit || 20;
    query = query.limit(limit);

    const { data: reviews, error: reviewError } = await query;

    if (reviewError) {
      console.error('[fetchProductReviews] Query error:', reviewError);
      return {
        reviews: [],
        error: 'Failed to fetch reviews'
      };
    }

    // Fetch product stats if requested
    let stats = null;
    if (options?.includeStats && productId) {
      const { data: product, error: statsError } = await supabase
        .from('products')
        .select('average_rating, review_count, rating_distribution')
        .eq('id', productId)
        .single();

      if (!statsError && product) {
        stats = {
          average: product.average_rating || 0,
          total: product.review_count || 0,
          distribution: product.rating_distribution || {}
        };
      }
    }

    // Transform reviews to match expected format
    const transformedReviews = (reviews || []).map(review => ({
      id: review.id,
      product_id: review.product_id,
      user_id: review.user_id,
      order_id: review.order_id,
      rating: review.rating,
      title: review.title,
      comment: review.comment,
      helpful_votes: review.helpful_votes || 0,
      unhelpful_votes: review.unhelpful_votes || 0,
      is_verified: review.is_verified || false,
      is_edited: review.is_edited || false,
      created_at: review.created_at,
      updated_at: review.updated_at,
      user: review.user || { display_name: 'Anonymous', avatar_url: null },
      vendor_reply: review.vendor_reply?.[0] || null
    }));

    // Determine next cursor for pagination
    const nextCursor = transformedReviews.length === limit
      ? transformedReviews[transformedReviews.length - 1].created_at
      : undefined;

    console.log(`[fetchProductReviews] Fetched ${transformedReviews.length} reviews for product ${productId}`);

    return {
      reviews: transformedReviews,
      stats,
      nextCursor
    };
  } catch (error) {
    console.error('[fetchProductReviews] Unexpected error:', error);
    return {
      reviews: [],
      error: 'Unexpected error fetching reviews'
    };
  }
}

// =====================================================================
// GOVERNANCE ENGINE API FUNCTIONS
// =====================================================================

export interface VendorDashboardStats {
  vendor_id: string;
  today: {
    orders: number;
    gmv_cents: number;
    platform_fees_cents: number;
    refunds_cents: number;
  };
  last_30_days: {
    orders: number;
    gmv_cents: number;
    platform_fees_cents: number;
    pending_payout_cents: number;
    refunds_cents: number;
    payouts_cents: number;
  };
  generated_at: string;
}

export interface AdminDashboardStats {
  platform_overview: {
    total_users: number;
    total_vendors: number;
  };
  today: {
    orders: number;
    gmv_cents: number;
    platform_fees_cents: number;
  };
  last_30_days: {
    orders: number;
    gmv_cents: number;
    platform_fees_cents: number;
    pending_payouts_cents: number;
    refunds_cents: number;
  };
  generated_at: string;
  generated_by: string;
}

/**
 * Fetch vendor dashboard stats from Edge Function
 * Requires authenticated vendor user
 * 
 * @param accessToken - User's JWT access token
 * @param vendorId - Optional: Admin override for specific vendor
 * @returns Vendor dashboard metrics
 */
export async function fetchVendorDashboardStats(
  accessToken: string,
  vendorId?: string
): Promise<VendorDashboardStats | null> {
  noStore(); // Disable Next.js cache for real-time data
  const startTime = Date.now();

  try {
    const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!baseUrl) {
      console.error('[fetchVendorDashboardStats] NEXT_PUBLIC_SUPABASE_URL not configured');
      return null;
    }

    const url = vendorId
      ? `${baseUrl}/functions/v1/vendor-dashboard?vendor_id=${vendorId}`
      : `${baseUrl}/functions/v1/vendor-dashboard`;

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      cache: 'no-store', // Always fetch fresh data
    });

    const latency = Date.now() - startTime;
    console.log(`[DASHBOARD API] Vendor stats fetched - Latency: ${latency}ms, Status: ${response.status}`);

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Unknown error' }));
      console.error('[fetchVendorDashboardStats] Error response:', error);
      return null;
    }

    const result = await response.json();
    return result.data || null;

  } catch (error) {
    console.error('[fetchVendorDashboardStats] Exception:', error);
    return null;
  }
}

/**
 * Fetch admin dashboard stats from Edge Function
 * Requires authenticated admin user
 * 
 * @param accessToken - User's JWT access token (must have admin role)
 * @returns Admin dashboard metrics
 */
export async function fetchAdminDashboardStats(
  accessToken: string
): Promise<AdminDashboardStats | null> {
  noStore(); // Disable Next.js cache for real-time data
  const startTime = Date.now();

  try {
    const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!baseUrl) {
      console.error('[fetchAdminDashboardStats] NEXT_PUBLIC_SUPABASE_URL not configured');
      return null;
    }

    const url = `${baseUrl}/functions/v1/admin-dashboard`;

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      cache: 'no-store', // Always fetch fresh data
    });

    const latency = Date.now() - startTime;
    console.log(`[DASHBOARD API] Admin stats fetched - Latency: ${latency}ms, Status: ${response.status}`);

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Unknown error' }));
      console.error('[fetchAdminDashboardStats] Error response:', error);
      return null;
    }

    const result = await response.json();
    return result.data || null;

  } catch (error) {
    console.error('[fetchAdminDashboardStats] Exception:', error);
    return null;
  }
}

// =====================================================================
// VENDOR PRODUCTS MANAGEMENT API
// =====================================================================

export interface VendorProduct {
  id: string;
  name: string;
  slug: string;
  description: string;
  short_description?: string;
  is_active: boolean;
  is_featured: boolean;
  category_name: string;
  category_slug: string;
  brand_name?: string;
  variants: ProductVariant[];
  images: ProductImage[];
  total_inventory: number;
  created_at: string;
  updated_at: string;
}

export interface ProductVariant {
  id: string;
  sku: string;
  price: number;
  compare_at_price?: number;
  is_active: boolean;
}

export interface ProductImage {
  id: string;
  image_url: string;
  sort_order: number;
  is_primary: boolean;
}

export interface VendorProductsResponse {
  products: VendorProduct[];
  total_count: number;
  page: number;
  per_page: number;
  total_pages: number;
  has_more: boolean;
}

/**
 * Fetch vendor's products with pagination and search
 * Uses server-side RPC for security and performance
 */
export async function fetchVendorProductsList(params: {
  page?: number;
  per_page?: number;
  search?: string;
  is_active?: boolean;
}): Promise<VendorProductsResponse | null> {
  noStore();

  try {
    const supabase = await createClient();

    const { data, error } = await supabase.rpc('get_vendor_products_list', {
      p_page: params.page || 1,
      p_per_page: params.per_page || 20,
      p_search: params.search || null,
      p_is_active: params.is_active === undefined ? null : params.is_active
    });

    if (error) {
      console.error('Error fetching vendor products:', error);
      return null;
    }

    return data as VendorProductsResponse;
  } catch (error) {
    console.error('fetchVendorProductsList error:', error);
    return null;
  }
}

/**
 * Create a new product
 * Includes validation, slug generation, and audit logging
 */
export async function createVendorProduct(productData: any): Promise<{
  success: boolean;
  product_id?: string;
  slug?: string;
  message?: string;
} | null> {
  noStore();

  try {
    const supabase = await createClient();

    const { data, error } = await supabase.rpc('create_vendor_product', {
      p_product_data: productData
    });

    if (error) {
      console.error('Error creating product:', error);
      return {
        success: false,
        message: error.message || 'Failed to create product'
      };
    }

    return data;
  } catch (error: any) {
    console.error('createVendorProduct error:', error);
    return {
      success: false,
      message: error.message || 'Unexpected error creating product'
    };
  }
}

/**
 * Update existing product
 * Only updates provided fields, includes audit logging
 */
export async function updateVendorProduct(
  productId: string,
  productData: any
): Promise<{ success: boolean; message?: string } | null> {
  noStore();

  try {
    const supabase = await createClient();

    const { data, error } = await supabase.rpc('update_vendor_product', {
      p_product_id: productId,
      p_product_data: productData
    });

    if (error) {
      console.error('Error updating product:', error);
      return {
        success: false,
        message: error.message || 'Failed to update product'
      };
    }

    return data;
  } catch (error: any) {
    console.error('updateVendorProduct error:', error);
    return {
      success: false,
      message: error.message || 'Unexpected error updating product'
    };
  }
}

/**
 * Delete product (soft delete)
 * Sets is_active = false, preserves data for order history
 */
export async function deleteVendorProduct(
  productId: string
): Promise<{ success: boolean; message?: string } | null> {
  noStore();

  try {
    const supabase = await createClient();

    const { data, error } = await supabase.rpc('delete_vendor_product', {
      p_product_id: productId
    });

    if (error) {
      console.error('Error deleting product:', error);
      return {
        success: false,
        message: error.message || 'Failed to delete product'
      };
    }

    return data;
  } catch (error: any) {
    console.error('deleteVendorProduct error:', error);
    return {
      success: false,
      message: error.message || 'Unexpected error deleting product'
    };
  }
}

/**
 * Toggle product active status
 * Quick action for enable/disable
 */
export async function toggleProductActive(
  productId: string
): Promise<{ success: boolean; is_active?: boolean; message?: string } | null> {
  noStore();

  try {
    const supabase = await createClient();

    const { data, error } = await supabase.rpc('toggle_product_active', {
      p_product_id: productId
    });

    if (error) {
      console.error('Error toggling product status:', error);
      return {
        success: false,
        message: error.message || 'Failed to toggle product status'
      };
    }

    return data;
  } catch (error: any) {
    console.error('toggleProductActive error:', error);
    return {
      success: false,
      message: error.message || 'Unexpected error toggling product status'
    };
  }
}

/**
 * Upload product image to Supabase Storage
 * Images stored in vendor-specific folders for security
 */
export async function uploadProductImage(
  vendorId: string,
  productId: string,
  file: File
): Promise<{ url: string; path: string } | null> {
  try {
    const supabase = await createClient();

    // Generate unique filename
    const fileExt = file.name.split('.').pop();
    const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
    const filePath = `${vendorId}/${productId}/${fileName}`;

    const { data, error } = await supabase.storage
      .from('product-images')
      .upload(filePath, file, {
        cacheControl: '3600',
        upsert: false
      });

    if (error) {
      console.error('Error uploading image:', error);
      return null;
    }

    // Get public URL
    const { data: { publicUrl } } = supabase.storage
      .from('product-images')
      .getPublicUrl(filePath);

    return {
      url: publicUrl,
      path: filePath
    };
  } catch (error) {
    console.error('uploadProductImage error:', error);
    return null;
  }
}

// ============================================================================
// ADMIN USERS MANAGEMENT
// ============================================================================

export interface AdminUser {
  id: string;
  email: string;
  username: string;
  display_name: string;
  avatar_url?: string;
  is_verified: boolean;
  created_at: string;
  last_sign_in_at?: string;
  email_confirmed_at?: string;
  banned_until?: string;
  roles: Array<{
    role_name: string;
    role_id: string;
    assigned_at: string;
    expires_at?: string;
    is_active: boolean;
  }>;
  status: 'active' | 'inactive' | 'banned' | 'pending';
}

export interface AdminUsersListResponse {
  users: AdminUser[];
  total: number;
  page: number;
  per_page: number;
  total_pages: number;
}

export interface AdminUsersListParams {
  page?: number;
  per_page?: number;
  search?: string;
  role_filter?: string; // 'admin' | 'vendor' | 'customer' | 'support'
  status_filter?: string; // 'active' | 'inactive' | 'banned' | 'pending'
}

/**
 * Fetch admin users list with pagination and filters
 * @param params - Pagination and filter parameters
 * @returns Users list with pagination metadata or null on error
 */
export async function fetchAdminUsersList(
  params: AdminUsersListParams = {}
): Promise<AdminUsersListResponse | null> {
  noStore();

  const supabase = await createClient();

  try {
    const { data, error } = await supabase.rpc('get_admin_users_list', {
      p_page: params.page || 1,
      p_per_page: params.per_page || 20,
      p_search: params.search || null,
      p_role_filter: params.role_filter || null,
      p_status_filter: params.status_filter || null,
    });

    if (error) {
      console.error('fetchAdminUsersList error:', error);
      return null;
    }

    return data as AdminUsersListResponse;
  } catch (error) {
    console.error('fetchAdminUsersList error:', error);
    return null;
  }
}

/**
 * Assign a role to a user
 * @param userId - User ID to assign role to
 * @param roleName - Role name ('admin', 'vendor', 'customer', 'support')
 * @param expiresAt - Optional expiration timestamp
 * @returns Success result with message
 */
export async function assignUserRole(
  userId: string,
  roleName: string,
  expiresAt?: string
): Promise<{ success: boolean; message: string; } | null> {
  noStore();

  const supabase = await createClient();

  try {
    const { data, error } = await supabase.rpc('assign_user_role', {
      p_user_id: userId,
      p_role_name: roleName,
      p_expires_at: expiresAt || null,
    });

    if (error) {
      console.error('assignUserRole error:', error);
      return { success: false, message: error.message };
    }

    return data as { success: boolean; message: string; };
  } catch (error: any) {
    console.error('assignUserRole error:', error);
    return { success: false, message: error.message || 'Failed to assign role' };
  }
}

/**
 * Revoke a role from a user
 * @param userId - User ID to revoke role from
 * @param roleName - Role name to revoke
 * @returns Success result with message
 */
export async function revokeUserRole(
  userId: string,
  roleName: string
): Promise<{ success: boolean; message: string; } | null> {
  noStore();

  const supabase = await createClient();

  try {
    const { data, error } = await supabase.rpc('revoke_user_role', {
      p_user_id: userId,
      p_role_name: roleName,
    });

    if (error) {
      console.error('revokeUserRole error:', error);
      return { success: false, message: error.message };
    }

    return data as { success: boolean; message: string; };
  } catch (error: any) {
    console.error('revokeUserRole error:', error);
    return { success: false, message: error.message || 'Failed to revoke role' };
  }
}

/**
 * Suspend a user account
 * @param userId - User ID to suspend
 * @param durationDays - Number of days to suspend (null = permanent)
 * @param reason - Reason for suspension
 * @returns Success result with message and banned_until timestamp
 */
export async function suspendUser(
  userId: string,
  durationDays?: number,
  reason?: string
): Promise<{ success: boolean; message: string; banned_until?: string; } | null> {
  noStore();

  const supabase = await createClient();

  try {
    const { data, error } = await supabase.rpc('suspend_user', {
      p_user_id: userId,
      p_duration_days: durationDays || null,
      p_reason: reason || null,
    });

    if (error) {
      console.error('suspendUser error:', error);
      return { success: false, message: error.message };
    }

    return data as { success: boolean; message: string; banned_until?: string; };
  } catch (error: any) {
    console.error('suspendUser error:', error);
    return { success: false, message: error.message || 'Failed to suspend user' };
  }
}

/**
 * Activate a user account (remove suspension)
 * @param userId - User ID to activate
 * @returns Success result with message
 */
export async function activateUser(
  userId: string
): Promise<{ success: boolean; message: string; } | null> {
  noStore();

  const supabase = await createClient();

  try {
    const { data, error } = await supabase.rpc('activate_user', {
      p_user_id: userId,
    });

    if (error) {
      console.error('activateUser error:', error);
      return { success: false, message: error.message };
    }

    return data as { success: boolean; message: string; };
  } catch (error: any) {
    console.error('activateUser error:', error);
    return { success: false, message: error.message || 'Failed to activate user' };
  }
}

// ============================================================================
// ADMIN VENDORS MANAGEMENT
// ============================================================================

export interface AdminVendor {
  user_id: string;
  business_name: string;
  business_type?: string;
  tax_id?: string;
  verification_status: 'pending' | 'verified' | 'rejected';
  commission_rate: number;
  created_at: string;
  updated_at: string;
  display_name: string;
  username: string;
  avatar_url?: string;
  is_verified: boolean;
  email: string;
  last_sign_in_at?: string;
  banned_until?: string;
  total_products: number;
  active_products: number;
  total_revenue_cents: number;
  total_orders: number;
  pending_orders: number;
}

export interface AdminVendorsListResponse {
  vendors: AdminVendor[];
  total: number;
  page: number;
  per_page: number;
  total_pages: number;
}

export interface AdminVendorsListParams {
  page?: number;
  per_page?: number;
  search?: string;
  status_filter?: string; // 'pending' | 'verified' | 'rejected'
  business_type_filter?: string;
}

/**
 * Fetch admin vendors list with pagination and filters
 * @param params - Pagination and filter parameters
 * @returns Vendors list with pagination metadata or null on error
 */
export async function fetchAdminVendorsList(
  params: AdminVendorsListParams = {}
): Promise<AdminVendorsListResponse | null> {
  noStore();

  const supabase = await createClient();

  try {
    const { data, error } = await supabase.rpc('get_admin_vendors_list', {
      p_page: params.page || 1,
      p_per_page: params.per_page || 20,
      p_search: params.search || null,
      p_status_filter: params.status_filter || null,
      p_business_type_filter: params.business_type_filter || null,
    });

    if (error) {
      console.error('fetchAdminVendorsList error:', error);
      return null;
    }

    return data as AdminVendorsListResponse;
  } catch (error) {
    console.error('fetchAdminVendorsList error:', error);
    return null;
  }
}

/**
 * Approve a vendor application
 * @param vendorId - Vendor user ID to approve
 * @param notes - Optional admin notes
 * @returns Success result with message
 */
export async function approveVendor(
  vendorId: string,
  notes?: string
): Promise<{ success: boolean; message: string; } | null> {
  noStore();

  const supabase = await createClient();

  try {
    const { data, error } = await supabase.rpc('approve_vendor', {
      p_vendor_id: vendorId,
      p_notes: notes || null,
    });

    if (error) {
      console.error('approveVendor error:', error);
      return { success: false, message: error.message };
    }

    return data as { success: boolean; message: string; };
  } catch (error: any) {
    console.error('approveVendor error:', error);
    return { success: false, message: error.message || 'Failed to approve vendor' };
  }
}

/**
 * Reject a vendor application
 * @param vendorId - Vendor user ID to reject
 * @param reason - Reason for rejection
 * @returns Success result with message
 */
export async function rejectVendor(
  vendorId: string,
  reason?: string
): Promise<{ success: boolean; message: string; } | null> {
  noStore();

  const supabase = await createClient();

  try {
    const { data, error } = await supabase.rpc('reject_vendor', {
      p_vendor_id: vendorId,
      p_reason: reason || null,
    });

    if (error) {
      console.error('rejectVendor error:', error);
      return { success: false, message: error.message };
    }

    return data as { success: boolean; message: string; };
  } catch (error: any) {
    console.error('rejectVendor error:', error);
    return { success: false, message: error.message || 'Failed to reject vendor' };
  }
}

/**
 * Update vendor commission rate
 * @param vendorId - Vendor user ID
 * @param commissionRate - New commission rate (0-1 = 0-100%)
 * @returns Success result with old and new rates
 */
export async function updateVendorCommission(
  vendorId: string,
  commissionRate: number
): Promise<{ success: boolean; message: string; old_rate?: number; new_rate?: number; } | null> {
  noStore();

  const supabase = await createClient();

  try {
    const { data, error } = await supabase.rpc('update_vendor_commission', {
      p_vendor_id: vendorId,
      p_commission_rate: commissionRate,
    });

    if (error) {
      console.error('updateVendorCommission error:', error);
      return { success: false, message: error.message };
    }

    return data as { success: boolean; message: string; old_rate?: number; new_rate?: number; };
  } catch (error: any) {
    console.error('updateVendorCommission error:', error);
    return { success: false, message: error.message || 'Failed to update commission' };
  }
}

/**
 * Suspend a vendor account
 * @param vendorId - Vendor user ID to suspend
 * @param reason - Reason for suspension
 * @returns Success result with products_deactivated count
 */
export async function suspendVendor(
  vendorId: string,
  reason?: string
): Promise<{ success: boolean; message: string; products_deactivated?: number; } | null> {
  noStore();

  const supabase = await createClient();

  try {
    const { data, error } = await supabase.rpc('suspend_vendor', {
      p_vendor_id: vendorId,
      p_reason: reason || null,
    });

    if (error) {
      console.error('suspendVendor error:', error);
      return { success: false, message: error.message };
    }

    return data as { success: boolean; message: string; products_deactivated?: number; };
  } catch (error: any) {
    console.error('suspendVendor error:', error);
    return { success: false, message: error.message || 'Failed to suspend vendor' };
  }
}

/**
 * Activate a vendor account (remove suspension)
 * @param vendorId - Vendor user ID to activate
 * @returns Success result with message
 */
export async function activateVendor(
  vendorId: string
): Promise<{ success: boolean; message: string; } | null> {
  noStore();

  const supabase = await createClient();

  try {
    const { data, error } = await supabase.rpc('activate_vendor', {
      p_vendor_id: vendorId,
    });

    if (error) {
      console.error('activateVendor error:', error);
      return { success: false, message: error.message };
    }

    return data as { success: boolean; message: string; };
  } catch (error: any) {
    console.error('activateVendor error:', error);
    return { success: false, message: error.message || 'Failed to activate vendor' };
  }
}

// ============================================================================
// CURATION ENGINE API CLIENT
// Blueprint v2.1 - Week 3 Frontend Integration
// ============================================================================

/**
 * Trending product data from curation engine
 */
export interface TrendingProduct {
  product_id: string;
  name: string;
  slug: string;
  trend_score: number;
  source: 'trending' | 'new' | 'rated' | 'active';
  min_price: number;
  image_url?: string;
  average_rating: number;
  is_featured: boolean;
}

/**
 * Featured brand data from curation engine
 */
export interface FeaturedBrand {
  brand_id: string;
  brand_name: string;
  brand_slug: string;
  logo_url?: string;
  product_count: number;
}

/**
 * Product recommendation data from curation engine
 */
export interface ProductRecommendation {
  recommendation_id: string;
  product_id: string;
  product_name: string;
  product_slug: string;
  min_price: number;
  image_url?: string;
  display_order: number;
  in_stock: boolean;
}

/**
 * Featured stylist data from curation engine
 */
export interface FeaturedStylist {
  stylist_id: string;
  display_name: string;
  title: string | null;
  bio: string | null;
  years_experience: number | null;
  specialties: string[] | null;
  rating_average: number | null;
  total_bookings: number;
  avatar_url: string | null;
  featured_at: string | null;
}

/**
 * Fetch trending products from curation Edge Function
 * 
 * Server Component safe - uses Next.js fetch with ISR caching
 * Graceful degradation - returns empty array on error
 * 
 * @param limit - Number of products to fetch (default: 20)
 * @returns Array of trending products
 */
export async function fetchTrendingProducts(limit: number = 20): Promise<TrendingProduct[]> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !anonKey) {
    console.error('[Curation API] Missing Supabase environment variables');
    return [];
  }

  try {
    const response = await fetch(
      `${supabaseUrl}/functions/v1/get-curated-content?action=fetch_trending_products&limit=${limit}`,
      {
        headers: {
          'Authorization': `Bearer ${anonKey}`,
          'Content-Type': 'application/json',
        },
        next: { revalidate: 300 }, // Cache for 5 minutes (matches Edge Function TTL)
      }
    );

    if (!response.ok) {
      console.error('[Curation API] Failed to fetch trending products:', response.status);
      return [];
    }

    const data = await response.json();
    return data.success ? data.data : [];
  } catch (error) {
    console.error('[Curation API] Error fetching trending products:', error);
    return []; // Graceful degradation: return empty array
  }
}

/**
 * Fetch featured brands from curation Edge Function
 * 
 * Server Component safe - uses Next.js fetch with ISR caching
 * Graceful degradation - returns empty array on error
 * 
 * @param limit - Number of brands to fetch (default: 6)
 * @returns Array of featured brands with active product counts
 */
export async function fetchFeaturedBrands(limit: number = 6): Promise<FeaturedBrand[]> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !anonKey) {
    console.error('[Curation API] Missing Supabase environment variables');
    return [];
  }

  try {
    const response = await fetch(
      `${supabaseUrl}/functions/v1/get-curated-content?action=fetch_featured_brands&limit=${limit}`,
      {
        headers: {
          'Authorization': `Bearer ${anonKey}`,
          'Content-Type': 'application/json',
        },
        next: { revalidate: 300 }, // Cache for 5 minutes
      }
    );

    if (!response.ok) {
      console.error('[Curation API] Failed to fetch featured brands:', response.status);
      return [];
    }

    const data = await response.json();
    return data.success ? data.data : [];
  } catch (error) {
    console.error('[Curation API] Error fetching featured brands:', error);
    return [];
  }
}

/**
 * Fetch product recommendations from curation Edge Function
 * 
 * Server Component safe - uses Next.js fetch with ISR caching
 * Self-healing - Edge Function auto-filters inactive/out-of-stock products
 * Graceful degradation - returns empty array on error
 * 
 * @param productId - Source product UUID
 * @param limit - Number of recommendations to fetch (default: 4)
 * @returns Array of product recommendations
 */
export async function fetchProductRecommendations(
  productId: string,
  limit: number = 4
): Promise<ProductRecommendation[]> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !anonKey) {
    console.error('[Curation API] Missing Supabase environment variables');
    return [];
  }

  // Validate productId is a valid UUID
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(productId)) {
    console.error('[Curation API] Invalid product ID format:', productId);
    return [];
  }

  try {
    const response = await fetch(
      `${supabaseUrl}/functions/v1/get-curated-content?action=fetch_recommendations&product_id=${productId}&limit=${limit}`,
      {
        headers: {
          'Authorization': `Bearer ${anonKey}`,
          'Content-Type': 'application/json',
        },
        next: { revalidate: 300 }, // Cache for 5 minutes
      }
    );

    if (!response.ok) {
      console.error('[Curation API] Failed to fetch recommendations:', response.status);
      return [];
    }

    const data = await response.json();
    return data.success ? data.data : [];
  } catch (error) {
    console.error('[Curation API] Error fetching recommendations:', error);
    return [];
  }
}

/**
 * Fetch Top Stylists (by bookings/rating) - used in About page
 */
export async function fetchTopStylists(limit: number = 10): Promise<FeaturedStylist[]> {
  noStore();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('get_top_stylists', { p_limit: limit });
  if (error) {
    console.error('[Top Stylists] Error:', error);
    return [];
  }
  return data || [];
}

/**
 * Fetch Featured Stylists from Curation Engine
 * Uses get-curated-content Edge Function with Redis caching (5 min TTL)
 * 
 * @param limit - Number of stylists to fetch (default: 6)
 * @returns Array of featured stylists with user profile data
 */
export async function fetchFeaturedStylists(limit: number = 6): Promise<FeaturedStylist[]> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !anonKey) {
    console.error('[Curation API] Missing Supabase environment variables');
    return [];
  }

  try {
    const response = await fetch(
      `${supabaseUrl}/functions/v1/get-curated-content?action=fetch_featured_stylists&limit=${limit}`,
      {
        headers: {
          'Authorization': `Bearer ${anonKey}`,
          'Content-Type': 'application/json',
        },
        next: { revalidate: 300 }, // Cache for 5 minutes
      }
    );

    if (!response.ok) {
      console.error('[Curation API] Failed to fetch featured stylists:', response.status);
      return [];
    }

    const data = await response.json();
    return data.success ? data.data : [];
  } catch (error) {
    console.error('[Curation API] Error fetching featured stylists:', error);
    return [];
  }
}

// ============================================================================
// SUPPORT SYSTEM API FUNCTIONS
// ============================================================================

export interface SupportCategory {
  id: string;
  name: string;
  description?: string;
  color: string;
  sort_order: number;
  is_active: boolean;
}

export interface SupportTicket {
  id: string;
  subject: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  status: 'open' | 'in_progress' | 'waiting_customer' | 'resolved' | 'closed';
  category?: string;
  category_color?: string;
  customer_name?: string;
  customer_email?: string;
  assigned_to?: string;
  order_reference?: string;
  created_at: string;
  updated_at: string;
  resolved_at?: string;
  closed_at?: string;
  message_count?: number;
  last_message_at?: string;
}

export interface SupportMessage {
  id: string;
  message_text: string;
  is_system: boolean;
  created_at: string;
  user_name?: string;
  user_avatar?: string;
}

export interface CreateTicketRequest {
  category_id?: string;
  subject: string;
  message: string;
  priority?: 'low' | 'medium' | 'high' | 'urgent';
  order_reference?: string;
}

export interface TicketListResponse {
  tickets: SupportTicket[];
  total: number;
  limit: number;
  offset: number;
}

export interface TicketDetailsResponse {
  ticket: SupportTicket;
  messages: SupportMessage[];
}

/**
 * Create a new support ticket
 */
export async function createSupportTicket(
  ticketData: CreateTicketRequest,
  accessToken?: string
): Promise<{ success: boolean; ticket_id?: string; error?: string }> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !anonKey) {
    console.error('[Support API] Missing Supabase environment variables');
    return { success: false, error: 'Configuration error' };
  }

  try {
    const response = await fetch(
      `${supabaseUrl}/functions/v1/support-ticket-manager/create`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken || anonKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(ticketData),
      }
    );

    const data = await response.json();

    if (!response.ok) {
      console.error('[Support API] Create ticket failed:', data);
      return { success: false, error: data.error || 'Failed to create ticket' };
    }

    return {
      success: true,
      ticket_id: data.data?.ticket_id
    };

  } catch (error) {
    console.error('[Support API] Create ticket error:', error);
    return { success: false, error: 'Network error' };
  }
}

/**
 * Get user's support tickets
 */
export async function getUserSupportTickets(
  limit: number = 20,
  offset: number = 0,
  accessToken?: string
): Promise<TicketListResponse | null> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !anonKey) {
    console.error('[Support API] Missing Supabase environment variables');
    return null;
  }

  try {
    const params = new URLSearchParams({
      limit: limit.toString(),
      offset: offset.toString()
    });

    const response = await fetch(
      `${supabaseUrl}/functions/v1/support-ticket-manager/tickets?${params}`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken || anonKey}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!response.ok) {
      console.error('[Support API] Get tickets failed:', response.status);
      return null;
    }

    const data = await response.json();
    return data.success ? data.data : null;

  } catch (error) {
    console.error('[Support API] Get tickets error:', error);
    return null;
  }
}

/**
 * Get support ticket details with messages
 */
export async function getSupportTicketDetails(
  ticketId: string,
  accessToken?: string
): Promise<TicketDetailsResponse | null> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !anonKey) {
    console.error('[Support API] Missing Supabase environment variables');
    return null;
  }

  try {
    const response = await fetch(
      `${supabaseUrl}/functions/v1/support-ticket-manager/ticket/${ticketId}`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken || anonKey}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!response.ok) {
      console.error('[Support API] Get ticket details failed:', response.status);
      return null;
    }

    const data = await response.json();
    return data.success ? data.data : null;

  } catch (error) {
    console.error('[Support API] Get ticket details error:', error);
    return null;
  }
}

/**
 * Add message to support ticket
 */
export async function addSupportMessage(
  ticketId: string,
  message: string,
  accessToken?: string
): Promise<{ success: boolean; error?: string }> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !anonKey) {
    console.error('[Support API] Missing Supabase environment variables');
    return { success: false, error: 'Configuration error' };
  }

  try {
    const response = await fetch(
      `${supabaseUrl}/functions/v1/support-ticket-manager/message`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken || anonKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ticket_id: ticketId,
          message: message
        }),
      }
    );

    const data = await response.json();

    if (!response.ok) {
      console.error('[Support API] Add message failed:', data);
      return { success: false, error: data.error || 'Failed to add message' };
    }

    return { success: true };

  } catch (error) {
    console.error('[Support API] Add message error:', error);
    return { success: false, error: 'Network error' };
  }
}

/**
 * Get support categories
 */
export async function getSupportCategories(): Promise<SupportCategory[]> {
  noStore();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('support_categories')
    .select('*')
    .eq('is_active', true)
    .order('sort_order', { ascending: true });

  if (error) {
    console.error('[Support API] Get categories error:', error);
    return [];
  }

  return data || [];
}


// ============================================================================
// CATEGORY-BASED PRODUCT FETCHING
// ============================================================================

export interface CategoryProduct {
  id: string;
  name: string;
  slug: string;
  price: number;
  compare_at_price?: number;
  image_url: string;
  category_name: string;
  category_slug: string;
  in_stock: boolean;
  is_featured: boolean;
}

export interface CategoryInfo {
  id: string;
  name: string;
  slug: string;
  description?: string;
  image_url?: string;
  product_count: number;
}

/**
 * Fetch products by category slug
 * Server Component safe - uses direct Supabase query
 * 
 * @param categorySlug - Category slug to filter by
 * @param limit - Number of products to fetch (default: 8)
 * @returns Array of products in the category
 */
export async function fetchProductsByCategory(
  categorySlug: string,
  limit: number = 8
): Promise<CategoryProduct[]> {
  noStore();
  
  try {
    const supabase = await createClient();
    
    // First get the category ID from slug
    const { data: category, error: categoryError } = await supabase
      .from('categories')
      .select('id, name, slug')
      .eq('slug', categorySlug)
      .eq('is_active', true)
      .single();
    
    if (categoryError || !category) {
      console.error(`[Category API] Category not found: ${categorySlug}`, categoryError);
      return [];
    }
    
    // Fetch products in this category with their variants and images
    const { data: products, error: productsError } = await supabase
      .from('products')
      .select(`
        id,
        name,
        slug,
        is_featured,
        product_variants (
          id,
          price,
          compare_at_price,
          inventory (
            quantity_available
          )
        ),
        product_images (
          image_url,
          sort_order
        )
      `)
      .eq('category_id', category.id)
      .eq('is_active', true)
      .order('is_featured', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(limit);
    
    if (productsError) {
      console.error(`[Category API] Error fetching products for ${categorySlug}:`, productsError);
      return [];
    }
    
    if (!products || products.length === 0) {
      return [];
    }
    
    // Transform to CategoryProduct format
    return products.map((product: any) => {
      // Get min price from variants
      const prices = product.product_variants?.map((v: any) => v.price).filter((p: number) => p > 0) || [];
      const minPrice = prices.length > 0 ? Math.min(...prices) : 0;
      
      // Get compare_at_price if exists
      const compareAtPrices = product.product_variants
        ?.map((v: any) => v.compare_at_price)
        .filter((p: number | null) => p && p > 0) || [];
      const compareAtPrice = compareAtPrices.length > 0 ? Math.min(...compareAtPrices) : undefined;
      
      // Calculate total inventory
      const totalInventory = product.product_variants?.reduce((total: number, variant: any) => {
        const qty = variant.inventory?.reduce((sum: number, inv: any) => sum + (inv.quantity_available || 0), 0) || 0;
        return total + qty;
      }, 0) || 0;
      
      // Get primary image
      const sortedImages = product.product_images?.sort((a: any, b: any) => 
        (a.sort_order || 0) - (b.sort_order || 0)
      ) || [];
      const primaryImage = sortedImages[0]?.image_url || '/placeholder-product.jpg';
      
      return {
        id: product.id,
        name: product.name,
        slug: product.slug,
        price: minPrice,
        compare_at_price: compareAtPrice,
        image_url: primaryImage,
        category_name: category.name,
        category_slug: category.slug,
        in_stock: totalInventory > 0,
        is_featured: product.is_featured || false,
      };
    });
  } catch (error) {
    console.error(`[Category API] Error in fetchProductsByCategory:`, error);
    return [];
  }
}

/**
 * Fetch top-level categories with product counts
 * Used for category navigation and homepage sections
 * 
 * @param limit - Number of categories to fetch (default: 12)
 * @returns Array of categories with product counts
 */
export async function fetchTopCategories(limit: number = 12): Promise<CategoryInfo[]> {
  noStore();
  
  try {
    const supabase = await createClient();
    
    // Get top-level categories (parent_id is null)
    const { data: categories, error } = await supabase
      .from('categories')
      .select(`
        id,
        name,
        slug,
        description,
        image_url
      `)
      .is('parent_id', null)
      .eq('is_active', true)
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true })
      .limit(limit);
    
    if (error) {
      console.error('[Category API] Error fetching top categories:', error);
      return [];
    }
    
    if (!categories || categories.length === 0) {
      return [];
    }
    
    // Get product counts for each category
    const categoriesWithCounts = await Promise.all(
      categories.map(async (cat) => {
        const { count } = await supabase
          .from('products')
          .select('*', { count: 'exact', head: true })
          .eq('category_id', cat.id)
          .eq('is_active', true);
        
        return {
          ...cat,
          product_count: count || 0,
        };
      })
    );
    
    // Filter out categories with no products and sort by product count
    return categoriesWithCounts
      .filter(cat => cat.product_count > 0)
      .sort((a, b) => b.product_count - a.product_count);
  } catch (error) {
    console.error('[Category API] Error in fetchTopCategories:', error);
    return [];
  }
}

/**
 * Fetch all active categories (flat list)
 * Used for filter dropdowns and category selection
 */
export async function fetchAllCategories(): Promise<CategoryInfo[]> {
  noStore();
  
  try {
    const supabase = await createClient();
    
    const { data, error } = await supabase
      .from('categories')
      .select('id, name, slug, description, image_url')
      .eq('is_active', true)
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true });
    
    if (error) {
      console.error('[Category API] Error fetching all categories:', error);
      return [];
    }
    
    return (data || []).map(cat => ({
      ...cat,
      product_count: 0, // Not fetching counts for performance
    }));
  } catch (error) {
    console.error('[Category API] Error in fetchAllCategories:', error);
    return [];
  }
}
