"use client";
import React from "react";
import Image from "next/image";
import { Package, Trash2 } from "lucide-react";
import type { CartProductItem } from "@/lib/types";
import { formatNPR, cn } from "@/lib/utils";

interface ComboGroupProps {
  comboGroupId: string;
  comboName: string;
  items: CartProductItem[];
  originalTotal: number;
  discountedTotal: number;
  onRemove: (comboGroupId: string) => void;
  onQuantityChange?: (comboGroupId: string, quantity: number) => void;
  isRemoving?: boolean;
  isUpdating?: boolean;
}

export default function ComboGroup({
  comboGroupId,
  comboName,
  items,
  originalTotal,
  discountedTotal,
  onRemove,
  onQuantityChange,
  isRemoving = false,
  isUpdating = false,
}: ComboGroupProps) {
  const savings = originalTotal - discountedTotal;
  const savingsPercent = Math.round((savings / originalTotal) * 100);
  
  // Calculate combo quantity (use the first item's quantity as the base)
  const comboQuantity = items[0]?.quantity || 1;

  return (
    <div className="rounded-xl border-2 border-purple-200 bg-purple-50/30 p-4 mb-4">
      {/* Combo Header */}
      <div className="flex items-center justify-between mb-3 pb-3 border-b border-purple-200">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-purple-600 text-white">
            <Package className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-gray-900">{comboName}</h3>
            <p className="text-xs text-purple-600 font-medium">
              Save {formatNPR(savings)} ({savingsPercent}%)
            </p>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          {/* Combo Quantity Controls */}
          {onQuantityChange && (
            <div className="inline-flex items-center rounded-lg border border-purple-300 bg-white">
              <button
                type="button"
                aria-label="Decrease combo quantity"
                className="h-8 w-8 text-purple-600 hover:bg-purple-50 disabled:opacity-50 rounded-l-lg transition-colors"
                onClick={() => onQuantityChange(comboGroupId, Math.max(1, comboQuantity - 1))}
                disabled={comboQuantity <= 1 || isUpdating}
              >
                −
              </button>
              <input
                aria-label="Combo quantity"
                type="number"
                min={1}
                value={comboQuantity}
                onChange={(e) => onQuantityChange(comboGroupId, Math.max(1, Number(e.target.value)))}
                disabled={isUpdating}
                className="h-8 w-14 bg-transparent text-center text-sm text-gray-900 border-x border-purple-300 disabled:opacity-50"
              />
              <button
                type="button"
                aria-label="Increase combo quantity"
                className="h-8 w-8 text-purple-600 hover:bg-purple-50 disabled:opacity-50 rounded-r-lg transition-colors"
                onClick={() => onQuantityChange(comboGroupId, comboQuantity + 1)}
                disabled={isUpdating}
              >
                +
              </button>
            </div>
          )}
          
          <button
            type="button"
            onClick={() => onRemove(comboGroupId)}
            disabled={isRemoving || isUpdating}
            aria-label={`Remove ${comboName}`}
            className={cn(
              "inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs text-red-600 border border-red-200 hover:bg-red-50 hover:border-red-300 transition-colors",
              (isRemoving || isUpdating) && "opacity-50 cursor-not-allowed"
            )}
          >
            <Trash2 className="h-3.5 w-3.5" />
            {isRemoving ? "Removing..." : "Remove"}
          </button>
        </div>
      </div>

      {/* Combo Items */}
      <div className="space-y-2">
        {items.map((item, index) => (
          <div
            key={`${item.id}-${index}`}
            className="flex items-center gap-3 py-2 px-3 rounded-lg bg-white/60"
          >
            {/* Product Image */}
            <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-md border border-gray-200 bg-gray-50">
              {item.imageUrl ? (
                <Image
                  src={item.imageUrl}
                  alt={item.name}
                  fill
                  className="object-cover"
                  sizes="48px"
                />
              ) : (
                <div className="flex size-full items-center justify-center text-xs text-gray-400">
                  No image
                </div>
              )}
            </div>

            {/* Product Info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-gray-900 truncate">
                    {item.name}
                  </div>
                  {item.variantData && Object.keys(item.variantData).filter(k => k !== 'colorHex' && item.variantData![k]).length > 0 && (
                    <div className="flex flex-wrap items-center gap-1.5 mt-1">
                      {item.variantData.color && (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs bg-gray-100 text-gray-700 border border-gray-200">
                          <span
                            className="w-2.5 h-2.5 rounded-full border border-gray-300"
                            style={{ backgroundColor: item.variantData.colorHex || '#666' }}
                          />
                          {item.variantData.color}
                        </span>
                      )}
                      {Object.entries(item.variantData)
                        .filter(([key, value]) => key !== 'color' && key !== 'colorHex' && value)
                        .map(([key, value]) => (
                          <span
                            key={`${key}-${value}`}
                            className="inline-flex items-center px-1.5 py-0.5 rounded text-xs bg-gray-100 text-gray-700 font-medium border border-gray-200"
                          >
                            {value}
                          </span>
                        ))
                      }
                    </div>
                  )}
                </div>
                <div className="text-right shrink-0">
                  <div className="text-sm font-medium text-gray-900">
                    {formatNPR(item.price)}
                  </div>
                  <div className="text-xs text-gray-500">
                    × {item.quantity}
                  </div>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Combo Summary */}
      <div className="mt-3 pt-3 border-t border-purple-200">
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-600">Combo Total:</span>
          <div className="text-right">
            <div className="font-semibold text-purple-600">
              {formatNPR(discountedTotal)}
            </div>
            <div className="text-xs text-gray-500 line-through">
              {formatNPR(originalTotal)}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
