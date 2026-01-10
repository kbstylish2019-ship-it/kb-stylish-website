"use client";

import React, { useState, useEffect, useCallback } from "react";
import FocusTrap from "focus-trap-react";
import { 
  X, Package, Image as ImageIcon, Grid, DollarSign, 
  Loader2, Check, AlertCircle, Plus, Minus, Trash2, Save
} from "lucide-react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { 
  updateVendorProduct, 
  updateInventoryQuantity, 
  addProductVariant,
  updateProductVariant 
} from "@/app/actions/vendor";
import { createClient } from "@/lib/supabase/client";
import type { VendorProduct, ProductVariant, ProductImage } from "@/lib/apiClient";

interface Category {
  id: string;
  name: string;
  slug: string;
}

interface EditProductModalProps {
  product: VendorProduct & { category_id?: string };
  onClose: () => void;
  onSuccess: (updatedProduct: VendorProduct) => void;
}

type Tab = "basic" | "variants" | "inventory";

const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: "basic", label: "Basic Info", icon: <Package className="h-4 w-4" /> },
  { id: "variants", label: "Variants & Pricing", icon: <DollarSign className="h-4 w-4" /> },
  { id: "inventory", label: "Inventory", icon: <Grid className="h-4 w-4" /> },
];

export default function EditProductModal({ product, onClose, onSuccess }: EditProductModalProps) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<Tab>("basic");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  
  // Basic info state
  const [name, setName] = useState(product.name);
  const [description, setDescription] = useState(product.description || "");
  const [categoryId, setCategoryId] = useState(product.category_id || "");
  const [categories, setCategories] = useState<Category[]>([]);
  const [loadingCategories, setLoadingCategories] = useState(true);
  
  // Variants state - track changes
  const [variants, setVariants] = useState<(ProductVariant & { 
    quantity?: number; 
    cost_price?: number;
    isModified?: boolean;
  })[]>([]);
  const [loadingVariants, setLoadingVariants] = useState(true);
  
  // Inventory adjustments state
  const [inventoryAdjustments, setInventoryAdjustments] = useState<Record<string, {
    change: number;
    type: 'adjustment' | 'purchase' | 'damage' | 'return';
    notes: string;
  }>>({});

  // Fetch categories
  useEffect(() => {
    const fetchCategories = async () => {
      setLoadingCategories(true);
      try {
        const supabase = createClient();
        const { data, error } = await supabase
          .from('categories')
          .select('id, name, slug')
          .eq('is_active', true)
          .order('name');
        
        if (error) throw error;
        setCategories(data || []);
        
        // Find current category ID
        if (!categoryId && product.category_slug) {
          const cat = data?.find(c => c.slug === product.category_slug);
          if (cat) setCategoryId(cat.id);
        }
      } catch (err) {
        console.error('Error fetching categories:', err);
      } finally {
        setLoadingCategories(false);
      }
    };
    
    fetchCategories();
  }, [product.category_slug, categoryId]);
  
  // Fetch full variant details including inventory
  useEffect(() => {
    const fetchVariantDetails = async () => {
      setLoadingVariants(true);
      try {
        const supabase = createClient();
        
        // First get variants
        const { data: variantsData, error: variantsError } = await supabase
          .from('product_variants')
          .select('id, sku, price, compare_at_price, cost_price, is_active')
          .eq('product_id', product.id)
          .order('created_at');
        
        if (variantsError) throw variantsError;
        
        if (!variantsData || variantsData.length === 0) {
          setVariants([]);
          return;
        }
        
        // Then get inventory for these variants
        const variantIds = variantsData.map(v => v.id);
        const { data: inventoryData, error: inventoryError } = await supabase
          .from('inventory')
          .select('variant_id, quantity_available')
          .in('variant_id', variantIds);
        
        // Create a map of variant_id -> quantity
        const inventoryMap: Record<string, number> = {};
        if (inventoryData) {
          inventoryData.forEach(inv => {
            inventoryMap[inv.variant_id] = inv.quantity_available;
          });
        }
        
        // Merge variants with inventory
        const variantsWithInventory = variantsData.map(v => ({
          ...v,
          quantity: inventoryMap[v.id] || 0
        }));
        
        setVariants(variantsWithInventory);
      } catch (err) {
        console.error('Error fetching variants:', err);
        // Fallback to product.variants
        setVariants(product.variants.map(v => ({ ...v, quantity: 0 })));
      } finally {
        setLoadingVariants(false);
      }
    };
    
    fetchVariantDetails();
  }, [product.id, product.variants]);
  
  // Handle basic info save
  const handleSaveBasicInfo = async () => {
    if (!name.trim()) {
      setError('Product name is required');
      return;
    }
    
    setIsSubmitting(true);
    setError(null);
    
    try {
      const result = await updateVendorProduct(product.id, {
        name: name.trim(),
        description: description.trim(),
        category: categoryId,
      });
      
      if (result.success) {
        setSuccessMessage('Basic info updated successfully');
        setTimeout(() => setSuccessMessage(null), 3000);
      } else {
        setError(result.message || 'Failed to update product');
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred');
    } finally {
      setIsSubmitting(false);
    }
  };
  
  // Handle variant update
  const handleUpdateVariant = async (variantId: string, updates: Partial<ProductVariant>) => {
    setIsSubmitting(true);
    setError(null);
    
    try {
      const result = await updateProductVariant(variantId, {
        sku: updates.sku,
        price: updates.price,
        compareAtPrice: updates.compare_at_price,
        isActive: updates.is_active,
      });
      
      if (result.success) {
        setVariants(prev => prev.map(v => 
          v.id === variantId ? { ...v, ...updates, isModified: false } : v
        ));
        setSuccessMessage('Variant updated');
        setTimeout(() => setSuccessMessage(null), 2000);
      } else {
        setError(result.message || 'Failed to update variant');
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred');
    } finally {
      setIsSubmitting(false);
    }
  };
  
  // Handle inventory adjustment
  const handleInventoryAdjustment = async (variantId: string) => {
    const adjustment = inventoryAdjustments[variantId];
    if (!adjustment || adjustment.change === 0) return;
    
    setIsSubmitting(true);
    setError(null);
    
    try {
      const result = await updateInventoryQuantity(
        variantId,
        adjustment.change,
        adjustment.type,
        adjustment.notes || undefined
      );
      
      if (result.success) {
        // Update local state
        setVariants(prev => prev.map(v => 
          v.id === variantId 
            ? { ...v, quantity: result.new_quantity } 
            : v
        ));
        // Clear adjustment
        setInventoryAdjustments(prev => {
          const next = { ...prev };
          delete next[variantId];
          return next;
        });
        setSuccessMessage(`Inventory updated: ${result.old_quantity} → ${result.new_quantity}`);
        setTimeout(() => setSuccessMessage(null), 3000);
      } else {
        setError(result.message || 'Failed to update inventory');
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred');
    } finally {
      setIsSubmitting(false);
    }
  };
  
  // Update local variant state
  const updateLocalVariant = (variantId: string, field: string, value: any) => {
    setVariants(prev => prev.map(v => 
      v.id === variantId ? { ...v, [field]: value, isModified: true } : v
    ));
  };
  
  // Update inventory adjustment
  const updateAdjustment = (variantId: string, field: string, value: any) => {
    setInventoryAdjustments(prev => ({
      ...prev,
      [variantId]: {
        ...prev[variantId] || { change: 0, type: 'adjustment', notes: '' },
        [field]: value,
      }
    }));
  };
  
  // Handle close with refresh
  const handleClose = () => {
    router.refresh();
    onClose();
  };

  return (
    <FocusTrap>
      <div 
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-product-title"
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
      >
        {/* Backdrop */}
        <div 
          className="absolute inset-0 bg-black/60 backdrop-blur-sm" 
          onClick={handleClose}
        />
        
        {/* Modal */}
        <div className="relative w-full max-w-3xl max-h-[90vh] flex flex-col rounded-2xl border border-gray-200 bg-white shadow-xl">
          {/* Header */}
          <div className="flex items-center justify-between p-6 pb-4 border-b border-gray-200 shrink-0">
            <div>
              <h2 id="edit-product-title" className="text-xl font-semibold text-gray-900">
                Edit Product
              </h2>
              <p className="text-sm text-gray-500 mt-1">{product.name}</p>
            </div>
            <button
              onClick={handleClose}
              className="rounded-full p-2 hover:bg-gray-100 text-gray-500"
              aria-label="Close modal"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          
          {/* Messages */}
          {error && (
            <div className="mx-6 mt-4 rounded-xl border border-red-200 bg-red-50 p-3 flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-red-500 flex-shrink-0" />
              <p className="text-sm text-red-600">{error}</p>
            </div>
          )}
          
          {successMessage && (
            <div className="mx-6 mt-4 rounded-xl border border-green-200 bg-green-50 p-3 flex items-center gap-2">
              <Check className="h-4 w-4 text-green-500 flex-shrink-0" />
              <p className="text-sm text-green-600">{successMessage}</p>
            </div>
          )}
          
          {/* Tabs */}
          <div className="px-6 pt-4 border-b border-gray-200 shrink-0">
            <div className="flex gap-1">
              {tabs.map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    "flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-t-lg transition-colors",
                    activeTab === tab.id
                      ? "bg-gray-100 text-gray-900 border-b-2 border-[#1976D2]"
                      : "text-gray-500 hover:text-gray-700 hover:bg-gray-50"
                  )}
                >
                  {tab.icon}
                  {tab.label}
                </button>
              ))}
            </div>
          </div>
          
          {/* Content */}
          <div className="flex-1 overflow-y-auto p-6">
            {/* Basic Info Tab */}
            {activeTab === "basic" && (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Product Name *
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#1976D2]"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Description
                  </label>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={4}
                    className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#1976D2]"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Category
                  </label>
                  {loadingCategories ? (
                    <div className="flex items-center gap-2 text-gray-500">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Loading categories...
                    </div>
                  ) : (
                    <select
                      value={categoryId}
                      onChange={(e) => setCategoryId(e.target.value)}
                      className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#1976D2]"
                    >
                      <option value="">Select category</option>
                      {categories.map(cat => (
                        <option key={cat.id} value={cat.id}>{cat.name}</option>
                      ))}
                    </select>
                  )}
                </div>
                
                <div className="pt-4">
                  <button
                    onClick={handleSaveBasicInfo}
                    disabled={isSubmitting}
                    className="flex items-center gap-2 px-4 py-2 bg-[#1976D2] text-white rounded-lg text-sm font-medium hover:bg-[#1565C0] disabled:opacity-50"
                  >
                    {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    Save Changes
                  </button>
                </div>
              </div>
            )}

            {/* Variants Tab */}
            {activeTab === "variants" && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-medium text-gray-700">
                    Product Variants ({variants.length})
                  </h3>
                </div>
                
                {loadingVariants ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
                  </div>
                ) : variants.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    No variants found
                  </div>
                ) : (
                  <div className="space-y-3">
                    {variants.map(variant => (
                      <div 
                        key={variant.id}
                        className={cn(
                          "rounded-xl border p-4",
                          variant.isModified 
                            ? "border-amber-300 bg-amber-50" 
                            : "border-gray-200 bg-gray-50"
                        )}
                      >
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                          <div>
                            <label className="block text-xs font-medium text-gray-500 mb-1">SKU</label>
                            <input
                              type="text"
                              value={variant.sku}
                              onChange={(e) => updateLocalVariant(variant.id, 'sku', e.target.value)}
                              className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-[#1976D2]"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-500 mb-1">Price (NPR)</label>
                            <input
                              type="number"
                              value={variant.price || ''}
                              onChange={(e) => updateLocalVariant(variant.id, 'price', parseFloat(e.target.value) || 0)}
                              className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-[#1976D2]"
                              min="0"
                              step="0.01"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-500 mb-1">Compare At</label>
                            <input
                              type="number"
                              value={variant.compare_at_price || ''}
                              onChange={(e) => updateLocalVariant(variant.id, 'compare_at_price', parseFloat(e.target.value) || undefined)}
                              className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-[#1976D2]"
                              min="0"
                              step="0.01"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-500 mb-1">Status</label>
                            <select
                              value={variant.is_active ? 'active' : 'inactive'}
                              onChange={(e) => updateLocalVariant(variant.id, 'is_active', e.target.value === 'active')}
                              className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-[#1976D2]"
                            >
                              <option value="active">Active</option>
                              <option value="inactive">Inactive</option>
                            </select>
                          </div>
                        </div>
                        
                        {variant.isModified && (
                          <div className="mt-3 flex justify-end">
                            <button
                              onClick={() => handleUpdateVariant(variant.id, variant)}
                              disabled={isSubmitting}
                              className="flex items-center gap-1.5 px-3 py-1.5 bg-[#1976D2] text-white rounded-lg text-xs font-medium hover:bg-[#1565C0] disabled:opacity-50"
                            >
                              {isSubmitting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                              Save Variant
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Inventory Tab */}
            {activeTab === "inventory" && (
              <div className="space-y-4">
                <div className="rounded-xl border border-blue-200 bg-blue-50 p-3">
                  <p className="text-xs text-blue-700">
                    <strong>💡 Tip:</strong> Use positive numbers to add stock (e.g., new purchase), 
                    negative numbers to remove stock (e.g., damage, adjustment).
                  </p>
                </div>
                
                {loadingVariants ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
                  </div>
                ) : variants.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    No variants found
                  </div>
                ) : (
                  <div className="space-y-3">
                    {variants.map(variant => {
                      const adjustment = inventoryAdjustments[variant.id] || { change: 0, type: 'adjustment', notes: '' };
                      const newQuantity = (variant.quantity || 0) + adjustment.change;
                      
                      return (
                        <div 
                          key={variant.id}
                          className="rounded-xl border border-gray-200 bg-gray-50 p-4"
                        >
                          <div className="flex items-center justify-between mb-3">
                            <div>
                              <span className="font-medium text-gray-900">{variant.sku}</span>
                              <span className={cn(
                                "ml-2 text-sm",
                                (variant.quantity || 0) > 10 ? "text-green-600" :
                                (variant.quantity || 0) > 0 ? "text-amber-600" : "text-red-600"
                              )}>
                                Current: {variant.quantity || 0} units
                              </span>
                            </div>
                            {adjustment.change !== 0 && (
                              <span className={cn(
                                "text-sm font-medium",
                                newQuantity < 0 ? "text-red-600" : "text-green-600"
                              )}>
                                → {newQuantity} units
                              </span>
                            )}
                          </div>
                          
                          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                            <div>
                              <label className="block text-xs font-medium text-gray-500 mb-1">
                                Quantity Change
                              </label>
                              <div className="flex items-center gap-1">
                                <button
                                  onClick={() => updateAdjustment(variant.id, 'change', adjustment.change - 1)}
                                  className="p-1.5 rounded-lg border border-gray-300 hover:bg-gray-100"
                                >
                                  <Minus className="h-4 w-4" />
                                </button>
                                <input
                                  type="number"
                                  value={adjustment.change}
                                  onChange={(e) => updateAdjustment(variant.id, 'change', parseInt(e.target.value) || 0)}
                                  className="w-20 text-center rounded-lg border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-[#1976D2]"
                                />
                                <button
                                  onClick={() => updateAdjustment(variant.id, 'change', adjustment.change + 1)}
                                  className="p-1.5 rounded-lg border border-gray-300 hover:bg-gray-100"
                                >
                                  <Plus className="h-4 w-4" />
                                </button>
                              </div>
                            </div>
                            
                            <div>
                              <label className="block text-xs font-medium text-gray-500 mb-1">
                                Reason
                              </label>
                              <select
                                value={adjustment.type}
                                onChange={(e) => updateAdjustment(variant.id, 'type', e.target.value)}
                                className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-[#1976D2]"
                              >
                                <option value="adjustment">Adjustment</option>
                                <option value="purchase">New Purchase</option>
                                <option value="return">Customer Return</option>
                                <option value="damage">Damage/Loss</option>
                              </select>
                            </div>
                            
                            <div>
                              <label className="block text-xs font-medium text-gray-500 mb-1">
                                Notes (optional)
                              </label>
                              <input
                                type="text"
                                value={adjustment.notes}
                                onChange={(e) => updateAdjustment(variant.id, 'notes', e.target.value)}
                                placeholder="e.g., Supplier delivery"
                                className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-[#1976D2]"
                              />
                            </div>
                            
                            <div className="flex items-end">
                              <button
                                onClick={() => handleInventoryAdjustment(variant.id)}
                                disabled={isSubmitting || adjustment.change === 0 || newQuantity < 0}
                                className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 bg-[#1976D2] text-white rounded-lg text-sm font-medium hover:bg-[#1565C0] disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                                Apply
                              </button>
                            </div>
                          </div>
                          
                          {newQuantity < 0 && (
                            <p className="mt-2 text-xs text-red-600">
                              Cannot reduce below 0. Current stock: {variant.quantity || 0}
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
          
          {/* Footer */}
          <div className="flex items-center justify-end px-6 py-4 border-t border-gray-200 shrink-0">
            <button
              onClick={handleClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </FocusTrap>
  );
}
