"use client";

import React, { useMemo, CSSProperties } from "react";
import type { Product } from "@/lib/types";
import ProductCard from "@/components/homepage/ProductCard";

type ListLikeProps = {
  height: number;
  itemCount: number;
  itemSize: number;
  width: number;
  overscanCount?: number;
  className?: string;
  children: (props: { index: number; style: CSSProperties }) => React.ReactNode;
};

interface VirtualizedProductGridProps {
  products: Product[];
  itemWidth?: number;
  itemHeight?: number;
  gap?: number;
}

/**
 * VirtualizedProductGrid - High-performance product grid using react-window
 * Capable of rendering thousands of products without performance degradation
 * Only renders visible items in the viewport plus a small buffer
 */
export default function VirtualizedProductGrid({
  products,
  itemWidth = 280,
  itemHeight = 380,
  gap = 16,
}: VirtualizedProductGridProps) {
  const [ListComp, setListComp] = React.useState<React.ComponentType<ListLikeProps> | null>(null);
  const [dimensions, setDimensions] = React.useState({
    width: 0,
    height: 600,
    columnCount: 1,
  });

  // Calculate responsive column count
  React.useEffect(() => {
    const updateDimensions = () => {
      const container = document.getElementById("virtualized-grid-container");
      if (container) {
        const width = container.offsetWidth;
        const columnCount = Math.max(1, Math.floor((width + gap) / (itemWidth + gap)));
        setDimensions({
          width,
          height: window.innerHeight - 200, // Adjust based on header/footer
          columnCount,
        });
      }
    };

    updateDimensions();
    window.addEventListener("resize", updateDimensions);
    return () => window.removeEventListener("resize", updateDimensions);
  }, [itemWidth, gap]);

  // Load react-window at runtime to avoid optimizer import issues
  React.useEffect(() => {
    let mounted = true;
    import("react-window")
      .then((mod) => {
        if (!mounted) return;
        const Comp = (mod as unknown as { FixedSizeList: React.ComponentType<ListLikeProps> }).FixedSizeList;
        setListComp(() => Comp);
      })
      .catch(() => {
        if (mounted) setListComp(null);
      });
    return () => {
      mounted = false;
    };
  }, []);

  // Calculate row count for a list where each row contains `columnCount` items
  const rowCount = Math.ceil(products.length / Math.max(1, dimensions.columnCount));

  // Row renderer memoized for performance
  const Row = useMemo(
    () => {
      const RowComponent = React.memo(({ index, style }: { index: number; style: CSSProperties }) => {
        const start = index * dimensions.columnCount;
        const end = Math.min(start + dimensions.columnCount, products.length);
        const items = products.slice(start, end);

        // Offset row position and account for gaps
        const adjustedStyle: CSSProperties = {
          ...style,
          left: typeof style.left === "number" ? style.left : style.left,
          top: typeof style.top === "number" ? style.top : style.top,
          width: typeof style.width === "number" ? style.width : style.width,
          height: typeof style.height === "number" ? style.height : style.height,
        };

        return (
          <div style={adjustedStyle}>
            <div
              className="grid"
              style={{
                display: "grid",
                gridTemplateColumns: `repeat(${dimensions.columnCount}, minmax(0, 1fr))`,
                gap: `${gap}px`,
                padding: `${gap / 2}px`,
              }}
            >
              {items.map((product) => (
                <div key={product.id} style={{ minWidth: 0 }}>
                  <ProductCard product={product} />
                </div>
              ))}
            </div>
          </div>
        );
      });
      RowComponent.displayName = "GridRow";
      return RowComponent;
    },
    [products, dimensions.columnCount, gap]
  );

  if (!products?.length) {
    return (
      <div className="rounded-2xl border border-white/10 bg-white/5 p-8 text-center text-sm text-foreground/70 ring-1 ring-white/10">
        No products found.
      </div>
    );
  }

  // For small lists, prefer a simple static grid for best UX and no virtualization overhead
  if (products.length <= 30) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {products.map((p) => (
          <ProductCard key={p.id} product={p} />
        ))}
      </div>
    );
  }

  if (dimensions.width === 0) {
    return (
      <div id="virtualized-grid-container" className="h-96 w-full">
        <div className="animate-pulse rounded-2xl bg-white/5 h-full" />
      </div>
    );
  }

  return (
    <div id="virtualized-grid-container" className="w-full">
      {ListComp ? (
        <ListComp
          className="scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent"
          height={dimensions.height}
          itemCount={rowCount}
          itemSize={itemHeight + gap}
          width={dimensions.width}
          overscanCount={2}
        >
          {Row}
        </ListComp>
      ) : (
        <div className="animate-pulse rounded-2xl bg-white/5 h-96" />
      )}
      <div className="mt-4 text-center text-xs text-foreground/60">
        Showing {Math.min(products.length, dimensions.columnCount * 10)} of {products.length} products
        {products.length > 100 && " (virtualized for performance)"}
      </div>
    </div>
  );
}
