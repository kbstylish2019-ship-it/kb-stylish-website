import { Suspense } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import Image from "next/image";
import { 
  fetchTrendingProducts, 
  fetchProductsByCategory,
  fetchActiveCombos,
  type CategoryProduct,
  type ComboProductSummary 
} from "@/lib/apiClient";
import { ChevronRight, Truck, Shield, Clock, Headphones, Sparkles, Gift, Percent, Package } from "lucide-react";
import { formatNPR } from "@/lib/utils";

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
    skinCareProducts,
    hairCareProducts,
    nailProducts,
    activeCombos,
  ] = await Promise.all([
    fetchTrendingProducts().catch(() => []),
    fetchProductsByCategory('skincare', 8).catch(() => []),
    fetchProductsByCategory('hair-care', 8).catch(() => []),
    fetchProductsByCategory('nail-manicure', 8).catch(() => []),
    fetchActiveCombos(4).catch(() => []),
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
            {/* App Coming Soon Card - Simplified */}
            <div className="bg-gradient-to-br from-[#1976D2] to-[#0d47a1] rounded-lg p-6 text-white h-full flex flex-col justify-between">
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <Sparkles className="h-6 w-6 text-yellow-300" />
                  <span className="text-base font-semibold">KB Stylish App</span>
                </div>
                <h3 className="text-xl font-bold mb-2">Download Our App Soon!</h3>
                <p className="text-sm text-white/90 mb-4">
                  Get exclusive deals, easy ordering, and track your deliveries in real-time
                </p>
              </div>
              
              {/* Coming Soon Badge */}
              <div className="bg-white rounded-lg px-4 py-3 text-center shadow-md">
                <span className="text-base font-bold text-yellow-500">🚀 Coming Soon!</span>
                <p className="text-xs text-gray-900 mt-1">Available on iOS & Android</p>
              </div>
            </div>

            {/* Special Offer Card - COMMENTED OUT FOR LAUNCH */}
            {/* <div className="bg-gradient-to-br from-[#E31B23] to-[#b71c1c] rounded-lg p-4 text-white flex-1">
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
            </div> */}
          </div>
        </div>
      </section>

      {/* Category Strip */}
      <section className="max-w-7xl mx-auto px-4 mt-6">
        <Suspense fallback={<div className="h-24 bg-white animate-pulse rounded-lg" />}>
          <CategoryStrip />
        </Suspense>
      </section>

      {/* Flash Sale / Hot Deals Section - COMMENTED OUT FOR LAUNCH */}
      {/* <section className="max-w-7xl mx-auto px-4 mt-6">
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
      </section> */}

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

      {/* Promotional Banners - COMMENTED OUT FOR LAUNCH (Facial Kits, Hair Care, Combo Deals) */}
      {/* <section className="max-w-7xl mx-auto px-4 mt-6">
        <Suspense fallback={<div className="h-48 bg-gray-100 animate-pulse rounded-lg" />}>
          <PromoBanners />
        </Suspense>
      </section> */}

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

      {/* Combo Deals Section - COMMENTED OUT FOR LAUNCH (Testing Phase) */}
      {/* {activeCombos.length > 0 && (
        <section className="max-w-7xl mx-auto px-4 mt-6">
          <div className="bg-gradient-to-r from-[#FFD400] to-[#FFC107] rounded-lg p-4 sm:p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg sm:text-xl font-bold text-gray-800">🎁 Combo Deals</h2>
                <p className="text-xs sm:text-sm text-gray-700">Save more when you buy together</p>
              </div>
              <Link
                href="/shop?is_combo=true"
                className="flex items-center gap-1 bg-gray-800 text-white text-xs sm:text-sm font-medium px-3 sm:px-4 py-1.5 sm:py-2 rounded-full hover:bg-gray-700 transition-colors"
              >
                View All <ChevronRight className="h-4 w-4" />
              </Link>
            </div>
            <div className="flex md:grid md:grid-cols-4 gap-3 sm:gap-4 overflow-x-auto pb-2 -mx-1 px-1 scrollbar-hide">
              {activeCombos.map((combo) => {
                const comboPrice = combo.combo_price_cents / 100;
                const originalPrice = (combo.combo_price_cents + combo.combo_savings_cents) / 100;
                const savingsPercent = Math.round((combo.combo_savings_cents / (combo.combo_price_cents + combo.combo_savings_cents)) * 100);
                const remaining = combo.combo_quantity_limit ? combo.combo_quantity_limit - combo.combo_quantity_sold : null;
                
                return (
                  <Link
                    key={combo.id}
                    href={`/product/${combo.slug}`}
                    className="bg-white rounded-lg p-3 sm:p-4 text-center flex-shrink-0 w-36 sm:w-auto hover:shadow-md transition-shadow group"
                  >
                    <div className="relative w-full aspect-square bg-gray-100 rounded-lg mb-2 sm:mb-3 overflow-hidden">
                      {combo.image_url ? (
                        <Image
                          src={combo.image_url}
                          alt={combo.name}
                          fill
                          className="object-cover group-hover:scale-105 transition-transform"
                          sizes="(max-width: 768px) 144px, 200px"
                        />
                      ) : (
                        <div className="flex items-center justify-center h-full">
                          <Package className="h-8 w-8 sm:h-12 sm:w-12 text-gray-400" />
                        </div>
                      )}
                      {savingsPercent > 0 && (
                        <span className="absolute top-2 right-2 bg-green-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded">
                          -{savingsPercent}%
                        </span>
                      )}
                      {remaining !== null && remaining <= 5 && remaining > 0 && (
                        <span className="absolute bottom-2 left-2 bg-amber-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded">
                          Only {remaining} left!
                        </span>
                      )}
                    </div>
                    <p className="font-medium text-gray-800 text-xs sm:text-sm line-clamp-1">{combo.name}</p>
                    <p className="text-[10px] sm:text-xs text-gray-500">{combo.item_count} Products</p>
                    <p className="text-[#E31B23] font-bold mt-1 text-sm">{formatNPR(comboPrice)}</p>
                    <p className="text-[10px] sm:text-xs text-gray-400 line-through">{formatNPR(originalPrice)}</p>
                  </Link>
                );
              })}
            </div>
          </div>
        </section>
      )} */}

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

      {/* Value Propositions - Trust Building Section */}
      <section className="max-w-7xl mx-auto px-4 mt-6 mb-6">
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
              href="https://wa.me/9779801227448"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 bg-[#25D366] text-white text-lg font-bold px-4 py-2 rounded-full hover:bg-[#128C7E] transition-colors"
            >
              📞 9801227448
            </a>
          </div>
        </div>
      </section>
    </main>
  );
}
