'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  Package,
  Save,
  AlertTriangle,
  DollarSign,
  Hash,
  FileText,
} from 'lucide-react';
import { updateComboProduct } from '@/app/actions/combo';
import { formatNPR, cn } from '@/lib/utils';

interface ComboItem {
  id: string;
  constituent_product_id: string;
  constituent_variant_id: string;
  quantity: number;
  display_order: number;
  products: {
    id: string;
    name: string;
    slug: string;
  };
  product_variants: {
    id: string;
    sku: string;
    price: number;
    variant_attribute_values?: Array<{
      attribute_value_id: string;
      attribute_values: {
        value: string;
        display_value: string;
        product_attributes: {
          name: string;
        };
      };
    }>;
  };
}

interface Combo {
  id: string;
  name: string;
  slug: string;
  description: string;
  is_active: boolean;
  is_combo: boolean;
  combo_price_cents: number;
  combo_savings_cents: number;
  combo_quantity_limit: number | null;
  combo_quantity_sold: number;
  created_at: string;
  combo_items: ComboItem[];
}

interface ComboEditFormProps {
  combo: Combo;
  vendorId: string;
}

export default function ComboEditForm({ combo, vendorId }: ComboEditFormProps) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Form state
  const [formData, setFormData] = useState({
    name: combo.name,
    description: combo.description || '',
    combo_price_cents: combo.combo_price_cents,
    combo_quantity_limit: combo.combo_quantity_limit,
  });

  // Calculate original price from constituents
  const originalPriceCents = combo.combo_items.reduce(
    (sum, item) => sum + (item.product_variants.price * 100) * item.quantity,
    0
  );

  const savingsAmount = originalPriceCents - formData.combo_price_cents;
  const savingsPercentage = originalPriceCents > 0 
    ? Math.round((savingsAmount / originalPriceCents) * 100)
    : 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);
    setSuccess(null);

    try {
      // Validate combo price is less than original
      if (formData.combo_price_cents >= originalPriceCents) {
        setError('Combo price must be less than the total of individual prices');
        return;
      }

      // Validate quantity limit
      if (formData.combo_quantity_limit !== null && formData.combo_quantity_limit < combo.combo_quantity_sold) {
        setError(`Quantity limit cannot be less than already sold quantity (${combo.combo_quantity_sold})`);
        return;
      }

      const result = await updateComboProduct(combo.id, {
        name: formData.name,
        description: formData.description,
        combo_price_cents: formData.combo_price_cents,
        combo_quantity_limit: formData.combo_quantity_limit,
      });

      if (result.success) {
        setSuccess('Combo updated successfully!');
        setTimeout(() => {
          router.push('/vendor/combos');
        }, 1500);
      } else {
        setError(result.message || 'Failed to update combo');
      }
    } catch (err: any) {
      setError(err.message || 'An unexpected error occurred');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleInputChange = (field: string, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    setError(null);
    setSuccess(null);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link
          href="/vendor/combos"
          className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Edit Combo</h1>
          <p className="text-sm text-gray-500 mt-1">
            Update combo details. Note: You cannot modify constituent products.
          </p>
        </div>
      </div>

      {/* Alert Messages */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-center gap-3">
          <AlertTriangle className="h-5 w-5 text-red-500 flex-shrink-0" />
          <p className="text-red-700">{error}</p>
        </div>
      )}

      {success && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-center gap-3">
          <Package className="h-5 w-5 text-green-500 flex-shrink-0" />
          <p className="text-green-700">{success}</p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Form */}
        <div className="lg:col-span-2">
          <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-gray-200 p-6 space-y-6">
            {/* Basic Info */}
            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-gray-900">Basic Information</h2>
              
              <div>
                <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-2">
                  Combo Name
                </label>
                <input
                  type="text"
                  id="name"
                  value={formData.name}
                  onChange={(e) => handleInputChange('name', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  required
                />
              </div>

              <div>
                <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-2">
                  Description
                </label>
                <textarea
                  id="description"
                  rows={3}
                  value={formData.description}
                  onChange={(e) => handleInputChange('description', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  placeholder="Describe what's included in this combo..."
                />
              </div>
            </div>

            {/* Pricing */}
            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-gray-900">Pricing</h2>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="combo_price" className="block text-sm font-medium text-gray-700 mb-2">
                    Combo Price (NPR)
                  </label>
                  <div className="relative">
                    <DollarSign className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <input
                      type="number"
                      id="combo_price"
                      value={formData.combo_price_cents / 100}
                      onChange={(e) => handleInputChange('combo_price_cents', Math.round(parseFloat(e.target.value || '0') * 100))}
                      className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                      min="1"
                      step="0.01"
                      required
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="quantity_limit" className="block text-sm font-medium text-gray-700 mb-2">
                    Quantity Limit (Optional)
                  </label>
                  <div className="relative">
                    <Hash className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <input
                      type="number"
                      id="quantity_limit"
                      value={formData.combo_quantity_limit || ''}
                      onChange={(e) => handleInputChange('combo_quantity_limit', e.target.value ? parseInt(e.target.value) : null)}
                      className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                      min={combo.combo_quantity_sold}
                      placeholder="Unlimited"
                    />
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    Already sold: {combo.combo_quantity_sold}
                  </p>
                </div>
              </div>

              {/* Savings Display */}
              <div className="bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-green-800">Customer Savings</p>
                    <p className="text-2xl font-bold text-green-600">
                      {formatNPR(savingsAmount / 100)} ({savingsPercentage}%)
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-green-600">Original: {formatNPR(originalPriceCents / 100)}</p>
                    <p className="text-sm text-green-600">Combo: {formatNPR(formData.combo_price_cents / 100)}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Submit Button */}
            <div className="flex justify-end gap-3 pt-4 border-t">
              <Link
                href="/vendor/combos"
                className="px-4 py-2 text-gray-600 hover:text-gray-800 transition-colors"
              >
                Cancel
              </Link>
              <button
                type="submit"
                disabled={isSubmitting || savingsAmount <= 0}
                className={cn(
                  'inline-flex items-center gap-2 px-6 py-2 rounded-lg font-medium transition-colors',
                  isSubmitting || savingsAmount <= 0
                    ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                    : 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white hover:from-purple-700 hover:to-indigo-700'
                )}
              >
                <Save className="h-4 w-4" />
                {isSubmitting ? 'Updating...' : 'Update Combo'}
              </button>
            </div>
          </form>
        </div>

        {/* Sidebar - Constituent Products */}
        <div className="space-y-6">
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <Package className="h-5 w-5 text-purple-500" />
              Included Products ({combo.combo_items.length})
            </h2>
            
            <div className="space-y-3">
              {combo.combo_items
                .sort((a, b) => a.display_order - b.display_order)
                .map((item) => (
                  <div key={item.id} className="p-3 bg-gray-50 rounded-lg border border-gray-100">
                    <div className="flex justify-between items-start">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-gray-900 text-sm truncate">
                          {item.products.name}
                        </p>
                        <p className="text-xs text-gray-500">
                          SKU: {item.product_variants.sku}
                        </p>
                        {item.product_variants.variant_attribute_values && item.product_variants.variant_attribute_values.length > 0 && (
                          <p className="text-xs text-gray-500">
                            {item.product_variants.variant_attribute_values
                              .map(vav => `${vav.attribute_values.product_attributes.name}: ${vav.attribute_values.display_value || vav.attribute_values.value}`)
                              .join(', ')}
                          </p>
                        )}
                      </div>
                      <div className="text-right ml-2">
                        <p className="text-sm font-medium text-gray-900">
                          {formatNPR(item.product_variants.price)}
                        </p>
                        {item.quantity > 1 && (
                          <p className="text-xs text-purple-600">
                            Qty: {item.quantity}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
            </div>

            <div className="mt-4 pt-4 border-t border-gray-200">
              <div className="flex justify-between items-center">
                <span className="font-medium text-gray-900">Total Original Price:</span>
                <span className="font-bold text-gray-900">{formatNPR(originalPriceCents / 100)}</span>
              </div>
            </div>

            <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-500 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-amber-800">Note</p>
                  <p className="text-xs text-amber-700">
                    To modify constituent products, create a new combo instead.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}