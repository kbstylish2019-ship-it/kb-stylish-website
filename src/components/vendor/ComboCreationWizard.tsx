'use client';

import React, { useState, useMemo } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import {
  Package,
  ChevronRight,
  ChevronLeft,
  Check,
  Plus,
  Minus,
  Sparkles,
  AlertCircle,
} from 'lucide-react';
import { COMBO_CONFIG } from '@/lib/constants/combo';
import { createComboProduct } from '@/app/actions/combo';
import { formatNPR, cn } from '@/lib/utils';

interface VariantAttributeValue {
  attribute_value_id: string;
  attribute_values: {
    value: string;
    display_value: string;
    attributes: {
      name: string;
    };
  };
}

interface ProductVariant {
  id: string;
  sku: string;
  price: number | string;
  variant_attribute_values?: VariantAttributeValue[];
}

interface ProductImage {
  image_url: string;
  sort_order: number;
}

interface Product {
  id: string;
  name: string;
  slug: string;
  is_active: boolean;
  is_combo: boolean;
  product_variants: ProductVariant[];
  product_images: ProductImage[];
}

interface SelectedItem {
  variant_id: string;
  product_id: string;
  product_name: string;
  variant_name: string;
  price: number;
  quantity: number;
  image_url?: string;
}

interface ComboCreationWizardProps {
  products: Product[];
  vendorId: string;
}

const STEPS = [
  { id: 1, name: 'Select Products', description: 'Choose products for your combo' },
  { id: 2, name: 'Set Pricing', description: 'Set combo price and quantity' },
  { id: 3, name: 'Add Details', description: 'Name and description' },
  { id: 4, name: 'Review', description: 'Review and create' },
];

