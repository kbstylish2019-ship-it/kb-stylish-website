import dynamic from "next/dynamic";
import { fetchTrendingProducts, fetchFeaturedBrands } from "@/lib/apiClient";
import TrendingProducts from "@/components/homepage/TrendingProducts";
import FeaturedBrands from "@/components/homepage/FeaturedBrands";

// Critical above-the-fold component - keep static
import HeroSection from "@/components/homepage/HeroSection";

// Lazy load below-the-fold components
const CategoryGrid = dynamic(() => import("@/components/homepage/CategoryGrid"), {
  loading: () => <div className="h-48 animate-pulse bg-white/5 rounded-xl mx-auto max-w-7xl px-4" />,
});

const BrandStrip = dynamic(() => import("@/components/homepage/BrandStrip"), {
  loading: () => <div className="h-20 animate-pulse bg-white/5 rounded-xl mx-auto max-w-7xl px-4" />,
});

const ValueProps = dynamic(() => import("@/components/homepage/ValueProps"), {
  loading: () => <div className="h-32 animate-pulse bg-white/5 rounded-xl mx-auto max-w-7xl px-4" />,
});

const FeaturedStylists = dynamic(() => import("@/components/homepage/FeaturedStylists"), {
  loading: () => <div className="h-64 animate-pulse bg-white/5 rounded-xl mx-auto max-w-7xl px-4 my-10" />,
});

export default async function Home() {
  // Fetch curated data server-side (parallel requests for performance)
  const [trendingProducts, featuredBrands] = await Promise.all([
    fetchTrendingProducts(20),
    fetchFeaturedBrands(6),
  ]);
  
  return (
    <main>
      <HeroSection />
      <BrandStrip />
      <CategoryGrid />
      <FeaturedBrands brands={featuredBrands} />
      <FeaturedStylists />
      <TrendingProducts products={trendingProducts} />
      <ValueProps />
    </main>
  );
}
