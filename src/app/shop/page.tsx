import { Suspense } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { fetchProducts, getProductCategories } from "@/lib/apiClient";
import type { ProductFilters, ProductSort } from "@/lib/apiClient";
import ProductGrid from "@/components/shared/ProductGrid";

// Use virtualized grid for better performance with large product lists
import ErrorBoundary from "@/components/ui/ErrorBoundary";

const VirtualizedProductGrid = dynamic(
  () => import("@/components/shared/VirtualizedProductGrid"),
  { 
    loading: () => <div className="h-96 animate-pulse bg-white/5 rounded-xl" />,
  }
);

// Dynamically import the filter sidebar to reduce initial bundle size
const FilterSidebar = dynamic(() => import("@/components/shop/FilterSidebar"), {
  loading: () => <div className="h-96 animate-pulse bg-white/5 rounded-xl" />,
});

interface ShopPageProps {
  searchParams: Promise<{
    search?: string;
    categories?: string;
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

  if (searchParams.categories) {
    filters.categories = searchParams.categories.split(",").filter(Boolean);
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
  const limit = params.limit ? parseInt(params.limit) : 12;

  // Fetch products server-side with filters applied
  let products: any[] = [];
  let totalCount = 0;
  let hasMore = false;
  let nextCursor: string | undefined;
  let categories: any[] = [];
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
    // Use empty arrays as fallback
    products = [];
    categories = [];
  }

  return (
    <main className="mx-auto max-w-7xl px-4 py-10">
      <div className="grid gap-8 lg:grid-cols-[280px_1fr]">
        <ErrorBoundary
          fallback={
            <div className="h-96 rounded-xl border border-white/10 bg-white/5 p-6 ring-1 ring-white/10">
              <p className="text-sm font-medium">Filters are temporarily unavailable.</p>
              <p className="mt-1 text-xs text-foreground/70">You can still browse products on the right.</p>
            </div>
          }
        >
          <Suspense fallback={<div className="h-96 animate-pulse bg-white/5 rounded-xl" />}>
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
        <section>
          <div className="flex items-baseline justify-between">
            <h1 className="text-2xl font-semibold">Shop</h1>
            <p className="text-xs text-foreground/80">
              {fetchError ? 'Error loading products' : `${products.length} of ${totalCount} products`}
            </p>
          </div>
          <div className="mt-6">
            {fetchError ? (
              <div className="rounded-2xl border border-red-500/20 bg-red-500/5 p-8 text-center ring-1 ring-red-500/20">
                <h3 className="text-base font-semibold text-red-400">Connection Error</h3>
                <p className="mt-1 text-sm text-red-300/70">{fetchError}</p>
                <button 
                  onClick={() => window.location.reload()} 
                  className="mt-4 inline-flex items-center px-4 py-2 rounded-lg bg-red-500/20 text-red-300 text-sm font-medium hover:bg-red-500/30 transition-colors"
                >
                  Retry
                </button>
              </div>
            ) : products.length === 0 ? (
              <div className="rounded-2xl border border-white/10 bg-white/5 p-8 text-center ring-1 ring-white/10">
                <h3 className="text-base font-semibold">No products found</h3>
                <p className="mt-1 text-sm text-foreground/70">
                  {filters.search || filters.categories?.length ? 
                    'Try adjusting your filters or search terms.' : 
                    'Products will appear here once they are added to the store.'
                  }
                </p>
              </div>
            ) : (
              <ErrorBoundary
                fallback={
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-8 text-center ring-1 ring-white/10">
                    <h3 className="text-base font-semibold">We couldn&apos;t load products</h3>
                    <p className="mt-1 text-sm text-foreground/70">Please refresh the page to try again.</p>
                  </div>
                }
              >
                {products.length <= 30 ? (
                  <ProductGrid products={products} />
                ) : (
                  <VirtualizedProductGrid products={products} />
                )}
              </ErrorBoundary>
            )}
          </div>
          {hasMore && !fetchError && (
            <div className="mt-8 text-center">
              <Link
                href={`/shop?${new URLSearchParams({
                  ...params,
                  cursor: nextCursor || "",
                }).toString()}`}
                className="inline-flex items-center px-6 py-3 rounded-xl bg-[var(--kb-primary-brand)] text-white font-medium hover:bg-[var(--kb-primary-brand)]/90 transition-colors"
              >
                Load More Products
              </Link>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
