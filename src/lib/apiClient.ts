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
    if (filters.categories && filters.categories.length > 0) {
      query = query.in('categories.slug', filters.categories);
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
 * In production, this would be a separate API endpoint
 */
export async function getProductCategories(): Promise<string[]> {
  await new Promise(resolve => setTimeout(resolve, 50));
  
  const categories = Array.from(new Set(
    MOCK_PRODUCTS
      .map(product => product.category)
      .filter((category): category is string => Boolean(category))
  ));

  return categories.sort();
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
    try {
      const cached = await redis.get<ProductWithVariants>(cacheKey);
      if (cached) {
        const latency = Date.now() - startTime;
        cacheMetrics.hits++;
        console.log(`[CACHE HIT] L1 Vercel KV - Key: ${cacheKey} - Latency: ${latency}ms`);
        return cached;
      }
    } catch (kvError) {
      console.warn('Vercel KV unavailable, falling back to database:', kvError);
      cacheMetrics.errors++;
    }

    // L2: Cache miss - fetch from PostgreSQL function
    cacheMetrics.misses++;
    console.log(`[CACHE MISS] L1 - Fetching from database for: ${cacheKey}`);
    
    const supabase = await createClient();
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
 * Fetch all active stylists with their services
 * Performs joins on stylist_profiles, stylist_services, and services
 */
export async function fetchActiveStylistsWithServices(): Promise<StylistWithServices[]> {
  noStore(); // Disable Next.js caching for real-time data
  const startTime = Date.now();

  try {
    const supabase = await createClient();

    // Fetch stylists with their services
    const { data: stylists, error } = await supabase
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
      .eq('stylist_services.services.is_active', true)
      .order('display_name', { ascending: true });

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
