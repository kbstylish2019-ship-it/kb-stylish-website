import { Suspense } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { fetchProducts, getProductCategories } from "@/lib/apiClient";
import type { ProductFilters, ProductSort, CategoryFilterItem } from "@/lib/apiClient";
import { ChevronRight, SlidersHorizontal, X } from "lucide-react";
import SortDropdown from "@/components/shop/SortDropdown";
import RetryButton from "@/components/shop/RetryButton";

// Use virtualized grid for better performance with large product lists
import ErrorBoundary from "@/components/ui/ErrorBoundary";

const MarketplaceProductGrid = dynamic(
  () => import("@/components/shop/MarketplaceProductGrid"),
  {
    loading: () => <div className="h-96 animate-pulse bg-gray-100 rounded-lg" />,
    ssr: true,
  }
);

// Dynamically import the filter sidebar to reduce initial bundle size
const FilterSidebar = dynamic(() => import("@/components/shop/FilterSidebar"), {
  loading: () => <div className="h-96 animate-pulse bg-white rounded-lg" />,
});

interface ShopPageProps {
  searchParams: Promise<{
    search?: string;
    categories?: string;
    category?: string;
    brand?: string;
    minPrice?: string;
    maxPrice?: string;
    sort?: string;
    cursor?: string;
    limit?: string;
  }>;
}

// Map URL sort parameters to API sort format
function mapSortParam(sortParam?: string): ProductSort {
  switch (sortParam) {
    case "newest":
      return { field: "created_at", order: "desc" };
    case "name_asc":
      return { field: "name", order: "asc" };
    case "name_desc":
      return { field: "name", order: "desc" };
    case "price_low":
      return { field: "price", order: "asc" };
    case "price_high":
      return { field: "price", order: "desc" };
    case "best-selling":
      return { field: "created_at", order: "desc" }; // Fallback to newest
    case "trending":
      return { field: "created_at", order: "desc" }; // Fallback to newest
    default:
      return { field: "name", order: "asc" };
  }
}

// Parse URL parameters into API filter format
function parseFilters(searchParams: Record<string, string | undefined>): ProductFilters {
  const filters: ProductFilters = {};

  if (searchParams.search) {
    filters.search = searchParams.search;
  }

  // Support both 'categories' (comma-separated) and 'category' (single)
  if (searchParams.categories) {
    filters.categories = searchParams.categories.split(",").filter(Boolean);
  } else if (searchParams.category) {
    filters.categories = [searchParams.category];
  }

  if (searchParams.minPrice) {
    const minPrice = Number(searchParams.minPrice);
    if (!isNaN(minPrice) && minPrice > 0) {
      filters.minPrice = minPrice;
    }
  }

  if (searchParams.maxPrice) {
    const maxPrice = Number(searchParams.maxPrice);
    if (!isNaN(maxPrice) && maxPrice > 0) {
      filters.maxPrice = maxPrice;
    }
  }

  return filters;
}

