"use client";
import React from "react";
import type { ProductOption, ProductVariant } from "@/lib/types";
import { cn } from "@/lib/utils";

export type Selection = Record<string, string | undefined>;

function isVariantMatch(v: ProductVariant, sel: Selection) {
  return Object.entries(sel).every(([k, val]) => !val || v.options[k] === val);
}

function getAvailability(
  option: ProductOption,
  variants: ProductVariant[],
  selection: Selection
) {
  // For each value in the option, check if any variant exists with current selection + that value and stock > 0
  const other = { ...selection };
  delete other[option.name];

  const values = option.values.map((val) => {
    const match = variants.some(
      (v) => isVariantMatch(v, { ...other, [option.name]: val }) && v.stock > 0
    );
    return { value: val, available: match };
  });
  return values;
}

export default function ProductOptions({
  options,
  variants,
  selection,
  onChange,
}: {
  options: ProductOption[];
  variants: ProductVariant[];
  selection: Selection;
  onChange: (sel: Selection) => void;
}) {
  return (
    <div className="space-y-5">
      {options.map((opt) => {
        const values = getAvailability(opt, variants, selection);
        const selected = selection[opt.name];
        return (
          <div key={opt.id}>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-medium text-foreground/90">{opt.name}</span>
              <span className="text-xs text-foreground/60">
                {selected ? `Selected: ${selected}` : "Select an option"}
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              {values.map(({ value, available }) => (
                <button
                  key={value}
                  type="button"
                  disabled={!available}
                  data-testid={`opt-${opt.name}-${value}`}
                  onClick={() => onChange({ ...selection, [opt.name]: value })}
                  className={cn(
                    "rounded-full px-3 py-1.5 text-sm ring-1 transition",
                    selected === value
                      ? "bg-[var(--kb-primary-brand)]/20 ring-[var(--kb-primary-brand)] text-foreground"
                      : "ring-white/10 hover:bg-white/5",
                    !available && "opacity-40 cursor-not-allowed"
                  )}
                >
                  {value}
                </button>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
