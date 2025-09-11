import ProductCard from "./ProductCard";
import type { Product } from "@/lib/types";

const products: Product[] = [
  {
    id: "p1",
    name: "Classic Denim Jacket",
    price: 3499,
    badge: "Trending",
    imageUrl:
      "https://images.unsplash.com/photo-1516822003754-cca485356ecb?q=80&w=1200&auto=format&fit=crop",
  },
  {
    id: "p2",
    name: "Silk Saree - Royal Plum",
    price: 7999,
    badge: "New",
    imageUrl:
      "https://unsplash.com/photos/wcgCFUi_Zws/download?force=true&w=1200&q=80",
  },
  {
    id: "p3",
    name: "Minimalist Leather Watch",
    price: 5999,
    imageUrl:
      "https://images.unsplash.com/photo-1511385348-a52b4a160dc2?q=80&w=1200&auto=format&fit=crop",
  },
  {
    id: "p4",
    name: "K-Beauty Skincare Set",
    price: 2599,
    imageUrl:
      "https://unsplash.com/photos/ayBCtRueEtI/download?force=true&w=1200&q=80",
  },
];

export default function TrendingProducts() {
  return (
    <section className="mx-auto max-w-7xl px-4 py-10">
      <div className="flex items-end justify-between">
        <h2 className="text-2xl font-semibold">Trending Products</h2>
        <a href="/shop" className="text-sm text-foreground/70 hover:text-foreground">View all</a>
      </div>
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {products.map((p) => (
          <ProductCard key={p.id} product={p} />
        ))}
      </div>
    </section>
  );
}