export default function ComboCreationWizard({ products, vendorId }: ComboCreationWizardProps) {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState(1);
  const [selectedItems, setSelectedItems] = useState<SelectedItem[]>([]);
  const [comboPrice, setComboPrice] = useState<number>(0);
  const [quantityLimit, setQuantityLimit] = useState<number | null>(COMBO_CONFIG.DEFAULT_QUANTITY_LIMIT);
  const [comboName, setComboName] = useState('');
  const [comboDescription, setComboDescription] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Calculate totals
  const originalTotal = useMemo(
    () => selectedItems.reduce((sum, item) => sum + item.price * item.quantity, 0),
    [selectedItems]
  );

  const savings = useMemo(() => originalTotal - comboPrice, [originalTotal, comboPrice]);
  const savingsPercentage = useMemo(
    () => (originalTotal > 0 ? Math.round((savings / originalTotal) * 100) : 0),
    [savings, originalTotal]
  );

  // Validation
  const canProceedStep1 = selectedItems.length >= COMBO_CONFIG.MIN_PRODUCTS;
  const canProceedStep2 = comboPrice > 0 && comboPrice < originalTotal;
  const canProceedStep3 = comboName.trim().length >= 3;

  const handleSelectVariant = (product: Product, variant: ProductVariant) => {
    const existingIndex = selectedItems.findIndex((i) => i.variant_id === variant.id);

    if (existingIndex >= 0) {
      // Remove if already selected
      setSelectedItems((prev) => prev.filter((i) => i.variant_id !== variant.id));
    } else {
      // Add new item
      const variantName = variant.variant_attribute_values && variant.variant_attribute_values.length > 0
        ? variant.variant_attribute_values
            .map(vav => vav.attribute_values?.display_value || vav.attribute_values?.value)
            .filter(Boolean)
            .join(' / ')
        : variant.sku;

      setSelectedItems((prev) => [
        ...prev,
        {
          variant_id: variant.id,
          product_id: product.id,
          product_name: product.name,
          variant_name: variantName,
          price: typeof variant.price === 'string' ? parseFloat(variant.price) : variant.price,
          quantity: 1,
          image_url: product.product_images?.[0]?.image_url,
        },
      ]);
    }
  };

  const handleQuantityChange = (variantId: string, delta: number) => {
    setSelectedItems((prev) =>
      prev.map((item) =>
        item.variant_id === variantId
          ? { ...item, quantity: Math.max(1, item.quantity + delta) }
          : item
      )
    );
  };

  const handleCreate = async () => {
    setIsCreating(true);
    setError(null);

    try {
      const result = await createComboProduct({
        name: comboName,
        description: comboDescription || undefined,
        combo_price_cents: Math.round(comboPrice * 100),
        quantity_limit: quantityLimit || undefined,
        constituent_items: selectedItems.map((item, index) => ({
          variant_id: item.variant_id,
          quantity: item.quantity,
          display_order: index,
        })),
      });

      if (result.success) {
        router.push('/vendor/combos');
      } else {
        setError(result.message || 'Failed to create combo');
      }
    } catch (err) {
      setError('An unexpected error occurred');
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto">
      {/* Progress Steps */}
      <nav aria-label="Progress" className="mb-8">
        <ol className="flex items-center">
          {STEPS.map((step, index) => (
            <li
              key={step.id}
              className={cn('relative', index !== STEPS.length - 1 && 'flex-1')}
            >
              <div className="flex items-center">
                <div
                  className={cn(
                    'flex h-10 w-10 items-center justify-center rounded-full border-2 transition-colors',
                    currentStep > step.id
                      ? 'border-purple-600 bg-purple-600 text-white'
                      : currentStep === step.id
                        ? 'border-purple-600 bg-white text-purple-600'
                        : 'border-gray-300 bg-white text-gray-500'
                  )}
                >
                  {currentStep > step.id ? (
                    <Check className="h-5 w-5" />
                  ) : (
                    <span className="text-sm font-medium">{step.id}</span>
                  )}
                </div>
                {index !== STEPS.length - 1 && (
                  <div
                    className={cn(
                      'ml-4 h-0.5 flex-1',
                      currentStep > step.id ? 'bg-purple-600' : 'bg-gray-200'
                    )}
                  />
                )}
              </div>
              <div className="mt-2">
                <span className="text-xs font-medium text-gray-900">{step.name}</span>
              </div>
            </li>
          ))}
        </ol>
      </nav>

      {/* Step Content */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        {/* Step 1: Select Products */}
        {currentStep === 1 && (
          <div>
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              Select Products for Your Combo
            </h2>
            <p className="text-sm text-gray-500 mb-6">
              Choose at least {COMBO_CONFIG.MIN_PRODUCTS} products to include in your combo bundle.
            </p>

            {/* Selected Items Summary */}
            {selectedItems.length > 0 && (
              <div className="mb-6 p-4 bg-purple-50 rounded-lg border border-purple-100">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-purple-700">
                    {selectedItems.length} item(s) selected
                  </span>
                  <span className="text-sm font-semibold text-purple-700">
                    Total: {formatNPR(originalTotal)}
                  </span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {selectedItems.map((item) => (
                    <span
                      key={item.variant_id}
                      className="inline-flex items-center gap-1 px-2 py-1 bg-white rounded text-xs text-gray-700 border border-purple-200"
                    >
                      {item.product_name}
                      {item.quantity > 1 && ` (x${item.quantity})`}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Product Grid */}
            {products.length === 0 ? (
              <div className="text-center py-12 bg-gray-50 rounded-lg border border-dashed border-gray-300">
                <Package className="h-12 w-12 text-gray-300 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">No products available</h3>
                <p className="text-sm text-gray-500 mb-4">
                  You need at least {COMBO_CONFIG.MIN_PRODUCTS} active products to create a combo.
                </p>
                <a
                  href="/vendor/products"
                  className="inline-flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg font-medium hover:bg-purple-700"
                >
                  <Plus className="h-4 w-4" />
                  Add Products First
                </a>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-96 overflow-y-auto">
                {products.map((product) => (
                  <div
                    key={product.id}
                    className="border border-gray-200 rounded-lg p-4 hover:border-purple-300 transition-colors"
                  >
                    <div className="flex gap-3">
                      {product.product_images?.[0] && (
                        <div className="relative h-16 w-16 shrink-0 rounded-md overflow-hidden bg-gray-100">
                          <Image
                            src={product.product_images[0].image_url}
                            alt={product.name}
                            fill
                            className="object-cover"
                            sizes="64px"
                          />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <h3 className="font-medium text-gray-900 truncate">{product.name}</h3>
                        <div className="mt-2 space-y-1">
                          {product.product_variants.map((variant) => {
                            const isSelected = selectedItems.some(
                              (i) => i.variant_id === variant.id
                            );
                            const variantName = variant.variant_attribute_values && variant.variant_attribute_values.length > 0
                              ? variant.variant_attribute_values
                                  .map(vav => vav.attribute_values?.display_value || vav.attribute_values?.value)
                                  .filter(Boolean)
                                  .join(' / ')
                              : 'Default';

                            return (
                              <button
                                key={variant.id}
                                onClick={() => handleSelectVariant(product, variant)}
                                className={cn(
                                  'w-full flex items-center justify-between px-2 py-1.5 rounded text-xs transition-colors',
                                  isSelected
                                    ? 'bg-purple-100 text-purple-700 border border-purple-300'
                                    : 'bg-gray-50 text-gray-600 hover:bg-gray-100 border border-transparent'
                                )}
                              >
                                <span>{variantName}</span>
                              <span className="font-medium">{formatNPR(typeof variant.price === 'string' ? parseFloat(variant.price) : variant.price)}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            )}
          </div>
        )}

        {/* Step 2: Set Pricing */}
        {currentStep === 2 && (
          <div>
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Set Combo Pricing</h2>

            {/* Selected Items with Quantity */}
            <div className="mb-6 space-y-3">
              {selectedItems.map((item) => (
                <div
                  key={item.variant_id}
                  className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    {item.image_url && (
                      <div className="relative h-10 w-10 rounded overflow-hidden bg-gray-200">
                        <Image
                          src={item.image_url}
                          alt={item.product_name}
                          fill
                          className="object-cover"
                          sizes="40px"
                        />
                      </div>
                    )}
                    <div>
                      <p className="text-sm font-medium text-gray-900">{item.product_name}</p>
                      <p className="text-xs text-gray-500">{item.variant_name}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleQuantityChange(item.variant_id, -1)}
                        disabled={item.quantity <= 1}
                        className="p-1 rounded hover:bg-gray-200 disabled:opacity-50"
                      >
                        <Minus className="h-4 w-4" />
                      </button>
                      <span className="w-8 text-center text-sm">{item.quantity}</span>
                      <button
                        onClick={() => handleQuantityChange(item.variant_id, 1)}
                        className="p-1 rounded hover:bg-gray-200"
                      >
                        <Plus className="h-4 w-4" />
                      </button>
                    </div>
                    <span className="text-sm font-medium text-gray-700 w-24 text-right">
                      {formatNPR(item.price * item.quantity)}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            {/* Price Input */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Combo Price (NPR)
                </label>
                <input
                  type="number"
                  value={comboPrice || ''}
                  onChange={(e) => setComboPrice(Number(e.target.value))}
                  placeholder={`Max: ${originalTotal}`}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                />
                <p className="mt-1 text-xs text-gray-500">
                  Original total: {formatNPR(originalTotal)}
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Quantity Limit (optional)
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
                <p className="mt-1 text-xs text-gray-500">
                  Limit how many combos can be sold
                </p>
              </div>
            </div>

            {/* Savings Preview */}
            {comboPrice > 0 && comboPrice < originalTotal && (
              <div className="mt-6 p-4 bg-green-50 rounded-lg border border-green-200">
                <div className="flex items-center gap-2 text-green-700">
                  <Sparkles className="h-5 w-5" />
                  <span className="font-medium">
                    Customers save {formatNPR(savings)} ({savingsPercentage}%)
                  </span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Step 3: Add Details */}
        {currentStep === 3 && (
          <div>
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Add Combo Details</h2>

            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Combo Name *
                </label>
                <input
                  type="text"
                  value={comboName}
                  onChange={(e) => setComboName(e.target.value)}
                  placeholder="e.g., Summer Essentials Bundle"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Description (optional)
                </label>
                <textarea
                  value={comboDescription}
                  onChange={(e) => setComboDescription(e.target.value)}
                  rows={4}
                  placeholder="Describe what makes this combo special..."
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                />
              </div>
            </div>
          </div>
        )}

        {/* Step 4: Review */}
        {currentStep === 4 && (
          <div>
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Review Your Combo</h2>

            <div className="space-y-6">
              {/* Combo Summary */}
              <div className="p-4 bg-gradient-to-r from-purple-50 to-indigo-50 rounded-lg border border-purple-100">
                <div className="flex items-center gap-3 mb-4">
                  <div className="p-2 bg-purple-600 rounded-lg">
                    <Package className="h-6 w-6 text-white" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900">{comboName}</h3>
                    {comboDescription && (
                      <p className="text-sm text-gray-600">{comboDescription}</p>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
                  <div>
                    <p className="text-xs text-gray-500">Items</p>
                    <p className="text-lg font-semibold text-gray-900">
                      {selectedItems.length}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Original Price</p>
                    <p className="text-lg font-semibold text-gray-400 line-through">
                      {formatNPR(originalTotal)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Combo Price</p>
                    <p className="text-lg font-semibold text-purple-600">
                      {formatNPR(comboPrice)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Savings</p>
                    <p className="text-lg font-semibold text-green-600">
                      {savingsPercentage}%
                    </p>
                  </div>
                </div>

                {quantityLimit && (
                  <div className="mt-4 pt-4 border-t border-purple-200">
                    <p className="text-sm text-purple-700">
                      Limited to {quantityLimit} combos
                    </p>
                  </div>
                )}
              </div>

              {/* Items List */}
              <div>
                <h4 className="text-sm font-medium text-gray-700 mb-3">Included Products</h4>
                <ul className="space-y-2">
                  {selectedItems.map((item) => (
                    <li
                      key={item.variant_id}
                      className="flex items-center justify-between p-2 bg-gray-50 rounded"
                    >
                      <span className="text-sm text-gray-700">
                        {item.product_name} - {item.variant_name}
                        {item.quantity > 1 && ` (x${item.quantity})`}
                      </span>
                      <span className="text-sm text-gray-500">
                        {formatNPR(item.price * item.quantity)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>

              {error && (
                <div className="p-4 bg-red-50 rounded-lg border border-red-200 flex items-center gap-2 text-red-700">
                  <AlertCircle className="h-5 w-5" />
                  <span>{error}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Navigation */}
        <div className="mt-8 flex items-center justify-between pt-6 border-t border-gray-200">
          <button
            onClick={() => setCurrentStep((s) => s - 1)}
            disabled={currentStep === 1}
            className="inline-flex items-center gap-2 px-4 py-2 text-gray-600 hover:text-gray-900 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <ChevronLeft className="h-4 w-4" />
            Back
          </button>

          {currentStep < 4 ? (
            <button
              onClick={() => setCurrentStep((s) => s + 1)}
              disabled={
                (currentStep === 1 && !canProceedStep1) ||
                (currentStep === 2 && !canProceedStep2) ||
                (currentStep === 3 && !canProceedStep3)
              }
              className="inline-flex items-center gap-2 px-6 py-2 bg-purple-600 text-white rounded-lg font-medium hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Continue
              <ChevronRight className="h-4 w-4" />
            </button>
          ) : (
            <button
              onClick={handleCreate}
              disabled={isCreating}
              className="inline-flex items-center gap-2 px-6 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-lg font-medium hover:from-purple-700 hover:to-indigo-700 disabled:opacity-50"
            >
              {isCreating ? 'Creating...' : 'Create Combo'}
              <Package className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
