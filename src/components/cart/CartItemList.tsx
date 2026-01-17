'use client';

import React, { useMemo } from 'react';
import Image from 'next/image';
import { Trash2, Package } from 'lucide-react';
import CartComboGroup from './CartComboGroup';
import type { CartProductItem } from '@/lib/types';
import type { CartComboGroup as CartComboGroupType, ComboCartItem } from '@/types/combo';
import { formatNPR, cn } from '@/lib/utils';

interface CartItemListProps {
  items: CartProductItem[];
  onQtyChange: (id: string, qty: number, variant?: string) => void;
  onRemove: (id: string, variant?: string) => void;
  onRemoveCombo?: (comboGroupId: string) => void;
  isRemovingCombo?: string | null;
}

/**
 * CartItemList - Displays cart items with combo grouping support
 * 
 * Groups items by combo_group_id and renders:
 * - CartComboGroup for combo items
 * - Regular item rows for non-combo items
 */
export default function CartItemList({
  items,
  onQtyChange,
  onRemove,
  onRemoveCombo,
  isRemovingCombo,
}: CartItemListProps) {
  // Separate combo items from regular items and group combos
  const { comboGroups, regularItems } = useMemo(() => {
    const comboMap = new Map<string, ComboCartItem[]>();
    const regular: CartProductItem[] = [];

    items.forEach((item) => {
      const extendedItem = item as CartProductItem & {
        combo_id?: string;
        combo_group_id?: string;
        combo_name?: string;
        combo_price_cents?: number;
        combo_savings_cents?: number;
      };

      if (extendedItem.combo_group_id) {
        // This is a combo item
        const existing = comboMap.get(extendedItem.combo_group_id) || [];
        existing.push({
          id: item.id,
          cart_id: '', // Not needed for display
          variant_id: item.variantId || item.id,
          quantity: item.quantity,
          price_snapshot: item.price * 100, // Convert to cents
          combo_id: extendedItem.combo_id || null,
          combo_group_id: extendedItem.combo_group_id,
          product: {
            id: item.id,
            name: item.name,
            imageUrl: item.imageUrl,
          } as any,
          variant: item.variantData
            ? { options: item.variantData }
            : item.variant
              ? { options: { variant: item.variant } }
              : undefined,
        } as ComboCartItem);
        comboMap.set(extendedItem.combo_group_id, existing);
      } else {
        // Regular item
        regular.push(item);
      }
    });

    // Convert combo map to CartComboGroup array
    const groups: CartComboGroupType[] = [];
    comboMap.forEach((comboItems, groupId) => {
      // Get combo metadata from first item
      const firstItem = items.find(
        (i) => (i as any).combo_group_id === groupId
      ) as any;

      if (firstItem) {
        const totalPriceCents = comboItems.reduce(
          (sum, item) => sum + item.price_snapshot * item.quantity,
          0
        );

        groups.push({
          combo_group_id: groupId,
          combo_id: firstItem.combo_id || '',
          combo_name: firstItem.combo_name || 'Bundle',
          combo_price_cents: firstItem.combo_price_cents || totalPriceCents,
          combo_savings_cents: firstItem.combo_savings_cents || 0,
          items: comboItems,
          total_quantity: comboItems.reduce((sum, item) => sum + item.quantity, 0),
        });
      }
    });

    return { comboGroups: groups, regularItems: regular };
  }, [items]);

  if (items.length === 0) {
    return (
      <section
        aria-labelledby="your-products"
        className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm"
      >
        <h2
          id="your-products"
          className="mb-2 text-lg font-semibold tracking-tight text-gray-900"
        >
          Your Products
        </h2>
        <p className="text-sm text-gray-500">Your bag is empty.</p>
      </section>
    );
  }

  return (
    <section
      aria-labelledby="your-products"
      className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm"
    >
      <h2
        id="your-products"
        className="mb-3 text-lg font-semibold tracking-tight text-gray-900"
      >
        Your Products
      </h2>

      <div className="space-y-4">
        {/* Render Combo Groups */}
        {comboGroups.map((group) => (
          <CartComboGroup
            key={group.combo_group_id}
            comboGroup={group}
            onRemove={onRemoveCombo || (() => {})}
            isRemoving={isRemovingCombo === group.combo_group_id}
          />
        ))}

        {/* Render Regular Items */}
        {regularItems.length > 0 && (
          <ul className="divide-y divide-gray-100">
            {regularItems.map((it) => (
              <li key={it.id} className="flex gap-3 py-3">
                <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-lg border border-gray-200 bg-gray-50">
                  {it.imageUrl ? (
                    <Image
                      src={it.imageUrl}
                      alt={it.name}
                      fill
                      className="object-cover"
                      sizes="80px"
                    />
                  ) : (
                    <div className="flex size-full items-center justify-center text-xs text-gray-400">
                      <Package className="w-6 h-6" />
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-gray-900">
                        {it.name}
                      </div>

                      {it.variantData &&
                      Object.keys(it.variantData).filter(
                        (k) => k !== 'colorHex' && it.variantData![k]
                      ).length > 0 ? (
                        <div className="flex flex-wrap items-center gap-2 mt-1.5">
                          {/* Show color first if present */}
                          {it.variantData.color && (
                            <span
                              key={`color-${it.id}`}
                              className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs bg-gray-100 text-gray-700 border border-gray-200"
                            >
                              <span
                                className="w-3 h-3 rounded-full border border-gray-300 shadow-sm"
                                style={{
                                  backgroundColor:
                                    it.variantData.colorHex || '#666',
                                }}
                              />
                              {it.variantData.color}
                            </span>
                          )}
                          {/* Show all other attributes */}
                          {Object.entries(it.variantData)
                            .filter(
                              ([key, value]) =>
                                key !== 'color' && key !== 'colorHex' && value
                            )
                            .map(([key, value]) => (
                              <span
                                key={`${key}-${it.id}`}
                                className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-gray-100 text-gray-700 font-medium border border-gray-200"
                              >
                                {value}
                              </span>
                            ))}
                        </div>
                      ) : it.variant ? (
                        <div className="text-xs text-gray-500 mt-1">
                          {it.variant}
                        </div>
                      ) : null}
                    </div>
                    <div className="text-sm font-medium text-gray-900 whitespace-nowrap">
                      {formatNPR(it.price)}
                    </div>
                  </div>
                  <div className="mt-2 flex items-center gap-3">
                    <div className="inline-flex items-center rounded-lg border border-gray-300">
                      <button
                        type="button"
                        aria-label="Decrease quantity"
                        data-testid={`dec-${it.id}`}
                        className="h-8 w-8 text-gray-600 hover:bg-gray-50 disabled:opacity-50 rounded-l-lg"
                        onClick={() =>
                          onQtyChange(
                            it.id,
                            Math.max(1, it.quantity - 1),
                            it.variant
                          )
                        }
                        disabled={it.quantity <= 1}
                      >
                        −
                      </button>
                      <input
                        aria-label="Quantity"
                        data-testid={`qty-${it.id}`}
                        type="number"
                        min={1}
                        value={it.quantity}
                        onChange={(e) =>
                          onQtyChange(
                            it.id,
                            Math.max(1, Number(e.target.value)),
                            it.variant
                          )
                        }
                        className="h-8 w-14 bg-transparent text-center text-sm text-gray-900 border-x border-gray-300"
                      />
                      <button
                        type="button"
                        aria-label="Increase quantity"
                        data-testid={`inc-${it.id}`}
                        className="h-8 w-8 text-gray-600 hover:bg-gray-50 rounded-r-lg"
                        onClick={() =>
                          onQtyChange(it.id, it.quantity + 1, it.variant)
                        }
                      >
                        +
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={() => onRemove(it.id, it.variant)}
                      aria-label={`Remove ${it.name}`}
                      className={cn(
                        'inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-red-600 border border-gray-200 hover:bg-red-50 hover:border-red-200'
                      )}
                    >
                      <Trash2 className="h-4 w-4" /> Remove
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
