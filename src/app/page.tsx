import dynamic from "next/dynamic";
import HeroSection from "@/components/homepage/HeroSection";
import CategoryGrid from "@/components/homepage/CategoryGrid";
import BrandStrip from "@/components/homepage/BrandStrip";
import ValueProps from "@/components/homepage/ValueProps";

const FeaturedStylists = dynamic(() => import("@/components/homepage/FeaturedStylists"));
const TrendingProducts = dynamic(() => import("@/components/homepage/TrendingProducts"));

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
