'use client';

import React, { useState } from 'react';
import Image from 'next/image';
import { Trash2, Package, AlertTriangle } from 'lucide-react';
import { COMBO_CONFIG } from '@/lib/constants/combo';
import type { CartComboGroup as CartComboGroupType } from '@/types/combo';
import { formatNPR, cn } from '@/lib/utils';

interface CartComboGroupProps {
  comboGroup: CartComboGroupType;
  onRemove: (comboGroupId: string) => void;
  isRemoving?: boolean;
}

export default function CartComboGroup({ 
  comboGroup, 
  onRemove,
  isRemoving = false 
}: CartComboGroupProps) {
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);

  const handleRemoveClick = () => {
    setShowConfirmDialog(true);
  };

  const handleConfirmRemove = () => {
    onRemove(comboGroup.combo_group_id);
    setShowConfirmDialog(false);
  };

  const handleCancelRemove = () => {
    setShowConfirmDialog(false);
  };

  // Calculate savings percentage
  const originalPrice = comboGroup.combo_price_cents + comboGroup.combo_savings_cents;
  const savingsPercentage = Math.round((comboGroup.combo_savings_cents / originalPrice) * 100);

  return (
    <div 
      className="relative rounded-xl border-2 border-purple-200 bg-gradient-to-r from-purple-50 to-indigo-50 p-4 shadow-sm"
      role="group"
      aria-label={`${COMBO_CONFIG.A11Y.COMBO_BADGE}: ${comboGroup.combo_name}, contains ${comboGroup.items.length} items`}
    >
      {/* Combo Header */}
      <div className="flex items-center justify-between mb-3 pb-3 border-b border-purple-200">
        <div className="flex items-center gap-2">
          <div className="flex items-center justify-center w-8 h-8 bg-gradient-to-r from-purple-600 to-indigo-600 rounded-lg">
            <Package className="w-4 h-4 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-purple-600 bg-purple-100 px-2 py-0.5 rounded">
                {COMBO_CONFIG.LABELS.BADGE}
              </span>
              <h3 className="font-semibold text-gray-900">{comboGroup.combo_name}</h3>
            </div>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-sm text-gray-500 line-through">
                {formatNPR(originalPrice / 100)}
              </span>
              <span className="text-sm font-semibold text-purple-600">
                {formatNPR(comboGroup.combo_price_cents / 100)}
              </span>
              <span className="text-xs font-semibold text-green-600 bg-green-50 px-1.5 py-0.5 rounded">
                {COMBO_CONFIG.LABELS.SAVINGS_PREFIX} {savingsPercentage}%
              </span>
            </div>
          </div>
        </div>
        
        {/* Remove Button */}
        <button
          type="button"
          onClick={handleRemoveClick}
          disabled={isRemoving}
          aria-label={COMBO_CONFIG.A11Y.REMOVE_BUTTON}
          className={cn(
            "inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium",
            "text-red-600 border border-red-200 bg-white",
            "hover:bg-red-50 hover:border-red-300",
            "disabled:opacity-50 disabled:cursor-not-allowed",
            "transition-colors"
          )}
        >
          <Trash2 className="h-4 w-4" />
          {COMBO_CONFIG.LABELS.REMOVE_COMBO}
        </button>
      </div>

      {/* Combo Items */}
      <ul className="space-y-2">
        {comboGroup.items.map((item, index) => (
          <li 
            key={item.id || `combo-item-${index}`}
            className="flex items-center gap-3 p-2 bg-white/60 rounded-lg"
          >
            {/* Item Image */}
            <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-md border border-gray-200 bg-gray-50">
              {item.product?.imageUrl ? (
                <Image
                  src={item.product.imageUrl}
                  alt={item.product?.name || 'Product'}
                  fill
                  className="object-cover"
                  sizes="48px"
                />
              ) : (
                <div className="flex size-full items-center justify-center text-xs text-gray-400">
                  <Package className="w-4 h-4" />
                </div>
              )}
            </div>

            {/* Item Details */}
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-gray-900 truncate">
                {item.product?.name || 'Product'}
              </div>
              {item.variant && (
                <div className="text-xs text-gray-500">
                  {item.variant.options ? Object.values(item.variant.options).join(' / ') : ''}
                </div>
              )}
            </div>

            {/* Quantity & Price */}
            <div className="text-right">
              <div className="text-xs text-gray-500">Qty: {item.quantity}</div>
              <div className="text-sm font-medium text-gray-700">
                {formatNPR(item.price_snapshot / 100)}
              </div>
            </div>
          </li>
        ))}
      </ul>

      {/* Total */}
      <div className="mt-3 pt-3 border-t border-purple-200 flex justify-between items-center">
        <span className="text-sm text-gray-600">Bundle Total</span>
        <span className="text-lg font-bold text-purple-600">
          {formatNPR(comboGroup.combo_price_cents / 100)}
        </span>
      </div>

      {/* Confirmation Dialog */}
      {showConfirmDialog && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="remove-combo-title"
        >
          <div className="bg-white rounded-xl p-6 max-w-sm mx-4 shadow-2xl animate-in fade-in zoom-in duration-200">
            <div className="flex items-center gap-3 mb-4">
              <div className="flex items-center justify-center w-10 h-10 bg-red-100 rounded-full">
                <AlertTriangle className="w-5 h-5 text-red-600" />
              </div>
              <h3 id="remove-combo-title" className="text-lg font-semibold text-gray-900">
                {COMBO_CONFIG.LABELS.REMOVE_CONFIRM_TITLE}
              </h3>
            </div>
            <p className="text-sm text-gray-600 mb-6">
              {COMBO_CONFIG.LABELS.REMOVE_CONFIRM_MESSAGE}
            </p>
            <div className="flex gap-3 justify-end">
              <button
                type="button"
                onClick={handleCancelRemove}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmRemove}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors"
              >
                Remove Bundle
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
