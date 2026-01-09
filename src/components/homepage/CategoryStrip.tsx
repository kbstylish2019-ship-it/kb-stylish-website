'use client';

import Link from "next/link";
import { useEffect, useState } from "react";
import { 
  Sparkles, 
  Scissors, 
  Droplets, 
  Armchair, 
  Gift, 
  Star, 
  Leaf, 
  Palette,
  Brush,
  Wrench,
  ShieldCheck,
  Sofa,
  Package,
  Loader2,
  type LucideIcon
} from "lucide-react";

// Map category slugs to icons and colors
const categoryConfig: Record<string, { icon: LucideIcon; color: string }> = {
  'skincare': { icon: Droplets, color: "bg-pink-100 text-pink-600" },
  'facial-kits': { icon: Sparkles, color: "bg-purple-100 text-purple-600" },
  'hair-care': { icon: Scissors, color: "bg-blue-100 text-blue-600" },
  'hair-styling': { icon: Brush, color: "bg-indigo-100 text-indigo-600" },
  'nail-manicure': { icon: Palette, color: "bg-rose-100 text-rose-600" },
  'salon-tools-equipments': { icon: Wrench, color: "bg-orange-100 text-orange-600" },
  'salon-furniture': { icon: Armchair, color: "bg-amber-100 text-amber-600" },
  'salon-consumables': { icon: Package, color: "bg-teal-100 text-teal-600" },
  'salon-hygiene-safety': { icon: ShieldCheck, color: "bg-green-100 text-green-600" },
  'beauty-spa-equipment': { icon: Sofa, color: "bg-cyan-100 text-cyan-600" },
  'ethnic': { icon: Leaf, color: "bg-emerald-100 text-emerald-600" },
  'formal': { icon: Gift, color: "bg-violet-100 text-violet-600" },
  'streetwear': { icon: Star, color: "bg-yellow-100 text-yellow-600" },
  'activewear': { icon: Star, color: "bg-lime-100 text-lime-600" },
  'peels': { icon: Sparkles, color: "bg-fuchsia-100 text-fuchsia-600" },
};

// Default config for unknown categories
const defaultConfig = { icon: Star, color: "bg-gray-100 text-gray-600" };

interface Category {
  id: string;
  name: string;
  slug: string;
  sort_order: number;
}

// Fallback categories if API fails
const fallbackCategories = [
  { id: '1', name: "Skincare", slug: "skincare", sort_order: 1 },
  { id: '2', name: "Hair Care", slug: "hair-care", sort_order: 2 },
  { id: '3', name: "Hair Styling", slug: "hair-styling", sort_order: 3 },
  { id: '4', name: "Nail & Manicure", slug: "nail-manicure", sort_order: 4 },
  { id: '5', name: "Salon Tools", slug: "salon-tools-equipments", sort_order: 5 },
  { id: '6', name: "Salon Furniture", slug: "salon-furniture", sort_order: 6 },
  { id: '7', name: "Consumables", slug: "salon-consumables", sort_order: 7 },
  { id: '8', name: "Hygiene & Safety", slug: "salon-hygiene-safety", sort_order: 8 },
];

export default function CategoryStrip() {
  const [categories, setCategories] = useState<Category[]>(fallbackCategories);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function fetchCategories() {
      try {
        const response = await fetch('/api/categories');
        if (response.ok) {
          const data = await response.json();
          if (data.categories && data.categories.length > 0) {
            setCategories(data.categories);
          }
        }
      } catch (error) {
        console.error('Failed to fetch categories:', error);
        // Keep fallback categories
      } finally {
        setIsLoading(false);
      }
    }

    fetchCategories();
  }, []);

  if (isLoading) {
    return (
      <div className="bg-white rounded-lg shadow-sm p-4">
        <div className="flex items-center justify-center h-20">
          <Loader2 className="h-6 w-6 animate-spin text-[#1976D2]" />
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-sm p-4">
      <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-hide">
        {categories.slice(0, 10).map((cat) => {
          const config = categoryConfig[cat.slug] || defaultConfig;
          const IconComponent = config.icon;
          
          return (
            <Link
              key={cat.id}
              href={`/shop?category=${cat.slug}`}
              className="flex flex-col items-center gap-2 min-w-[80px] p-3 rounded-lg hover:bg-gray-50 transition-colors group"
            >
              <div className={`w-14 h-14 rounded-full ${config.color} flex items-center justify-center group-hover:scale-110 transition-transform`}>
                <IconComponent className="h-6 w-6" />
              </div>
              <span className="text-xs font-medium text-gray-700 text-center whitespace-nowrap">
                {cat.name}
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
