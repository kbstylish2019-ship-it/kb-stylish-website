import Link from "next/link";
import { Gem, Shirt, Sparkles, Watch } from "lucide-react";

const categories = [
  { id: "women", label: "Women", href: "/shop?cat=women", Icon: Sparkles },
  { id: "men", label: "Men", href: "/shop?cat=men", Icon: Shirt },
  { id: "beauty", label: "Beauty", href: "/shop?cat=beauty", Icon: Gem },
  { id: "accessories", label: "Accessories", href: "/shop?cat=accessories", Icon: Watch },
];

export default function CategoryGrid() {
  return (
    <section className="mx-auto max-w-7xl px-4 py-10">
      <h2 className="text-2xl font-semibold">Shop by Category</h2>
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {categories.map(({ id, label, href, Icon }) => (
          <Link
            key={id}
            href={href}
            className="group relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-b from-white/5 to-transparent p-5 ring-1 ring-white/10 transition hover:translate-y-[-2px] hover:shadow-lg"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-foreground/70">Explore</p>
                <p className="mt-1 text-lg font-semibold">{label}</p>
              </div>
              <div className="rounded-xl bg-white/5 p-3 ring-1 ring-white/10">
                <Icon className="h-6 w-6 text-[var(--kb-accent-gold)]" />
              </div>
            </div>
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-[var(--kb-primary-brand)]/10 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
          </Link>
        ))}
      </div>
    </section>
  );
}
