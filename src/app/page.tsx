import { Suspense } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { 
  fetchTrendingProducts, 
  fetchFeaturedBrands, 
  fetchProductsByCategory,
  type CategoryProduct 
} from "@/lib/apiClient";
import { ChevronRight, Truck, Shield, Clock, Headphones, Sparkles, Gift, Percent } from "lucide-react";

// Lazy load components for better performance
const HeroBanner = dynamic(() => import("@/components/homepage/HeroBanner"), {
  loading: () => <div className="h-[400px] bg-gray-200 animate-pulse rounded-lg" />,
});

const CategoryStrip = dynamic(() => import("@/components/homepage/CategoryStrip"), {
  loading: () => <div className="h-24 bg-white animate-pulse rounded-lg" />,
});

const ProductSection = dynamic(() => import("@/components/homepage/ProductSection"), {
  loading: () => <div className="h-96 bg-white animate-pulse rounded-lg" />,
});

const BrandCarousel = dynamic(() => import("@/components/homepage/BrandCarousel"), {
  loading: () => <div className="h-32 bg-white animate-pulse rounded-lg" />,
});

const PromoBanners = dynamic(() => import("@/components/homepage/PromoBanners"), {
  loading: () => <div className="h-48 bg-gray-100 animate-pulse rounded-lg" />,
});

// Value propositions for trust building
const valueProps = [
  { icon: Truck, title: "Free Delivery", desc: "On orders above Rs. 2000" },
  { icon: Shield, title: "Genuine Products", desc: "100% authentic brands" },
  { icon: Clock, title: "Fast Shipping", desc: "2-4 days delivery" },
  { icon: Headphones, title: "24/7 Support", desc: "Always here to help" },
];

