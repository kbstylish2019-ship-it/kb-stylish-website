import Link from "next/link";

// Icon mapping for categories
const categoryIcons: Record<string, string> = {
  "women": "👗",
  "men": "👔", 
  "beauty": "💄",
  "accessories": "👜",
  "formal": "🤵",
  "casual": "👕",
  "ethnic": "🥻",
  "activewear": "👟",
  "streetwear": "🧥",
  "new-category": "✨",
  "test-category": "🧪",
  // Fallback icon
  "default": "🛍️"
};

interface QuickCategoriesProps {
  categories: string[];
}

export default function QuickCategories({ categories }: QuickCategoriesProps) {
  return (
    <section className="mx-auto max-w-7xl px-4 py-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">Shop by Category</h2>
        <Link 
          href="/shop" 
          className="text-sm text-[var(--kb-primary-brand)] hover:underline"
        >
          View all →
        </Link>
      </div>
      <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
        {categories.map((category) => {
          const categoryKey = category.toLowerCase();
          const icon = categoryIcons[categoryKey] || categoryIcons.default;
          const displayName = category.charAt(0).toUpperCase() + category.slice(1).replace(/-/g, ' ');
          
          return (
            <Link
              key={category}
              href={`/shop?categories=${encodeURIComponent(category)}`}
              className="flex-shrink-0 flex flex-col items-center gap-2 rounded-xl bg-white/5 p-4 min-w-[100px] ring-1 ring-white/10 hover:bg-white/10 transition-colors"
            >
              <span className="text-2xl">{icon}</span>
              <span className="text-sm font-medium text-center">{displayName}</span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
