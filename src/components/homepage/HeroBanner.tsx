'use client';

import { useState, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

const banners = [
  {
    id: 1,
    title: "Professional Salon Products",
    subtitle: "Up to 40% OFF on Premium Brands",
    cta: "Shop Now",
    href: "/shop",
    bgColor: "from-[#1976D2] to-[#0d47a1]",
    image: "https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?w=800&q=80",
  },
  {
    id: 2,
    title: "Facial Kits Collection",
    subtitle: "Gold, Wine, Diamond & More",
    cta: "Explore",
    href: "/shop?category=facial-kits",
    bgColor: "from-[#E31B23] to-[#b71c1c]",
    image: "https://images.unsplash.com/photo-1596755389378-c31d21fd1273?w=800&q=80",
  },
  {
    id: 3,
    title: "Hair Care Essentials",
    subtitle: "Shampoos, Serums & Treatments",
    cta: "Shop Hair Care",
    href: "/shop?category=hair-care",
    bgColor: "from-[#7b1fa2] to-[#4a148c]",
    image: "https://images.unsplash.com/photo-1527799820374-dcf8d9d4a388?w=800&q=80",
  },
  {
    id: 4,
    title: "Launch Special Combos",
    subtitle: "Save up to 50% on Bundles",
    cta: "View Combos",
    href: "/shop?category=combos",
    bgColor: "from-[#FFD400] to-[#FFC107]",
    image: "https://images.unsplash.com/photo-1571781926291-c477ebfd024b?w=800&q=80",
  },
];

export default function HeroBanner() {
  const [currentSlide, setCurrentSlide] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % banners.length);
    }, 5000);
    return () => clearInterval(timer);
  }, []);

  const goToSlide = (index: number) => {
    setCurrentSlide(index);
  };

  const prevSlide = () => {
    setCurrentSlide((prev) => (prev - 1 + banners.length) % banners.length);
  };

  const nextSlide = () => {
    setCurrentSlide((prev) => (prev + 1) % banners.length);
  };

  const banner = banners[currentSlide];

  return (
    <div className="relative h-[240px] sm:h-[260px] lg:h-[280px] rounded-lg overflow-hidden group">
      {/* Background Gradient */}
      <div className={`absolute inset-0 bg-gradient-to-r ${banner.bgColor}`} />

      {/* Background Image */}
      <div className="absolute inset-0 opacity-30">
        <Image
          src={banner.image}
          alt={banner.title}
          fill
          className="object-cover"
          priority
        />
      </div>

      {/* Content */}
      <div className="relative h-full flex items-center px-8 lg:px-12">
        <div className="max-w-lg">
          <h2 className={`text-3xl sm:text-4xl lg:text-5xl font-bold mb-3 ${banner.bgColor.includes('FFD400') ? 'text-gray-800' : 'text-white'}`}>
            {banner.title}
          </h2>
          <p className={`text-lg sm:text-xl mb-6 ${banner.bgColor.includes('FFD400') ? 'text-gray-700' : 'text-white/90'}`}>
            {banner.subtitle}
          </p>
          <Link
            href={banner.href}
            className={`inline-flex items-center gap-2 px-6 py-3 rounded-full font-semibold transition-all hover:scale-105 ${
              banner.bgColor.includes('FFD400')
                ? 'bg-gray-800 text-white hover:bg-gray-700'
                : 'bg-[#FFD400] text-gray-800 hover:bg-yellow-300'
            }`}
          >
            {banner.cta}
            <ChevronRight className="h-5 w-5" />
          </Link>
        </div>
      </div>

      {/* Navigation Arrows */}
      <button
        onClick={prevSlide}
        className="absolute left-4 top-1/2 -translate-y-1/2 w-10 h-10 bg-white/20 hover:bg-white/40 rounded-full flex items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-opacity"
        aria-label="Previous slide"
      >
        <ChevronLeft className="h-6 w-6" />
      </button>
      <button
        onClick={nextSlide}
        className="absolute right-4 top-1/2 -translate-y-1/2 w-10 h-10 bg-white/20 hover:bg-white/40 rounded-full flex items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-opacity"
        aria-label="Next slide"
      >
        <ChevronRight className="h-6 w-6" />
      </button>

      {/* Dots Indicator */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2">
        {banners.map((_, index) => (
          <button
            key={index}
            onClick={() => goToSlide(index)}
            className={`w-2.5 h-2.5 rounded-full transition-all ${
              index === currentSlide
                ? 'bg-white w-6'
                : 'bg-white/50 hover:bg-white/70'
            }`}
            aria-label={`Go to slide ${index + 1}`}
          />
        ))}
      </div>
    </div>
  );
}