export default async function HomePage() {
  // Fetch data server-side - parallel fetching for performance
  const [
    trendingProducts, 
    featuredBrands,
    skinCareProducts,
    hairCareProducts,
    nailProducts,
  ] = await Promise.all([
    fetchTrendingProducts().catch(() => []),
    fetchFeaturedBrands().catch(() => []),
    fetchProductsByCategory('skincare', 8).catch(() => []),
    fetchProductsByCategory('hair-care', 8).catch(() => []),
    fetchProductsByCategory('nail-manicure', 8).catch(() => []),
  ]);

  // Helper to convert CategoryProduct to TrendingProduct format for ProductSection
  const toTrendingFormat = (products: CategoryProduct[]) => 
    products.map(p => ({
      product_id: p.id,
      name: p.name,
      slug: p.slug,
      trend_score: 0,
      source: 'active' as const,
      min_price: p.price,
      image_url: p.image_url,
      average_rating: 0,
      is_featured: p.is_featured,
    }));

  return (
    <main className="min-h-screen bg-[#F5F5F5]">
      {/* Hero Section with Banner Carousel */}
      <section className="max-w-7xl mx-auto px-4 pt-4">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
          {/* Main Banner - Takes 3 columns */}
          <div className="lg:col-span-3">
            <Suspense fallback={<div className="h-[400px] bg-gray-200 animate-pulse rounded-lg" />}>
              <HeroBanner />
            </Suspense>
          </div>

          {/* Side Promotions - Takes 1 column */}
          <div className="hidden lg:flex flex-col gap-4">
            {/* App Download Card */}
            <div className="bg-gradient-to-br from-[#1976D2] to-[#0d47a1] rounded-lg p-4 text-white flex-1">
              <div className="flex items-center gap-2 mb-2">
                <Sparkles className="h-5 w-5 text-yellow-300" />
                <span className="text-sm font-medium">KB Stylish App</span>
              </div>
              <p className="text-xs text-white/80 mb-3">Get exclusive deals on the app</p>
              <div className="flex gap-2">
                <div className="bg-black rounded px-2 py-1 text-[10px]">
                  <span className="block text-[8px] text-gray-400">GET IT ON</span>
                  Google Play
                </div>
                <div className="bg-black rounded px-2 py-1 text-[10px]">
                  <span className="block text-[8px] text-gray-400">Download on</span>
                  App Store
                </div>
              </div>
            </div>

            {/* Special Offer Card */}
            <div className="bg-gradient-to-br from-[#E31B23] to-[#b71c1c] rounded-lg p-4 text-white flex-1">
              <div className="flex items-center gap-2 mb-2">
                <Gift className="h-5 w-5 text-yellow-300" />
                <span className="text-sm font-medium">Launch Offer!</span>
              </div>
              <p className="text-2xl font-bold mb-1">Up to 50% OFF</p>
              <p className="text-xs text-white/80 mb-3">On salon essentials</p>
              <Link
                href="/shop?category=combos"
                className="inline-block bg-white text-[#E31B23] text-xs font-medium px-4 py-2 rounded-full hover:bg-yellow-300 transition-colors"
              >
                Shop Now
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Category Strip */}
      <section className="max-w-7xl mx-auto px-4 mt-6">
        <Suspense fallback={<div className="h-24 bg-white animate-pulse rounded-lg" />}>
          <CategoryStrip />
        </Suspense>
      </section>

      {/* Value Propositions */}
      <section className="max-w-7xl mx-auto px-4 mt-6">
        <div className="bg-white rounded-lg shadow-sm p-3 sm:p-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-4">
            {valueProps.map((prop) => (
              <div key={prop.title} className="flex items-center gap-2 sm:gap-3 p-1 sm:p-2">
                <div className="w-8 h-8 sm:w-12 sm:h-12 bg-blue-50 rounded-full flex items-center justify-center flex-shrink-0">
                  <prop.icon className="h-4 w-4 sm:h-6 sm:w-6 text-[#1976D2]" />
                </div>
                <div className="min-w-0">
                  <p className="font-semibold text-gray-800 text-xs sm:text-sm truncate">{prop.title}</p>
                  <p className="text-[10px] sm:text-xs text-gray-500 truncate">{prop.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Flash Sale / Hot Deals Section */}
      <section className="max-w-7xl mx-auto px-4 mt-6">
        <div className="bg-gradient-to-r from-[#E31B23] to-[#ff5722] rounded-lg p-4 text-white">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <Percent className="h-6 w-6" />
              <div>
                <h2 className="text-xl font-bold">Flash Sale</h2>
                <p className="text-xs text-white/80">Limited time offers on top products</p>
              </div>
            </div>
            <Link
              href="/shop?sale=true"
              className="flex items-center gap-1 text-sm font-medium hover:text-yellow-300 transition-colors"
            >
              View All <ChevronRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* Trending Products Section */}
      <section className="max-w-7xl mx-auto px-4 mt-6">
        <Suspense fallback={<div className="h-96 bg-white animate-pulse rounded-lg" />}>
          <ProductSection
            title="Trending Products"
            subtitle="Most popular items this week"
            products={trendingProducts}
            viewAllLink="/shop?sort=trending"
          />
        </Suspense>
      </section>

      {/* Promotional Banners */}
      <section className="max-w-7xl mx-auto px-4 mt-6">
        <Suspense fallback={<div className="h-48 bg-gray-100 animate-pulse rounded-lg" />}>
          <PromoBanners />
        </Suspense>
      </section>

      {/* Featured Brands */}
      <section className="max-w-7xl mx-auto px-4 mt-6">
        <div className="bg-white rounded-lg shadow-sm p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-xl font-bold text-gray-800">Shop by Brands</h2>
              <p className="text-sm text-gray-500">Trusted brands for your salon needs</p>
            </div>
            <Link
              href="/shop"
              className="flex items-center gap-1 text-[#1976D2] text-sm font-medium hover:underline"
            >
              See All <ChevronRight className="h-4 w-4" />
            </Link>
          </div>
          <Suspense fallback={<div className="h-32 bg-gray-100 animate-pulse rounded-lg" />}>
            <BrandCarousel brands={featuredBrands} />
          </Suspense>
        </div>
      </section>

      {/* Skincare Category - Dynamic from DB */}
      {skinCareProducts.length > 0 && (
        <section className="max-w-7xl mx-auto px-4 mt-6">
          <Suspense fallback={<div className="h-96 bg-white animate-pulse rounded-lg" />}>
            <ProductSection
              title="Skincare & Facial Treatments"
              subtitle="Professional-grade skincare products"
              products={toTrendingFormat(skinCareProducts)}
              viewAllLink="/shop?category=skincare"
              bgColor="bg-gradient-to-r from-pink-50 to-purple-50"
            />
          </Suspense>
        </section>
      )}

      {/* Hair Care Category - Dynamic from DB */}
      {hairCareProducts.length > 0 && (
        <section className="max-w-7xl mx-auto px-4 mt-6">
          <Suspense fallback={<div className="h-96 bg-white animate-pulse rounded-lg" />}>
            <ProductSection
              title="Hair Care Essentials"
              subtitle="Shampoos, conditioners & treatments"
              products={toTrendingFormat(hairCareProducts)}
              viewAllLink="/shop?category=hair-care"
              bgColor="bg-gradient-to-r from-blue-50 to-cyan-50"
            />
          </Suspense>
        </section>
      )}

      {/* Nail & Manicure Category - Dynamic from DB */}
      {nailProducts.length > 0 && (
        <section className="max-w-7xl mx-auto px-4 mt-6">
          <Suspense fallback={<div className="h-96 bg-white animate-pulse rounded-lg" />}>
            <ProductSection
              title="Nail & Manicure"
              subtitle="Gel polish, acrylics & nail tools"
              products={toTrendingFormat(nailProducts)}
              viewAllLink="/shop?category=nail-manicure"
              bgColor="bg-gradient-to-r from-rose-50 to-orange-50"
            />
          </Suspense>
        </section>
      )}

      {/* Combo Deals Section */}
      <section className="max-w-7xl mx-auto px-4 mt-6">
        <div className="bg-gradient-to-r from-[#FFD400] to-[#FFC107] rounded-lg p-4 sm:p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg sm:text-xl font-bold text-gray-800">🎁 Combo Deals</h2>
              <p className="text-xs sm:text-sm text-gray-700">Save more when you buy together</p>
            </div>
            <Link
              href="/shop?category=combos"
              className="flex items-center gap-1 bg-gray-800 text-white text-xs sm:text-sm font-medium px-3 sm:px-4 py-1.5 sm:py-2 rounded-full hover:bg-gray-700 transition-colors"
            >
              View All <ChevronRight className="h-4 w-4" />
            </Link>
          </div>
          {/* Horizontal scroll on mobile, grid on desktop */}
          <div className="flex md:grid md:grid-cols-4 gap-3 sm:gap-4 overflow-x-auto pb-2 -mx-1 px-1 scrollbar-hide">
            <div className="bg-white rounded-lg p-3 sm:p-4 text-center flex-shrink-0 w-36 sm:w-auto">
              <div className="w-full aspect-square bg-gray-100 rounded-lg mb-2 sm:mb-3 flex items-center justify-center">
                <Gift className="h-8 w-8 sm:h-12 sm:w-12 text-gray-400" />
              </div>
              <p className="font-medium text-gray-800 text-xs sm:text-sm">Starter Kit</p>
              <p className="text-[10px] sm:text-xs text-gray-500">5 Products</p>
              <p className="text-[#E31B23] font-bold mt-1 text-sm">Rs. 2,999</p>
              <p className="text-[10px] sm:text-xs text-gray-400 line-through">Rs. 4,500</p>
            </div>
            <div className="bg-white rounded-lg p-3 sm:p-4 text-center flex-shrink-0 w-36 sm:w-auto">
              <div className="w-full aspect-square bg-gray-100 rounded-lg mb-2 sm:mb-3 flex items-center justify-center">
                <Gift className="h-8 w-8 sm:h-12 sm:w-12 text-gray-400" />
              </div>
              <p className="font-medium text-gray-800 text-xs sm:text-sm">Pro Facial Kit</p>
              <p className="text-[10px] sm:text-xs text-gray-500">8 Products</p>
              <p className="text-[#E31B23] font-bold mt-1 text-sm">Rs. 5,499</p>
              <p className="text-[10px] sm:text-xs text-gray-400 line-through">Rs. 7,999</p>
            </div>
            <div className="bg-white rounded-lg p-3 sm:p-4 text-center flex-shrink-0 w-36 sm:w-auto">
              <div className="w-full aspect-square bg-gray-100 rounded-lg mb-2 sm:mb-3 flex items-center justify-center">
                <Gift className="h-8 w-8 sm:h-12 sm:w-12 text-gray-400" />
              </div>
              <p className="font-medium text-gray-800 text-xs sm:text-sm">Hair Care Bundle</p>
              <p className="text-[10px] sm:text-xs text-gray-500">6 Products</p>
              <p className="text-[#E31B23] font-bold mt-1 text-sm">Rs. 3,299</p>
              <p className="text-[10px] sm:text-xs text-gray-400 line-through">Rs. 4,800</p>
            </div>
            <div className="bg-white rounded-lg p-3 sm:p-4 text-center flex-shrink-0 w-36 sm:w-auto">
              <div className="w-full aspect-square bg-gray-100 rounded-lg mb-2 sm:mb-3 flex items-center justify-center">
                <Gift className="h-8 w-8 sm:h-12 sm:w-12 text-gray-400" />
              </div>
              <p className="font-medium text-gray-800 text-xs sm:text-sm">Complete Salon Set</p>
              <p className="text-[10px] sm:text-xs text-gray-500">12 Products</p>
              <p className="text-[#E31B23] font-bold mt-1 text-sm">Rs. 9,999</p>
              <p className="text-[10px] sm:text-xs text-gray-400 line-through">Rs. 15,000</p>
            </div>
          </div>
        </div>
      </section>

      {/* Call to Action - Book a Stylist */}
      <section className="max-w-7xl mx-auto px-4 mt-6 mb-8">
        <div className="bg-gradient-to-r from-[#1976D2] to-[#0d47a1] rounded-lg p-8 text-white">
          <div className="grid md:grid-cols-2 gap-6 items-center">
            <div>
              <h2 className="text-2xl md:text-3xl font-bold mb-2">Need a Professional Stylist?</h2>
              <p className="text-white/80 mb-4">
                Book our expert stylists for in-home salon services. Professional care at your doorstep.
              </p>
              <Link
                href="/book-a-stylist"
                className="inline-flex items-center gap-2 bg-[#FFD400] text-gray-800 font-semibold px-6 py-3 rounded-full hover:bg-yellow-300 transition-colors"
              >
                Book Now <ChevronRight className="h-5 w-5" />
              </Link>
            </div>
            <div className="hidden md:flex justify-center">
              <div className="w-48 h-48 bg-white/10 rounded-full flex items-center justify-center">
                <Sparkles className="h-24 w-24 text-yellow-300" />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Didn't Find Section - Like Vhandar */}
      <section className="max-w-7xl mx-auto px-4 mb-8">
        <div className="grid md:grid-cols-2 gap-4">
          <div className="bg-[#1976D2] rounded-lg p-6 text-white">
            <h3 className="text-lg font-bold mb-2">Didn&apos;t find what you were looking for? 🤔</h3>
            <p className="text-sm text-white/80 mb-4">Suggest a product & we&apos;ll look into it.</p>
            <Link
              href="/support"
              className="inline-block bg-white text-[#1976D2] text-sm font-medium px-4 py-2 rounded-full hover:bg-yellow-300 hover:text-gray-800 transition-colors"
            >
              Suggest a Product
            </Link>
          </div>
          <div className="bg-[#0d47a1] rounded-lg p-6 text-white">
            <p className="text-xs text-white/60 mb-1">YOU CAN</p>
            <h3 className="text-lg font-bold mb-2">Call or WhatsApp</h3>
            <p className="text-xs text-white/60 mb-2">FOR ORDER</p>
            <a
              href="tel:+9779851234567"
              className="inline-flex items-center gap-2 bg-[#25D366] text-white text-lg font-bold px-4 py-2 rounded-full hover:bg-[#128C7E] transition-colors"
            >
              📞 9851234567
            </a>
          </div>
        </div>
      </section>
    </main>
  );
}
