import React from "react";
import { formatNPR, cn } from "@/lib/utils";

export default function ProductPrice({
  price,
  compareAt,
  className,
}: {
  price: number;
  compareAt?: number;
  className?: string;
}) {
  const hasDiscount = typeof compareAt === "number" && compareAt > price;
  const discount = hasDiscount ? Math.round(((compareAt! - price) / compareAt!) * 100) : 0;

  return (
    <div className={cn("flex items-end gap-3", className)}>
      <span className="text-3xl font-bold tracking-tight">{formatNPR(price)}</span>
      {hasDiscount && (
        <>
          <span className="text-lg text-foreground/60 line-through">{formatNPR(compareAt!)}</span>
          <span className="rounded-full bg-[var(--kb-accent-gold)]/20 px-2 py-0.5 text-xs font-semibold text-[var(--kb-accent-gold)]">
            -{discount}%
          </span>
        </>
      )}
    </div>
  );
}
