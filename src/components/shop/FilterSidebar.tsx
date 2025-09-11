"use client";

const categories = [
  { id: "ethnic", label: "Ethnic" },
  { id: "streetwear", label: "Streetwear" },
  { id: "formal", label: "Formal" },
  { id: "casual", label: "Casual" },
];

const sortOptions = [
  { id: "popularity", label: "Popularity" },
  { id: "newest", label: "Newest" },
  { id: "price_low", label: "Price: Low to High" },
  { id: "price_high", label: "Price: High to Low" },
];

interface FilterSidebarProps {
  search: string;
  selectedCategories: string[];
  minPrice: string;
  maxPrice: string;
  sort: string;
  onSearchChange: (v: string) => void;
  onToggleCategory: (id: string, checked: boolean) => void;
  onMinPriceChange: (v: string) => void;
  onMaxPriceChange: (v: string) => void;
  onSortChange: (v: string) => void;
  onApplyFilters: () => void;
}

export default function FilterSidebar({
  search,
  selectedCategories,
  minPrice,
  maxPrice,
  sort,
  onSearchChange,
  onToggleCategory,
  onMinPriceChange,
  onMaxPriceChange,
  onSortChange,
  onApplyFilters,
}: FilterSidebarProps) {
  
  return (
    <aside className="space-y-6">
      {/* Search */}
      <div>
        <label className="text-sm font-semibold">Search</label>
        <input
          type="text"
          value={search}
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
            const isChecked = selectedCategories.includes(c.id);
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
            value={minPrice}
            onChange={(e) => onMinPriceChange(e.target.value)}
            placeholder="Min"
            className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm ring-1 ring-white/10 placeholder:text-foreground/50 focus:outline-none focus:ring-2 focus:ring-[var(--kb-accent-gold)]"
          />
          <input
            type="number"
            inputMode="numeric"
            value={maxPrice}
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
          value={sort}
          onChange={(e) => onSortChange(e.target.value)}
          className="mt-2 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm ring-1 ring-white/10 focus:outline-none focus:ring-2 focus:ring-[var(--kb-accent-gold)]"
        >
          {sortOptions.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      {/* Apply */}
      <button
        onClick={onApplyFilters}
        className="w-full rounded-full bg-gradient-to-r from-[color-mix(in_oklab,var(--kb-primary-brand)_75%,black)] to-[var(--kb-primary-brand)] px-4 py-2 text-sm font-semibold text-foreground ring-1 ring-white/10 transition hover:from-[var(--kb-primary-brand)] hover:to-[var(--kb-primary-brand)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--kb-accent-gold)]"
      >
        Apply
      </button>
    </aside>
  );
}
