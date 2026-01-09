'use client';

import Link from "next/link";
import { Sparkles, Scissors, Gift } from "lucide-react";

const promos = [
  {
    id: 1,
    title: "Facial Kits",
    subtitle: "Gold, Wine, Diamond & More",
    discount: "Up to 40% OFF",
    href: "/shop?category=facial-kits",
    bgColor: "from-pink-500 to-rose-600",
    icon: Sparkles,
  },
  {
    id: 2,
    title: "Hair Care",
    subtitle: "Shampoos & Treatments",
    discount: "Starting Rs. 299",
    href: "/shop?category=hair-care",
    bgColor: "from-purple-500 to-indigo-600",
    icon: Scissors,
  },
  {
    id: 3,
    title: "Combo Deals",
    subtitle: "Save More Together",
    discount: "Up to 50% OFF",
    href: "/shop?category=combos",
    bgColor: "from-orange-500 to-red-600",
    icon: Gift,
  },
];

export default function PromoBanners() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {promos.map((promo) => (
        <Link
          key={promo.id}
          href={promo.href}
          className={`relative overflow-hidden rounded-lg bg-gradient-to-r ${promo.bgColor} p-6 text-white hover:shadow-lg transition-shadow group`}
        >
          {/* Background Pattern */}
          <div className="absolute inset-0 opacity-10">
            <div className="absolute -right-8 -top-8 w-32 h-32 bg-white rounded-full" />
            <div className="absolute -right-4 -bottom-4 w-24 h-24 bg-white rounded-full" />
          </div>

          {/* Content */}
          <div className="relative z-10">
            <promo.icon className="h-8 w-8 mb-3 group-hover:scale-110 transition-transform" />
            <h3 className="text-lg font-bold mb-1">{promo.title}</h3>
            <p className="text-sm text-white/80 mb-2">{promo.subtitle}</p>
            <span className="inline-block bg-white/20 backdrop-blur-sm px-3 py-1 rounded-full text-sm font-semibold">
              {promo.discount}
            </span>
          </div>
        </Link>
      ))}
    </div>
  );
}
