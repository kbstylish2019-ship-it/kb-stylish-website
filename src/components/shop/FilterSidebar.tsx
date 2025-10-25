"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ChevronDown } from "lucide-react";

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
  // Mobile collapsible sections
  const [open, setOpen] = useState<{search:boolean;category:boolean;price:boolean;sort:boolean}>({
    search: false,
    category: false,
    price: false,
    sort: false,
  });
  const toggle = (k: keyof typeof open) => setOpen((s) => ({ ...s, [k]: !s[k] }));

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
    <aside className="space-y-4">
      {/* Search */}
      <div>
        <button
          type="button"
          onClick={() => toggle('search')}
          className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm font-semibold lg:hidden"
        >
          <span>Search</span>
          <ChevronDown className={`h-4 w-4 transition-transform ${open.search ? 'rotate-180' : ''}`} />
        </button>
        <div className={`lg:block ${open.search ? 'block' : 'hidden'}`}>
          <label className="text-sm font-semibold hidden lg:block">Search</label>
          <input
            type="text"
            value={filters.search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search products"
            className="mt-2 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm ring-1 ring-white/10 placeholder:text-foreground/50 focus:outline-none focus:ring-2 focus:ring-[var(--kb-accent-gold)]"
          />
        </div>
      </div>

      {/* Category */}
      <div>
        <button
          type="button"
          onClick={() => toggle('category')}
          className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm font-semibold lg:hidden"
        >
          <span>Category</span>
          <ChevronDown className={`h-4 w-4 transition-transform ${open.category ? 'rotate-180' : ''}`} />
        </button>
        <p className="text-sm font-semibold hidden lg:block">Category</p>
        <div className={`mt-2 space-y-2 lg:block ${open.category ? 'block' : 'hidden'}`}>
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
        <button
          type="button"
          onClick={() => toggle('price')}
          className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm font-semibold lg:hidden"
        >
          <span>Price Range (NPR)</span>
          <ChevronDown className={`h-4 w-4 transition-transform ${open.price ? 'rotate-180' : ''}`} />
        </button>
        <p className="text-sm font-semibold hidden lg:block">Price Range (NPR)</p>
        <div className={`mt-2 grid grid-cols-2 gap-2 lg:grid ${open.price ? 'grid' : 'hidden'}`}>
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
        <button
          type="button"
          onClick={() => toggle('sort')}
          className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm font-semibold lg:hidden"
        >
          <span>Sort by</span>
          <ChevronDown className={`h-4 w-4 transition-transform ${open.sort ? 'rotate-180' : ''}`} />
        </button>
        <p className="text-sm font-semibold hidden lg:block">Sort by</p>
        <div className={`lg:block ${open.sort ? 'block' : 'hidden'}`}>
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
