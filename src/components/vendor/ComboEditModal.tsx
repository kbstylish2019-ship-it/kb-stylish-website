'use client';

import React, { useState } from 'react';
import { X, Package, AlertCircle } from 'lucide-react';
import { COMBO_CONFIG } from '@/lib/constants/combo';
import { updateComboProduct } from '@/app/actions/combo';
import { formatNPR, cn } from '@/lib/utils';

interface ComboEditModalProps {
  combo: {
    id: string;
    name: string;
    description?: string;
    combo_price_cents: number;
    combo_savings_cents: number;
    combo_quantity_limit: number | null;
    combo_quantity_sold: number;
  };
  onClose: () => void;
  onSave: (updatedCombo: any) => void;
}

export default function ComboEditModal({ combo, onClose, onSave }: ComboEditModalProps) {
  const [name, setName] = useState(combo.name);
  const [description, setDescription] = useState(combo.description || '');
  const [priceCents, setPriceCents] = useState(combo.combo_price_cents);
  const [quantityLimit, setQuantityLimit] = useState<number | null>(combo.combo_quantity_limit);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const priceNPR = priceCents / 100;

  const handleSave = async () => {
    setIsSaving(true);
    setError(null);

    try {
      const result = await updateComboProduct(combo.id, {
        name: name !== combo.name ? name : undefined,
        description: description !== combo.description ? description : undefined,
        combo_price_cents: priceCents !== combo.combo_price_cents ? priceCents : undefined,
        quantity_limit: quantityLimit !== combo.combo_quantity_limit ? quantityLimit : undefined,
      });

      if (result.success) {
        onSave({
          ...combo,
          name,
          description,
          combo_price_cents: priceCents,
          combo_quantity_limit: quantityLimit,
        });
        onClose();
      } else {
        setError(result.message || 'Failed to update combo');
      }
    } catch (err) {
      setError('An unexpected error occurred');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg mx-4 animate-in fade-in zoom-in duration-200">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-100 rounded-lg">
              <Package className="h-5 w-5 text-purple-600" />
            </div>
            <h2 className="text-lg font-semibold text-gray-900">Edit Combo</h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="h-5 w-5 text-gray-500" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Combo Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
            />
          </div>

          {/* Price */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Combo Price (NPR)
            </label>
            <input
              type="number"
              value={priceNPR}
              onChange={(e) => setPriceCents(Math.round(Number(e.target.value) * 100))}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
            />
          </div>

          {/* Quantity Limit */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Quantity Limit
            </label>
            <input
              type="number"
              value={quantityLimit || ''}
              onChange={(e) =>
                setQuantityLimit(e.target.value ? Number(e.target.value) : null)
              }
              placeholder="Leave empty for unlimited"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
            />
            {combo.combo_quantity_sold > 0 && (
              <p className="mt-1 text-xs text-gray-500">
                {combo.combo_quantity_sold} already sold
              </p>
            )}
          </div>

          {/* Note about constituents */}
          <div className="p-3 bg-amber-50 rounded-lg border border-amber-200">
            <p className="text-sm text-amber-700">
              <strong>Note:</strong> To change the products in this combo, please create a new
              combo and deactivate this one.
            </p>
          </div>

          {/* Error */}
          {error && (
            <div className="p-3 bg-red-50 rounded-lg border border-red-200 flex items-center gap-2 text-red-700">
              <AlertCircle className="h-5 w-5" />
              <span className="text-sm">{error}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-4 border-t border-gray-200">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-600 hover:text-gray-900 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving || !name.trim()}
            className="px-6 py-2 bg-purple-600 text-white rounded-lg font-medium hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isSaving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}
