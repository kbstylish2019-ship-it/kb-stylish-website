'use client';

import { useState, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

// Campaign slides show the client's designed poster WHOLE (object-contain, right side)
// on a matching brand gradient — never as a cropped/faded background, so the poster's
// own text stays readable on every screen size.
// EVERY slide must carry a client poster. Stock-photo slides were removed 2026-07-31 —
// if a new slide has no artwork, don't add it, add the artwork first.
const banners = [
  {
    id: 5,
    title: "Unlock Your Winter Glow",
    subtitle: "Herbal Gold 5-Step Facial at Rs 999 — FREE Haircut & Beard Trim",
    cta: "Book Your Glow",
    href: "/book-a-stylist",
    bgColor: "from-[#0d2440] via-[#1e3a5f] to-[#2a5b8f]",
    poster: "/banners/winter-glow-offer.jpeg",
  },
  {
    id: 6,
    title: "Get Groomed Look",
    subtitle: "Metallic Silver Colour at only Rs 1,200 — Limited Time Offer",
    cta: "Book a Stylist",
    href: "/book-a-stylist",
    bgColor: "from-[#132f66] to-[#2151a1]",
    poster: "/banners/groomed-look-offer.jpeg",
  },
  {
    id: 7,
    title: "The Weekly Confidence Reset",
    subtitle: "Fresh Haircut. Fresh Mindset. Fresh Week.",
    cta: "Book a Stylist",
    href: "/book-a-stylist",
    bgColor: "from-[#0b3a8f] to-[#062a6b]",
    poster: "/banners/weekly-confidence-reset.jpeg",
  },
  {
    id: 8,
    title: "Professional Grooming",
    subtitle: "Sharp cuts. Clean fades. Confident style.",
    cta: "Book Now",
    href: "/book-a-stylist",
    bgColor: "from-[#12121a] to-[#2a2418]",
    poster: "/banners/professional-grooming.jpeg",
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
  const hasPoster = 'poster' in banner && !!banner.poster;

  return (
    <div className="relative h-[240px] sm:h-[260px] lg:h-[280px] rounded-lg overflow-hidden group">
      {/* Background Gradient */}
      <div className={`absolute inset-0 bg-gradient-to-r ${banner.bgColor}`} />

      {/* Campaign poster (shown whole, right side) */}
      {hasPoster && (
        <div className="absolute right-1 sm:right-4 lg:right-8 inset-y-2">
          <div className="relative h-full w-[160px] sm:w-[180px] lg:w-[200px]">
            <Image
              src={banner.poster}
              alt={banner.title}
              fill
              className="object-contain object-right drop-shadow-xl rounded"
              priority
            />
          </div>
        </div>
      )}

      {/* Content */}
      <div className={`relative h-full flex items-center ${hasPoster ? 'px-4 sm:px-8 lg:px-12 pr-[170px] sm:pr-[200px] lg:pr-[230px]' : 'px-8 lg:px-12'}`}>
        <div className="max-w-lg">
          <h2 className={`${hasPoster ? 'text-lg sm:text-3xl lg:text-4xl mb-1.5 sm:mb-3' : 'text-3xl sm:text-4xl lg:text-5xl mb-3'} font-bold text-white`}>
            {banner.title}
          </h2>
          <p className={`${hasPoster ? 'text-xs sm:text-base lg:text-lg mb-3 sm:mb-5' : 'text-lg sm:text-xl mb-6'} text-white/90`}>
            {banner.subtitle}
          </p>
          <Link
            href={banner.href}
            className={`inline-flex items-center gap-2 ${hasPoster ? 'px-4 py-2 text-sm sm:px-6 sm:py-3 sm:text-base' : 'px-6 py-3'} rounded-full font-semibold transition-all hover:scale-105 bg-[#FFD400] text-gray-800 hover:bg-yellow-300`}
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
