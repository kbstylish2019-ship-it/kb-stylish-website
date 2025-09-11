import React from "react";
import type { ProductDetail } from "@/lib/types";

export default function Breadcrumbs({ product }: { product: ProductDetail }) {
  return (
    <nav aria-label="Breadcrumb" className="mb-4 text-sm text-foreground/70">
      <ol className="flex items-center gap-2">
        <li>
          <a href="/" className="hover:text-foreground">Home</a>
        </li>
        <li aria-hidden>›</li>
        <li>
          <a href="/shop" className="hover:text-foreground">Shop</a>
        </li>
        <li aria-hidden>›</li>
        <li>
          <a href={`/vendor/${product.vendor.id}`} className="hover:text-foreground">
            {product.vendor.name}
          </a>
        </li>
        <li aria-hidden>›</li>
        <li className="text-foreground/90" aria-current="page">
          {product.name}
        </li>
      </ol>
    </nav>
  );
}
