import { Suspense } from "react";
import { notFound } from "next/navigation";
import { fetchVendorProducts } from "@/lib/apiClient";
import ProductGrid from "@/components/shared/ProductGrid";
import ErrorBoundary from "@/components/ui/ErrorBoundary";
import { ShoppingBag, Star, MapPin, Clock } from "lucide-react";

interface VendorStorefrontProps {
  searchParams: Promise<{
    sort?: string;
    cursor?: string;
    limit?: string;
  }>;
  params: Promise<{ vendorId: string }>;
}

// Map URL sort parameters to API sort format
function mapSortParam(sortParam?: string) {
  switch (sortParam) {
    case "newest":
      return { field: "created_at" as const, order: "desc" as const };
    case "name_asc":
      return { field: "name" as const, order: "asc" as const };
    case "name_desc":
      return { field: "name" as const, order: "desc" as const };
    case "price_low":
      return { field: "price" as const, order: "asc" as const };
    case "price_high":
      return { field: "price" as const, order: "desc" as const };
    default:
      return { field: "name" as const, order: "asc" as const };
  }
}

export default async function VendorStorefrontPage({ 
  searchParams, 
  params 
}: VendorStorefrontProps) {
  const resolvedParams = await params;
  const resolvedSearchParams = await searchParams;
  
  const { vendorId } = resolvedParams;
  const sort = mapSortParam(resolvedSearchParams.sort);
  const cursor = resolvedSearchParams.cursor;
  const limit = resolvedSearchParams.limit ? parseInt(resolvedSearchParams.limit) : 12;

  // Fetch vendor products
  let products: any[] = [];
  let totalCount = 0;
  let hasMore = false;
  let nextCursor: string | undefined;
  let vendorInfo: any = null;
  let fetchError: string | null = null;

  try {
    const vendorResult = await fetchVendorProducts(vendorId, {
      pagination: { cursor, limit },
      sort,
    });
    
    products = vendorResult.data;
    totalCount = vendorResult.totalCount;
    hasMore = vendorResult.hasMore;
    nextCursor = vendorResult.nextCursor;
    
    // Extract vendor info from first product (all products belong to same vendor)
    if (products.length > 0) {
      const firstProduct = products[0];
      // Access vendor info from the product's vendor data
      vendorInfo = {
        id: vendorId,
        displayName: (firstProduct as any).vendor?.display_name || 'Unknown Vendor',
        isVerified: (firstProduct as any).vendor?.is_verified || false,
      };
    }
    
  } catch (error) {
    console.error('Error loading vendor products:', error);
    fetchError = 'Failed to load vendor products. Please try again later.';
  }

  // If no products found and no error, vendor might not exist
  if (!fetchError && products.length === 0 && !vendorInfo) {
    notFound();
  }

  return (
    <main className="mx-auto max-w-7xl px-4 py-10">
      {/* Vendor Header */}
      <div className="mb-10">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-8 ring-1 ring-white/10">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-3">
                <h1 className="text-3xl font-bold text-foreground">
                  {vendorInfo?.displayName || 'Vendor Storefront'}
                </h1>
                {vendorInfo?.isVerified && (
                  <div className="flex items-center gap-1 rounded-full bg-blue-500/20 px-2 py-1 text-xs text-blue-400">
                    <Star className="h-3 w-3 fill-current" />
                    Verified
                  </div>
                )}
              </div>
              
              <div className="mt-4 flex flex-wrap gap-6 text-sm text-foreground/70">
                <div className="flex items-center gap-2">
                  <ShoppingBag className="h-4 w-4" />
                  <span>{totalCount} Products</span>
                </div>
                <div className="flex items-center gap-2">
                  <MapPin className="h-4 w-4" />
                  <span>Nepal</span>
                </div>
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4" />
                  <span>Usually ships within 2-3 days</span>
                </div>
              </div>
            </div>
            
            <div className="text-right">
              <div className="flex items-center gap-1 text-amber-400">
                <Star className="h-4 w-4 fill-current" />
                <span className="font-semibold">4.8</span>
              </div>
              <div className="text-xs text-foreground/60 mt-1">
                Store Rating
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Products Section */}
      <section>
        <div className="flex items-baseline justify-between mb-6">
          <h2 className="text-xl font-semibold">Products</h2>
          <p className="text-xs text-foreground/80">
            {fetchError ? 'Error loading products' : `${products.length} of ${totalCount} products`}
          </p>
        </div>

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
              This vendor hasn't added any products yet.
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
            <Suspense fallback={<div className="h-96 animate-pulse bg-white/5 rounded-xl" />}>
              <ProductGrid products={products} />
            </Suspense>
          </ErrorBoundary>
        )}

        {/* Load More Section */}
        {hasMore && !fetchError && (
          <div className="mt-8 text-center">
            <a
              href={`/vendor/${vendorId}?${new URLSearchParams({
                ...resolvedSearchParams,
                cursor: nextCursor || "",
              }).toString()}`}
              className="inline-flex items-center px-6 py-3 rounded-xl bg-[var(--kb-primary-brand)] text-white font-medium hover:bg-[var(--kb-primary-brand)]/90 transition-colors"
            >
              Load More Products
            </a>
          </div>
        )}
      </section>
    </main>
  );
}

// Generate metadata for SEO
export async function generateMetadata({ params }: { params: Promise<{ vendorId: string }> }) {
  const { vendorId } = await params;
  
  try {
    const vendorResult = await fetchVendorProducts(vendorId, { pagination: { limit: 1 } });
    const vendorName = (vendorResult.data[0] as any)?.vendor?.display_name || 'Vendor';
    
    return {
      title: `${vendorName} - KB Stylish`,
      description: `Shop products from ${vendorName} on KB Stylish - Nepal's premier fashion marketplace.`,
    };
  } catch {
    return {
      title: 'Vendor Storefront - KB Stylish',
      description: 'Discover amazing products from our verified vendors on KB Stylish.',
    };
  }
}
