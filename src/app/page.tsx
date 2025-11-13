import dynamic from "next/dynamic";
import { fetchProducts, fetchTrendingProducts, fetchFeaturedBrands, getProductCategories } from "@/lib/apiClient";
import TrendingProducts from "@/components/homepage/TrendingProducts";
import FeaturedBrands from "@/components/homepage/FeaturedBrands";
import ProductGrid from "@/components/shared/ProductGrid";

// Critical above-the-fold components - keep static
import CompactHero from "@/components/homepage/CompactHero";
import QuickCategories from "@/components/homepage/QuickCategories";

// Lazy load below-the-fold components
const FeaturedStylists = dynamic(() => import("@/components/homepage/FeaturedStylists"), {
  loading: () => <div className="h-64 animate-pulse bg-white/5 rounded-xl mx-auto max-w-7xl px-4 my-10" />,
});

const ValueProps = dynamic(() => import("@/components/homepage/ValueProps"), {
  loading: () => <div className="h-32 animate-pulse bg-white/5 rounded-xl mx-auto max-w-7xl px-4" />,
});

export default async function Home() {
  // Fetch data server-side (parallel requests for performance)
  const [allProducts, trendingProducts, featuredBrands, categories] = await Promise.all([
    fetchProducts({ 
      filters: {}, 
      sort: { field: "created_at", order: "desc" },
      pagination: { limit: 12 }
    }),
    fetchTrendingProducts(8), // Reduced for secondary placement
    fetchFeaturedBrands(4),   // Reduced for secondary placement
    getProductCategories(),   // Real categories from backend
  ]);
  
  return (
    <main>
      <CompactHero />
      <QuickCategories categories={categories} />
      
      {/* HERO PRODUCTS SECTION - Main showcase */}
      <section className="mx-auto max-w-7xl px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">Latest Products</h2>
            <p className="text-sm text-foreground/70 mt-1">Discover our newest arrivals</p>
          </div>
          <a 
            href="/shop" 
            className="inline-flex items-center px-4 py-2 rounded-lg bg-[var(--kb-primary-brand)] text-white text-sm font-medium hover:bg-[var(--kb-primary-brand)]/90 transition-colors"
          >
            Shop All Products →
          </a>
        </div>
        <ProductGrid products={allProducts.data} />
      </section>

      {/* Supporting sections */}
      <FeaturedStylists />
      <FeaturedBrands brands={featuredBrands} />
      
      {/* TRENDING SECTION - Secondary product discovery using consistent ProductCard */}
      <TrendingProducts products={trendingProducts} />
      
      <ValueProps />
    </main>
  );
}
