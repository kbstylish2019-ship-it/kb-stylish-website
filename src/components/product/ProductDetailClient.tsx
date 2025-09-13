"use client";
import React from "react";
import type { ProductDetail, ProductVariant } from "@/lib/types";
import dynamic from "next/dynamic";

// Lazy load non-critical product components
const Breadcrumbs = dynamic(() => import("./Breadcrumbs"), {
  loading: () => <div className="animate-pulse bg-white/5 rounded-xl" />,
});

const ProductImageGallery = dynamic(() => import("./ProductImageGallery"), {
  loading: () => <div className="aspect-square animate-pulse bg-white/5 rounded-xl" />,
});

const ProductMeta = dynamic(() => import("./ProductMeta"), {
  loading: () => <div className="h-24 animate-pulse bg-white/5 rounded-xl" />,
});

const ProductPrice = dynamic(() => import("./ProductPrice"), {
  loading: () => <div className="h-12 animate-pulse bg-white/5 rounded-xl" />,
});

const ProductOptions = dynamic(() => import("./ProductOptions"), {
  loading: () => <div className="h-32 animate-pulse bg-white/5 rounded-xl" />,
});

const ProductActions = dynamic(() => import("./ProductActions"), {
  loading: () => <div className="h-20 animate-pulse bg-white/5 rounded-xl" />,
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

  // Mobile sticky CTA
  const priceToShow = selectedVariant?.price ?? product.price;

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

      {/* Mobile sticky bar */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-background/90 backdrop-blur lg:hidden">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3">
          <div className="text-lg font-semibold">NPR {priceToShow.toLocaleString("en-NP")}</div>
          <button
            type="button"
            disabled={!selectedVariant || (selectedVariant && selectedVariant.stock <= 0)}
            className="flex-1 rounded-lg bg-[var(--kb-primary-brand)] px-5 py-3 text-sm font-semibold text-foreground shadow-sm disabled:cursor-not-allowed disabled:opacity-50"
          >
            Add to Cart
          </button>
        </div>
      </div>
    </div>
  );
}
