"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

const sortOptions = [
  { id: "popularity", label: "Popularity" },
  { id: "newest", label: "Newest" },
  { id: "price_low", label: "Price: Low to High" },
  { id: "price_high", label: "Price: High to Low" },
];

interface CurrentFilters {
  search: string;
  selectedCategories: string[];
  minPrice: string;
  maxPrice: string;
  sort: string;
}

interface FilterSidebarProps {
  availableCategories: string[];
  currentFilters: CurrentFilters;
}

export default function FilterSidebar({
  availableCategories,
  currentFilters,
}: FilterSidebarProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  
  // Local state for form inputs
  const [filters, setFilters] = useState<CurrentFilters>(currentFilters);

  const categories = availableCategories.map(cat => ({
    id: cat,
    label: cat.charAt(0).toUpperCase() + cat.slice(1)
  }));

  const handleApplyFilters = () => {
    const params = new URLSearchParams();
    
    if (filters.search.trim()) {
      params.set('search', filters.search.trim());
    }
    
    if (filters.selectedCategories.length > 0) {
      params.set('categories', filters.selectedCategories.join(','));
    }
    
    if (filters.minPrice.trim()) {
      params.set('minPrice', filters.minPrice.trim());
    }
    
    if (filters.maxPrice.trim()) {
      params.set('maxPrice', filters.maxPrice.trim());
    }
    
    if (filters.sort && filters.sort !== 'popularity') {
      params.set('sort', filters.sort);
    }

    // Reset cursor when applying new filters
    params.delete('cursor');
    
    startTransition(() => {
      router.push(`/shop?${params.toString()}`);
    });
  };

  const onSearchChange = (v: string) => setFilters(f => ({ ...f, search: v }));
  const onToggleCategory = (id: string, checked: boolean) =>
    setFilters(f => ({
      ...f,
      selectedCategories: checked
        ? [...new Set([...f.selectedCategories, id])]
        : f.selectedCategories.filter(x => x !== id),
    }));
  const onMinPriceChange = (v: string) => setFilters(f => ({ ...f, minPrice: v }));
  const onMaxPriceChange = (v: string) => setFilters(f => ({ ...f, maxPrice: v }));
  const onSortChange = (v: string) => setFilters(f => ({ ...f, sort: v }));
  
  return (
    <aside className="space-y-6">
      {/* Search */}
      <div>
        <label className="text-sm font-semibold">Search</label>
        <input
          type="text"
          value={filters.search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search products"
          className="mt-2 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm ring-1 ring-white/10 placeholder:text-foreground/50 focus:outline-none focus:ring-2 focus:ring-[var(--kb-accent-gold)]"
        />
      </div>

      {/* Category */}
      <div>
        <p className="text-sm font-semibold">Category</p>
        <div className="mt-2 space-y-2">
          {categories.map((c) => {
            const isChecked = filters.selectedCategories.includes(c.id);
            return (
              <label key={c.id} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={isChecked}
                  onChange={(e) => onToggleCategory(c.id, e.target.checked)}
                  className="h-4 w-4 rounded border-white/20 bg-white/5 text-[var(--kb-primary-brand)] focus:ring-[var(--kb-primary-brand)]"
                />
                {c.label}
              </label>
            );
          })}
        </div>
      </div>

      {/* Price Range */}
      <div>
        <p className="text-sm font-semibold">Price Range (NPR)</p>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <input
            type="number"
            inputMode="numeric"
            value={filters.minPrice}
            onChange={(e) => onMinPriceChange(e.target.value)}
            placeholder="Min"
            className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm ring-1 ring-white/10 placeholder:text-foreground/50 focus:outline-none focus:ring-2 focus:ring-[var(--kb-accent-gold)]"
          />
          <input
            type="number"
            inputMode="numeric"
            value={filters.maxPrice}
            onChange={(e) => onMaxPriceChange(e.target.value)}
            placeholder="Max"
            className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm ring-1 ring-white/10 placeholder:text-foreground/50 focus:outline-none focus:ring-2 focus:ring-[var(--kb-accent-gold)]"
          />
        </div>
      </div>

      {/* Sorting */}
      <div>
        <p className="text-sm font-semibold">Sort by</p>
        <select
          value={filters.sort}
          onChange={(e) => onSortChange(e.target.value)}
          className="mt-2 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm ring-1 ring-white/10 focus:outline-none focus:ring-2 focus:ring-[var(--kb-accent-gold)] [&>option]:bg-[var(--kb-surface-dark)] [&>option]:text-foreground"
        >
          {sortOptions.map((o) => (
            <option key={o.id} value={o.id} className="bg-[var(--kb-surface-dark)] text-foreground">
              {o.label}
            </option>
          ))}
        </select>
      </div>

      {/* Apply */}
      <button
        onClick={handleApplyFilters}
        disabled={isPending}
        className="w-full rounded-full bg-gradient-to-r from-[color-mix(in_oklab,var(--kb-primary-brand)_75%,black)] to-[var(--kb-primary-brand)] px-4 py-2 text-sm font-semibold text-foreground ring-1 ring-white/10 transition hover:from-[var(--kb-primary-brand)] hover:to-[var(--kb-primary-brand)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--kb-accent-gold)] disabled:opacity-50"
      >
        {isPending ? "Applying..." : "Apply"}
      </button>
    </aside>
  );
}
