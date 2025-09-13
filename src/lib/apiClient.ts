import type { Product } from "@/lib/types";

// API client for server-side data fetching
// Simulates Supabase REST API calls with proper filtering, sorting, and pagination

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
 * Simulates server-side product fetching with filtering, sorting, and pagination
 * In production, this would make actual HTTP requests to Supabase REST API
 * 
 * @param params - Filter, sort, and pagination parameters
 * @returns Promise resolving to paginated product results
 */
export async function fetchProducts(params: FetchProductsParams = {}): Promise<ProductsResponse> {
  // Simulate network delay
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
