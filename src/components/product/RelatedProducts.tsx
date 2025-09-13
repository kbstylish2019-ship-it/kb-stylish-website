import React from "react";
import Link from "next/link";
import Image from "next/image";
import type { Product } from "@/lib/types";
import { formatNPR } from "@/lib/utils";

export default function RelatedProducts({ products }: { products: Product[] }) {
  return (
    <section aria-labelledby="complete-the-look" className="mt-12">
      <h2 id="complete-the-look" className="mb-4 text-lg font-semibold tracking-tight">
        Complete the Look
      </h2>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
        {products.map((p) => (
          <Link
            key={p.id}
            href={`/product/${p.id}`}
            className="group overflow-hidden rounded-xl border border-white/10 bg-white/5"
          >
            <div className="relative aspect-[4/5] overflow-hidden">
              <Image 
                src={p.imageUrl || "/next.svg"} 
                alt={p.name} 
                fill
                className="object-cover transition group-hover:scale-105" 
                sizes="(max-width: 768px) 50vw, (max-width: 1200px) 33vw, 25vw"
              />
            </div>
            <div className="p-3">
              <div className="truncate text-sm font-medium">{p.name}</div>
              <div className="text-sm text-foreground/70">{formatNPR(p.price)}</div>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
