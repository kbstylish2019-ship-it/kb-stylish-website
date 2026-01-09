"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ChevronDown, ChevronUp, Search } from "lucide-react";

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
  
  // Collapsible sections
  const [openSections, setOpenSections] = useState({
    category: true,
    price: true,
  });

  const toggleSection = (section: keyof typeof openSections) => {
    setOpenSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  const categories = availableCategories.length > 0 
    ? availableCategories.map(cat => ({
        id: cat,
        label: cat.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
      }))
    : [
        { id: 'facial-kits', label: 'Facial Kits' },
        { id: 'hair-care', label: 'Hair Care' },
        { id: 'skin-care', label: 'Skin Care' },
        { id: 'salon-equipment', label: 'Salon Equipment' },
        { id: 'combos', label: 'Combo Deals' },
        { id: 'herbal', label: 'Herbal Products' },
        { id: 'makeup', label: 'Makeup' },
      ];

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

    params.delete('cursor');

    startTransition(() => {
      router.push(`/shop?${params.toString()}`);
    });
  };

  const handleClearFilters = () => {
    setFilters({
      search: '',
      selectedCategories: [],
      minPrice: '',
      maxPrice: '',
      sort: 'popularity',
    });
    startTransition(() => {
      router.push('/shop');
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

  const hasFilters = filters.search || filters.selectedCategories.length > 0 || filters.minPrice || filters.maxPrice;

  return (
    <aside className="bg-white rounded-lg shadow-sm overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b bg-gray-50">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-gray-800">Filters</h2>
          {hasFilters && (
            <button
              onClick={handleClearFilters}
              className="text-sm text-red-500 hover:text-red-600"
            >
              Clear all
            </button>
          )}
        </div>
      </div>

      {/* Search */}
      <div className="p-4 border-b">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            value={filters.search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search products..."
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1976D2] focus:border-transparent"
          />
        </div>
      </div>

      {/* Categories */}
      <div className="border-b">
        <button
          onClick={() => toggleSection('category')}
          className="w-full p-4 flex items-center justify-between hover:bg-gray-50 transition-colors"
        >
          <span className="font-medium text-gray-800">Categories</span>
          {openSections.category ? (
            <ChevronUp className="h-4 w-4 text-gray-500" />
          ) : (
            <ChevronDown className="h-4 w-4 text-gray-500" />
          )}
        </button>
        {openSections.category && (
          <div className="px-4 pb-4 space-y-2">
            {categories.map((cat) => {
              const isChecked = filters.selectedCategories.includes(cat.id);
              return (
                <label
                  key={cat.id}
                  className="flex items-center gap-3 py-1 cursor-pointer group"
                >
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={(e) => onToggleCategory(cat.id, e.target.checked)}
                    className="w-4 h-4 rounded border-gray-300 text-[#1976D2] focus:ring-[#1976D2]"
                  />
                  <span className={`text-sm ${isChecked ? 'text-[#1976D2] font-medium' : 'text-gray-600 group-hover:text-gray-800'}`}>
                    {cat.label}
                  </span>
                </label>
              );
            })}
          </div>
        )}
      </div>

      {/* Price Range */}
      <div className="border-b">
        <button
          onClick={() => toggleSection('price')}
          className="w-full p-4 flex items-center justify-between hover:bg-gray-50 transition-colors"
        >
          <span className="font-medium text-gray-800">Price Range</span>
          {openSections.price ? (
            <ChevronUp className="h-4 w-4 text-gray-500" />
          ) : (
            <ChevronDown className="h-4 w-4 text-gray-500" />
          )}
        </button>
        {openSections.price && (
          <div className="px-4 pb-4">
            <div className="flex items-center gap-2">
              <div className="flex-1">
                <label className="text-xs text-gray-500 mb-1 block">Min (Rs.)</label>
                <input
                  type="number"
                  inputMode="numeric"
                  value={filters.minPrice}
                  onChange={(e) => onMinPriceChange(e.target.value)}
                  placeholder="0"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1976D2] focus:border-transparent"
                />
              </div>
              <span className="text-gray-400 mt-5">-</span>
              <div className="flex-1">
                <label className="text-xs text-gray-500 mb-1 block">Max (Rs.)</label>
                <input
                  type="number"
                  inputMode="numeric"
                  value={filters.maxPrice}
                  onChange={(e) => onMaxPriceChange(e.target.value)}
                  placeholder="50000"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1976D2] focus:border-transparent"
                />
              </div>
            </div>
            {/* Quick price filters */}
            <div className="flex flex-wrap gap-2 mt-3">
              {[
                { label: 'Under Rs. 500', min: '', max: '500' },
                { label: 'Rs. 500 - 1000', min: '500', max: '1000' },
                { label: 'Rs. 1000 - 2000', min: '1000', max: '2000' },
                { label: 'Above Rs. 2000', min: '2000', max: '' },
              ].map((range) => (
                <button
                  key={range.label}
                  onClick={() => {
                    setFilters(f => ({ ...f, minPrice: range.min, maxPrice: range.max }));
                  }}
                  className={`px-2 py-1 text-xs rounded-full border transition-colors ${
                    filters.minPrice === range.min && filters.maxPrice === range.max
                      ? 'bg-[#1976D2] text-white border-[#1976D2]'
                      : 'border-gray-300 text-gray-600 hover:border-[#1976D2] hover:text-[#1976D2]'
                  }`}
                >
                  {range.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Apply Button */}
      <div className="p-4">
        <button
          onClick={handleApplyFilters}
          disabled={isPending}
          className="w-full py-3 bg-[#1976D2] text-white font-semibold rounded-lg hover:bg-[#1565C0] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isPending ? "Applying..." : "Apply Filters"}
        </button>
      </div>
    </aside>
  );
}
