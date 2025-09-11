import type { ProductDetail, Product, Review } from "@/lib/types";

export function getMockProduct(slug: string): ProductDetail {
  const reviews: Review[] = [
    {
      id: "r1",
      author: "Anisha S.",
      rating: 5,
      title: "Elegant and comfortable",
      content:
        "The fabric quality is superb and the fit is true to size. I wore it to a family event and received so many compliments!",
      date: "2025-07-01",
    },
    {
      id: "r2",
      author: "Prakash B.",
      rating: 4,
      title: "Great value",
      content:
        "Color is vibrant and looks premium. Delivery was quick inside Kathmandu.",
      date: "2025-07-12",
    },
    {
      id: "r3",
      author: "Sajan K.",
      rating: 5,
      content:
        "Quality stitching and the gold accents are subtle yet classy. Would buy again.",
      date: "2025-07-25",
    },
  ];

  return {
    id: "p-aurora-kurta",
    slug,
    name: "Aurora Satin Kurta Set",
    description:
      "A refined kurta set inspired by Himalayan twilight — crafted in satin-blend fabric with a gentle sheen, tailored silhouette, and delicate gold piping.",
    price: 4990,
    compareAtPrice: 6490,
    currency: "NPR",
    vendor: { id: "v-kb", name: "KB Stylish Originals", rating: 4.8 },
    images: [
      { url: "https://picsum.photos/id/1027/1200/1200", alt: "Aurora Satin Kurta – hero" },
      { url: "https://picsum.photos/id/1011/1200/1200", alt: "Aurora Satin Kurta – alternate angle" },
      { url: "https://picsum.photos/id/1005/1200/1200", alt: "Aurora Satin Kurta – fabric detail" },
      { url: "https://picsum.photos/id/1021/1200/1200", alt: "Aurora Satin Kurta – back view" },
      { url: "https://picsum.photos/id/1069/1200/1200", alt: "Aurora Satin Kurta – lifestyle" },
    ],
    options: [
      { id: "size", name: "Size", values: ["S", "M", "L", "XL"] },
      { id: "color", name: "Color", values: ["Royal Purple", "Midnight Black"] },
    ],
    variants: [
      { id: "vp-s", options: { Size: "S", Color: "Royal Purple" }, price: 4990, stock: 7, sku: "AUR-PUR-S" },
      { id: "vp-m", options: { Size: "M", Color: "Royal Purple" }, price: 4990, stock: 4, sku: "AUR-PUR-M" },
      { id: "vp-l", options: { Size: "L", Color: "Royal Purple" }, price: 4990, stock: 2, sku: "AUR-PUR-L" },
      { id: "vp-xl", options: { Size: "XL", Color: "Royal Purple" }, price: 4990, stock: 0, sku: "AUR-PUR-XL" },
      { id: "vb-s", options: { Size: "S", Color: "Midnight Black" }, price: 4990, stock: 5, sku: "AUR-BLK-S" },
      { id: "vb-m", options: { Size: "M", Color: "Midnight Black" }, price: 4990, stock: 0, sku: "AUR-BLK-M" },
      { id: "vb-l", options: { Size: "L", Color: "Midnight Black" }, price: 4990, stock: 3, sku: "AUR-BLK-L" },
      { id: "vb-xl", options: { Size: "XL", Color: "Midnight Black" }, price: 4990, stock: 1, sku: "AUR-BLK-XL" },
    ],
    badges: ["New", "Limited"],
    avgRating: 4.7,
    reviewCount: reviews.length,
    reviews,
    stockStatus: "in_stock",
    shipping: {
      estimated: "2-4 days in KTM | 3-6 days nationwide",
      cost: "Free over NPR 2,000 | NPR 99 standard",
      codAvailable: true,
    },
    returns: {
      days: 7,
      summary: "7-day easy returns on unused items with tags.",
    },
  };
}

export function getRelatedProducts(): Product[] {
  return [
    {
      id: "rp-1",
      name: "Serenity Chiffon Dupatta",
      price: 1290,
      imageUrl:
        "https://images.unsplash.com/photo-1542114555-8be002e1a8a9?q=80&w=900&auto=format&fit=crop",
      badge: "Bestseller",
      category: "ethnic",
    },
    {
      id: "rp-2",
      name: "Regal Kolhapuri Sandals",
      price: 2390,
      imageUrl:
        "https://images.unsplash.com/photo-1533867617858-e7b97b173cab?q=80&w=900&auto=format&fit=crop",
      badge: "Trending",
      category: "footwear",
    },
    {
      id: "rp-3",
      name: "Noor Statement Earrings",
      price: 990,
      imageUrl:
        "https://images.unsplash.com/photo-1610622845878-1b6ac8948a58?q=80&w=900&auto=format&fit=crop",
      category: "accessories",
    },
  ];
}
