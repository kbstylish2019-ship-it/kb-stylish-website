"use client";
import { useEffect, useMemo, useState } from "react";
import FilterSidebar from "@/components/shop/FilterSidebar";
import ProductGrid from "@/components/shared/ProductGrid";
import type { Product } from "@/lib/types";

const allProducts: Product[] = [
  {
    id: "p1",
    name: "Classic Denim Jacket",
    price: 3499,
    badge: "Trending",
    category: "streetwear",
    imageUrl:
      "https://images.unsplash.com/photo-1516822003754-cca485356ecb?q=80&w=1200&auto=format&fit=crop",
  },
  {
    id: "p2",
    name: "Silk Saree - Royal Plum",
    price: 7999,
    badge: "New",
    category: "ethnic",
    imageUrl:
      "https://unsplash.com/photos/wcgCFUi_Zws/download?force=true&w=1200&q=80",
  },
  {
    id: "p3",
    name: "Minimalist Leather Watch",
    price: 5999,
    category: "formal",
    imageUrl:
      "https://images.unsplash.com/photo-1511385348-a52b4a160dc2?q=80&w=1200&auto=format&fit=crop",
  },
  {
    id: "p4",
    name: "K-Beauty Skincare Set",
    price: 2599,
    category: "casual",
    imageUrl:
      "https://unsplash.com/photos/ayBCtRueEtI/download?force=true&w=1200&q=80",
  },
  {
    id: "p5",
    name: "Athleisure Joggers",
    price: 1999,
    category: "casual",
    imageUrl:
      "https://unsplash.com/photos/YiYv0FBNqjI/download?force=true&w=1200&q=80",
  },
  {
    id: "p6",
    name: "Himalayan Wool Scarf",
    price: 1499,
    category: "casual",
    imageUrl:
      "https://unsplash.com/photos/x4qSJ-nMmvk/download?force=true&w=1200&q=80",
  },
  {
    id: "p7",
    name: "Premium Formal Shirt",
    price: 2799,
    category: "formal",
    imageUrl:
      "https://unsplash.com/photos/Xo4YvBp6IBM/download?force=true&w=1200&q=80",
  },
  {
    id: "p8",
    name: "Streetwear Hoodie - Onyx",
    price: 3299,
    category: "streetwear",
    imageUrl:
      "https://unsplash.com/photos/XEmkHQXAHFs/download?force=true&w=1200&q=80",
  },
];

type SortKey = "popularity" | "newest" | "price_low" | "price_high";

interface Filters {
  search: string;
  selectedCategories: string[];
  minPrice: string; // keep inputs as strings to preserve UX
  maxPrice: string;
  sort: SortKey;
}

const initialFilters: Filters = {
  search: "",
  selectedCategories: [],
  minPrice: "",
  maxPrice: "",
  sort: "popularity",
};

export default function ShopPage() {
  // Pending (UI) filters controlled in parent
  const [filters, setFilters] = useState<Filters>(initialFilters);
  // Applied filters drive the product list; updated only on Apply
  const [applied, setApplied] = useState<Filters>(initialFilters);
  const [visible, setVisible] = useState<Product[]>(allProducts);

  const totalCount = useMemo(() => allProducts.length, []);

  useEffect(() => {
    // Compute filtered + sorted when applied changes
    const searchTerm = applied.search.trim().toLowerCase();
    const min = applied.minPrice ? Number(applied.minPrice) : undefined;
    const max = applied.maxPrice ? Number(applied.maxPrice) : undefined;
    const categorySet = new Set(applied.selectedCategories);

    let next = allProducts.filter((p) => {
      if (searchTerm && !p.name.toLowerCase().includes(searchTerm)) return false;
      if (categorySet.size > 0 && (!p.category || !categorySet.has(p.category))) return false;
      if (typeof min === "number" && p.price < min) return false;
      if (typeof max === "number" && p.price > max) return false;
      return true;
    });

    switch (applied.sort) {
      case "price_low":
        next = [...next].sort((a, b) => a.price - b.price);
        break;
      case "price_high":
        next = [...next].sort((a, b) => b.price - a.price);
        break;
      case "newest":
      case "popularity":
      default:
        // Keep insertion order for now (no-op).
        break;
    }
    setVisible(next);
  }, [applied]);

  // Handlers to control sidebar inputs
  const onSearchChange = (v: string) => setFilters((f) => ({ ...f, search: v }));
  const onToggleCategory = (id: string, checked: boolean) =>
    setFilters((f) => ({
      ...f,
      selectedCategories: checked
        ? [...new Set([...f.selectedCategories, id])]
        : f.selectedCategories.filter((x) => x !== id),
    }));
  const onMinPriceChange = (v: string) => setFilters((f) => ({ ...f, minPrice: v }));
  const onMaxPriceChange = (v: string) => setFilters((f) => ({ ...f, maxPrice: v }));
  const onSortChange = (v: string) => setFilters((f) => ({ ...f, sort: v as SortKey }));
  const onApplyFilters = () => setApplied(filters);

  return (
    <main className="mx-auto max-w-7xl px-4 py-10">
      <div className="grid gap-8 lg:grid-cols-[280px_1fr]">
        <FilterSidebar
          search={filters.search}
          selectedCategories={filters.selectedCategories}
          minPrice={filters.minPrice}
          maxPrice={filters.maxPrice}
          sort={filters.sort}
          onSearchChange={onSearchChange}
          onToggleCategory={onToggleCategory}
          onMinPriceChange={onMinPriceChange}
          onMaxPriceChange={onMaxPriceChange}
          onSortChange={onSortChange}
          onApplyFilters={onApplyFilters}
        />
        <section>
          <div className="flex items-baseline justify-between">
            <h1 className="text-2xl font-semibold">Shop</h1>
            <p className="text-sm text-foreground/70">{visible.length} of {totalCount} products</p>
          </div>
          <div className="mt-6">
            <ProductGrid products={visible} />
          </div>
        </section>
      </div>
    </main>
  );
}