export default async function ShopPage({ searchParams }: ShopPageProps) {
  const params = await searchParams;

  // Parse URL parameters
  const filters = parseFilters(params);
  const sort = mapSortParam(params.sort);
  const cursor = params.cursor;
  const limit = params.limit ? parseInt(params.limit) : 24;

  // Fetch products server-side with filters applied
  let products: any[] = [];
  let totalCount = 0;
  let hasMore = false;
  let nextCursor: string | undefined;
  let categories: CategoryFilterItem[] = [];
  let fetchError: string | null = null;

  try {
    const productResult = await fetchProducts({
      filters,
      sort,
      pagination: { cursor, limit },
    });

    products = productResult.data;
    totalCount = productResult.totalCount;
    hasMore = productResult.hasMore;
    nextCursor = productResult.nextCursor;

    // Get available categories for filter sidebar
    categories = await getProductCategories();
  } catch (error) {
    console.error('Error loading shop data:', error);
    fetchError = 'Failed to load products. Please try again later.';
    products = [];
    categories = [];
  }

  // Helper to build URLs for removing a specific filter
  function buildUrl(remover: (u: URLSearchParams) => void) {
    const usp = new URLSearchParams(params as any);
    remover(usp);
    usp.delete('cursor');
    if (!usp.get('search')) usp.delete('search');
    if (!usp.get('categories')) usp.delete('categories');
    if (!usp.get('category')) usp.delete('category');
    if (!usp.get('brand')) usp.delete('brand');
    if (!usp.get('minPrice')) usp.delete('minPrice');
    if (!usp.get('maxPrice')) usp.delete('maxPrice');
    if (!usp.get('sort') || usp.get('sort') === 'popularity') usp.delete('sort');
    const qs = usp.toString();
    return `/shop${qs ? `?${qs}` : ''}`;
  }

  const hasActiveFilters = Boolean(
    (filters.categories && filters.categories.length) ||
    filters.search || params.minPrice || params.maxPrice || params.brand
  );

  // Get page title based on filters
  const getPageTitle = () => {
    if (params.category) {
      return params.category.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
    }
    if (params.brand) {
      return params.brand.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
    }
    if (params.search) {
      return `Search: "${params.search}"`;
    }
    return 'All Products';
  };

  return (
    <main className="min-h-screen bg-[#F5F5F5]">
      {/* Breadcrumb */}
      <div className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-4 py-3">
          <nav className="flex items-center gap-2 text-sm text-gray-500">
            <Link href="/" className="hover:text-[#1976D2]">Home</Link>
            <ChevronRight className="h-4 w-4" />
            <span className="text-gray-800 font-medium">{getPageTitle()}</span>
          </nav>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
          {/* Filter Sidebar */}
          <aside className="hidden lg:block">
            <ErrorBoundary
              fallback={
                <div className="bg-white rounded-lg p-4 shadow-sm">
                  <p className="text-sm text-gray-500">Filters unavailable</p>
                </div>
              }
            >
              <Suspense fallback={<div className="h-96 animate-pulse bg-white rounded-lg" />}>
                <FilterSidebar
                  availableCategories={categories}
                  currentFilters={{
                    search: params.search || "",
                    selectedCategories: filters.categories || [],
                    minPrice: params.minPrice || "",
                    maxPrice: params.maxPrice || "",
                    sort: params.sort || "popularity",
                  }}
                />
              </Suspense>
            </ErrorBoundary>
          </aside>

          {/* Main Content */}
          <section>
            {/* Header with title and sort */}
            <div className="bg-white rounded-lg shadow-sm p-4 mb-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                  <h1 className="text-xl font-bold text-gray-800">{getPageTitle()}</h1>
                  <p className="text-sm text-gray-500 mt-1">
                    {fetchError ? 'Error loading products' : `${totalCount} products found`}
                  </p>
                </div>

                {/* Sort Dropdown - Client Component */}
                <div className="flex items-center gap-3">
                  <label className="text-sm text-gray-600">Sort by:</label>
                  <SortDropdown currentSort={params.sort || "popularity"} />
                </div>
              </div>

              {/* Active Filters */}
              {hasActiveFilters && (
                <div className="mt-4 pt-4 border-t flex flex-wrap items-center gap-2">
                  <span className="text-sm text-gray-500">Active filters:</span>
                  
                  {filters.search && (
                    <Link
                      href={buildUrl(u => u.delete('search'))}
                      className="inline-flex items-center gap-1 px-3 py-1 bg-blue-50 text-[#1976D2] text-sm rounded-full hover:bg-blue-100 transition-colors"
                    >
                      Search: &quot;{filters.search}&quot;
                      <X className="h-3 w-3" />
                    </Link>
                  )}

                  {(filters.categories || []).map(cat => (
                    <Link
                      key={`chip-${cat}`}
                      href={buildUrl(u => {
                        u.delete('category');
                        const list = (u.get('categories') || '')
                          .split(',')
                          .filter(Boolean)
                          .filter(c => c !== cat);
                        if (list.length) u.set('categories', list.join(','));
                        else u.delete('categories');
                      })}
                      className="inline-flex items-center gap-1 px-3 py-1 bg-blue-50 text-[#1976D2] text-sm rounded-full hover:bg-blue-100 transition-colors capitalize"
                    >
                      {cat.replace(/-/g, ' ')}
                      <X className="h-3 w-3" />
                    </Link>
                  ))}

                  {params.brand && (
                    <Link
                      href={buildUrl(u => u.delete('brand'))}
                      className="inline-flex items-center gap-1 px-3 py-1 bg-blue-50 text-[#1976D2] text-sm rounded-full hover:bg-blue-100 transition-colors capitalize"
                    >
                      Brand: {params.brand.replace(/-/g, ' ')}
                      <X className="h-3 w-3" />
                    </Link>
                  )}

                  {params.minPrice && (
                    <Link
                      href={buildUrl(u => u.delete('minPrice'))}
                      className="inline-flex items-center gap-1 px-3 py-1 bg-blue-50 text-[#1976D2] text-sm rounded-full hover:bg-blue-100 transition-colors"
                    >
                      Min: Rs. {params.minPrice}
                      <X className="h-3 w-3" />
                    </Link>
                  )}

                  {params.maxPrice && (
                    <Link
                      href={buildUrl(u => u.delete('maxPrice'))}
                      className="inline-flex items-center gap-1 px-3 py-1 bg-blue-50 text-[#1976D2] text-sm rounded-full hover:bg-blue-100 transition-colors"
                    >
                      Max: Rs. {params.maxPrice}
                      <X className="h-3 w-3" />
                    </Link>
                  )}

                  <Link
                    href="/shop"
                    className="text-sm text-red-500 hover:text-red-600 ml-auto"
                  >
                    Clear all
                  </Link>
                </div>
              )}
            </div>

            {/* Products Grid */}
            <div className="bg-white rounded-lg shadow-sm p-4">
              {fetchError ? (
                <div className="text-center py-12">
                  <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <X className="h-8 w-8 text-red-500" />
                  </div>
                  <h3 className="text-lg font-semibold text-gray-800">Connection Error</h3>
                  <p className="text-sm text-gray-500 mt-1">{fetchError}</p>
                  <RetryButton />
                </div>
              ) : products.length === 0 ? (
                <div className="text-center py-12">
                  <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <SlidersHorizontal className="h-8 w-8 text-gray-400" />
                  </div>
                  <h3 className="text-lg font-semibold text-gray-800">No products found</h3>
                  <p className="text-sm text-gray-500 mt-1">
                    {hasActiveFilters
                      ? 'Try adjusting your filters or search terms.'
                      : 'Products will appear here once they are added.'}
                  </p>
                  {hasActiveFilters && (
                    <Link
                      href="/shop"
                      className="mt-4 inline-block px-6 py-2 bg-[#1976D2] text-white rounded-lg hover:bg-[#1565C0] transition-colors"
                    >
                      Clear Filters
                    </Link>
                  )}
                </div>
              ) : (
                <ErrorBoundary
                  fallback={
                    <div className="text-center py-12">
                      <h3 className="text-lg font-semibold text-gray-800">Couldn&apos;t load products</h3>
                      <p className="text-sm text-gray-500 mt-1">Please refresh the page.</p>
                    </div>
                  }
                >
                  <MarketplaceProductGrid products={products} />
                </ErrorBoundary>
              )}
            </div>

            {/* Load More */}
            {hasMore && !fetchError && (
              <div className="mt-6 text-center">
                <Link
                  href={`/shop?${new URLSearchParams({
                    ...params,
                    cursor: nextCursor || "",
                  }).toString()}`}
                  className="inline-flex items-center px-8 py-3 bg-[#1976D2] text-white font-medium rounded-lg hover:bg-[#1565C0] transition-colors"
                >
                  Load More Products
                </Link>
              </div>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}
