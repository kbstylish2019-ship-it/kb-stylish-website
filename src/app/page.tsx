import dynamic from "next/dynamic";

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
const TrendingProducts = dynamic(() => import("@/components/homepage/TrendingProducts"), {
  loading: () => <div className="h-64 animate-pulse bg-white/5 rounded-xl mx-auto max-w-7xl px-4 my-10" />,
});

export default function Home() {
  return (
    <main>
      <HeroSection />
      <BrandStrip />
      <CategoryGrid />
      <FeaturedStylists />
      <TrendingProducts />
      <ValueProps />
    </main>
  );
}
