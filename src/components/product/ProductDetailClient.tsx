"use client";
import React from "react";
import type { ProductDetail, ProductVariant } from "@/lib/types";
import dynamic from "next/dynamic";

// Import premium loading spinner
import LoadingSpinner from "@/components/ui/LoadingSpinner";

// Lazy load non-critical product components
const Breadcrumbs = dynamic(() => import("./Breadcrumbs"), {
  loading: () => (
    <div className="h-6 bg-white/10 rounded-lg w-64 mb-6 animate-pulse" />
  ),
});

const ProductImageGallery = dynamic(() => import("./ProductImageGallery"), {
  loading: () => (
    <div className="aspect-square bg-gradient-to-br from-white/10 to-white/5 rounded-xl relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent -skew-x-12 animate-shimmer" />
      <div className="absolute inset-0 flex items-center justify-center">
        <LoadingSpinner size="lg" variant="accent" />
      </div>
    </div>
  ),
});

const ProductMeta = dynamic(() => import("./ProductMeta"), {
  loading: () => (
    <div className="space-y-3 animate-pulse">
      <div className="h-8 bg-white/10 rounded-lg w-3/4" />
      <div className="h-4 bg-white/5 rounded w-1/2" />
    </div>
  ),
});

const ProductPrice = dynamic(() => import("./ProductPrice"), {
  loading: () => (
    <div className="h-10 bg-white/10 rounded-lg w-32 animate-pulse" />
  ),
});

const ProductOptions = dynamic(() => import("./ProductOptions"), {
  loading: () => (
    <div className="space-y-4 animate-pulse">
      <div className="h-6 bg-white/10 rounded w-20" />
      <div className="flex gap-2">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="h-10 w-20 bg-white/5 rounded-lg" />
        ))}
      </div>
    </div>
  ),
});

const ProductActions = dynamic(() => import("./ProductActions"), {
  loading: () => (
    <div className="space-y-3 animate-pulse">
      <div className="h-12 bg-[var(--kb-primary-brand)]/20 rounded-xl w-full" />
      <div className="h-10 bg-white/5 rounded-lg w-40" />
    </div>
  ),
});

import PDPTrustBar from "@/components/product/PDPTrustBar";

type ProductSelection = { [key: string]: string | undefined };

function findVariant(variants: ProductVariant[], selection: ProductSelection) {
  return variants.find((v) =>
    Object.entries(selection).every(([k, val]) => val && v.options[k] === val)
  );
}

export default function ProductDetailClient({ product }: { product: ProductDetail }) {
  const initial: ProductSelection = Object.fromEntries(product.options.map((o) => [o.name, undefined]));
  const [selection, setSelection] = React.useState<ProductSelection>(initial);

  const selectedVariant = React.useMemo(
    () => findVariant(product.variants, selection),
    [product.variants, selection]
  );

  

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <Breadcrumbs product={product} />
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        <ProductImageGallery images={product.images} />
        <div>
          <ProductMeta product={product} />
          <ProductPrice price={selectedVariant?.price ?? product.price} compareAt={product.compareAtPrice} className="mt-3" />
          <p className="mt-3 text-foreground/80">{product.description}</p>

          <div className="mt-6">
            <ProductOptions
              options={product.options}
              variants={product.variants}
              selection={selection}
              onChange={setSelection}
            />
          </div>

          <div className="mt-6">
            <ProductActions product={product} selectedVariant={selectedVariant} />
          </div>

          <PDPTrustBar />
        </div>
      </div>
    </div>
  );
}
