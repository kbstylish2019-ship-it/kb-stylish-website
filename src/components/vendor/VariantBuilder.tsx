'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Trash2, AlertCircle, Check, Loader2, Grid, DollarSign } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';

interface ProductAttribute {
  id: string;
  name: string;
  display_name: string;
  attribute_type: string;
  is_variant_defining: boolean;
}

interface AttributeValue {
  id: string;
  attribute_id: string;
  value: string;
  display_value: string;
  color_hex?: string;
}

interface VariantForBackend {
  sku: string;
  price: number;
  compare_at_price?: number;
  cost_price?: number;
  quantity: number;
  attribute_value_ids: string[];
}

interface VariantBuilderProps {
  productName?: string;
  onChange: (variants: VariantForBackend[]) => void;
}

export default function VariantBuilder({ productName = 'Product', onChange }: VariantBuilderProps) {
  const [attributes, setAttributes] = useState<ProductAttribute[]>([]);
  const [attributeValues, setAttributeValues] = useState<Record<string, AttributeValue[]>>({});
  const [selectedAttributes, setSelectedAttributes] = useState<Record<string, string[]>>({});
  const [variants, setVariants] = useState<VariantForBackend[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const supabase = createClient();
  
  // Fetch attributes and values from database
  useEffect(() => {
    const fetchAttributes = async () => {
      try {
        setIsLoading(true);
        
        // Fetch variant-defining attributes
        const { data: attrsData, error: attrsError } = await supabase
          .from('product_attributes')
          .select('*')
          .eq('is_variant_defining', true)
          .eq('is_active', true)
          .order('sort_order');
        
        if (attrsError) throw attrsError;
        
        setAttributes(attrsData || []);
        
        // Fetch all attribute values
        const { data: valuesData, error: valuesError } = await supabase
          .from('attribute_values')
          .select('*')
          .eq('is_active', true)
          .order('sort_order');
        
        if (valuesError) throw valuesError;
        
        // Group values by attribute_id
        const groupedValues: Record<string, AttributeValue[]> = {};
        (valuesData || []).forEach(value => {
          if (!groupedValues[value.attribute_id]) {
            groupedValues[value.attribute_id] = [];
          }
          groupedValues[value.attribute_id].push(value);
        });
        
        setAttributeValues(groupedValues);
      } catch (err: any) {
        console.error('Failed to fetch attributes:', err);
        setError(err.message || 'Failed to load attributes');
      } finally {
        setIsLoading(false);
      }
    };
    
    fetchAttributes();
  }, [supabase]);
  
  // Generate variants when selected attributes change
  useEffect(() => {
    const generated = generateVariants();
    setVariants(generated);
  }, [selectedAttributes, productName]);
  
  // Notify parent when variants change
  useEffect(() => {
    onChange(variants);
  }, [variants, onChange]);
  
  // Generate variant combinations
  const generateVariants = useCallback((): VariantForBackend[] => {
    const selectedAttrIds = Object.keys(selectedAttributes).filter(
      attrId => selectedAttributes[attrId].length > 0
    );
    
    if (selectedAttrIds.length === 0) {
      // No attributes selected, return single default variant
      return [{
        sku: generateSKU(productName, []),
        price: 0,
        quantity: 0,
        attribute_value_ids: [],
      }];
    }
    
    // Generate cartesian product of all selected attribute values
    const combinations = cartesianProduct(
      selectedAttrIds.map(attrId => 
        selectedAttributes[attrId].map(valueId => ({ attrId, valueId }))
      )
    );
    
    return combinations.map((combo, index) => {
      const attrValueIds = combo.map(c => c.valueId);
      const variantName = combo.map(c => {
        const value = attributeValues[c.attrId]?.find(v => v.id === c.valueId);
        return value?.display_value || value?.value || '';
      }).join(' / ');
      
      // Check if this variant already exists (preserve user edits)
      const existing = variants.find(v => 
        v.attribute_value_ids.length === attrValueIds.length &&
        v.attribute_value_ids.every(id => attrValueIds.includes(id))
      );
      
      if (existing) {
        return existing; // Preserve user edits
      }
      
      return {
        sku: generateSKU(productName, combo.map(c => {
          const value = attributeValues[c.attrId]?.find(v => v.id === c.valueId);
          return value?.value || '';
        })),
        price: 0,
        quantity: 0,
        attribute_value_ids: attrValueIds,
      };
    });
  }, [selectedAttributes, attributeValues, variants, productName]);
  
  // Generate SKU from product name and attribute values
  const generateSKU = (prodName: string, values: string[]): string => {
    const sanitized = prodName
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '')
      .substring(0, 10);
    
    const valueSuffix = values
      .map(v => v.toUpperCase().replace(/[^A-Z0-9]/g, '').substring(0, 3))
      .join('-');
    
    return valueSuffix ? `${sanitized}-${valueSuffix}` : sanitized || 'PRODUCT';
  };
  
  // Cartesian product helper
  const cartesianProduct = <T,>(arrays: T[][]): T[][] => {
    if (arrays.length === 0) return [[]];
    if (arrays.length === 1) return arrays[0].map(item => [item]);
    
    const [first, ...rest] = arrays;
    const restProduct = cartesianProduct(rest);
    
    return first.flatMap(item =>
      restProduct.map(combo => [item, ...combo])
    );
  };
  
  // Toggle attribute value selection
  const toggleAttributeValue = (attrId: string, valueId: string) => {
    setSelectedAttributes(prev => {
      const current = prev[attrId] || [];
      const isSelected = current.includes(valueId);
      
      return {
        ...prev,
        [attrId]: isSelected
          ? current.filter(id => id !== valueId)
          : [...current, valueId],
      };
    });
  };
  
  // Update variant field
  const updateVariant = (index: number, field: keyof VariantForBackend, value: any) => {
    setVariants(prev => prev.map((v, i) => 
      i === index ? { ...v, [field]: value } : v
    ));
  };
  
  // Bulk operations
  const setAllPrices = (price: number) => {
    setVariants(prev => prev.map(v => ({ ...v, price })));
  };
  
  const setAllInventory = (quantity: number) => {
    setVariants(prev => prev.map(v => ({ ...v, quantity })));
  };
  
  const autoGenerateSKUs = () => {
    setVariants(prev => prev.map((v, index) => {
      const attrValues = v.attribute_value_ids.map(valueId => {
        for (const attrId in attributeValues) {
          const value = attributeValues[attrId].find(av => av.id === valueId);
          if (value) return value.value;
        }
        return '';
      }).filter(Boolean);
      
      return {
        ...v,
        sku: generateSKU(productName, attrValues),
      };
    }));
  };
  
  // Get variant display name
  const getVariantName = (variant: VariantForBackend): string => {
    if (variant.attribute_value_ids.length === 0) return 'Default Variant';
    
    return variant.attribute_value_ids.map(valueId => {
      for (const attrId in attributeValues) {
        const value = attributeValues[attrId].find(v => v.id === valueId);
        if (value) return value.display_value;
      }
      return '';
    }).filter(Boolean).join(' / ');
  };
  
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-foreground/40" />
        <span className="ml-3 text-foreground/60">Loading attributes...</span>
      </div>
    );
  }
  
  if (error) {
    return (
      <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-4 flex items-start gap-3">
        <AlertCircle className="h-5 w-5 text-red-400 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-medium text-red-400">Failed to load attributes</p>
          <p className="text-xs text-red-400/80 mt-1">{error}</p>
        </div>
      </div>
    );
  }
  
  return (
    <div className="space-y-6">
      {/* Step 1: Select Attributes */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Grid className="h-5 w-5 text-foreground/60" />
          <h3 className="text-lg font-semibold text-foreground">Select Product Attributes</h3>
        </div>
        
        <div className="rounded-xl border border-blue-500/20 bg-blue-500/10 p-3">
          <p className="text-xs text-blue-300">
            <strong>💡 How it works:</strong> Selecting attributes creates all possible combinations. 
            E.g., 2 colors × 3 sizes = 6 variants. Set inventory to 0 for combinations you don&apos;t offer 
            (like Black/XS if unavailable).
          </p>
        </div>
        
        {attributes.length === 0 ? (
          <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-4">
            <p className="text-sm text-amber-400">
              No variant attributes configured. Products will have a single default variant.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {attributes.map(attr => (
              <AttributeSelector
                key={attr.id}
                attribute={attr}
                values={attributeValues[attr.id] || []}
                selectedValues={selectedAttributes[attr.id] || []}
                onToggle={(valueId) => toggleAttributeValue(attr.id, valueId)}
              />
            ))}
          </div>
        )}
      </div>
      
      {/* Step 2: Edit Variants */}
      {variants.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <DollarSign className="h-5 w-5 text-foreground/60" />
              <h3 className="text-lg font-semibold text-foreground">
                Variant Details ({variants.length} variant{variants.length !== 1 ? 's' : ''})
              </h3>
            </div>
            
            {variants.length > 1 && (
              <BulkActionsMenu
                onSetAllPrices={setAllPrices}
                onSetAllInventory={setAllInventory}
                onAutoGenerateSKUs={autoGenerateSKUs}
              />
            )}
          </div>
          
          <VariantTable
            variants={variants}
            getVariantName={getVariantName}
            onUpdate={updateVariant}
          />
        </div>
      )}
      
      {/* Validation */}
      {variants.length === 0 && (
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-3 flex items-center gap-3">
          <AlertCircle className="h-4 w-4 text-amber-400" />
          <span className="text-sm text-amber-400">Please configure at least one variant</span>
        </div>
      )}
    </div>
  );
}

// Attribute Selector Component
interface AttributeSelectorProps {
  attribute: ProductAttribute;
  values: AttributeValue[];
  selectedValues: string[];
  onToggle: (valueId: string) => void;
}

function AttributeSelector({ attribute, values, selectedValues, onToggle }: AttributeSelectorProps) {
  const isColor = attribute.attribute_type === 'color';
  
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-4">
      <div className="flex items-center justify-between mb-3">
        <label className="text-sm font-medium text-foreground">
          {attribute.display_name}
        </label>
        <span className="text-xs text-foreground/60">
          {selectedValues.length} selected
        </span>
      </div>
      
      <div className={cn(
        "flex flex-wrap gap-2",
        isColor ? "gap-3" : "gap-2"
      )}>
        {values.map(value => (
          <button
            key={value.id}
            onClick={() => onToggle(value.id)}
            className={cn(
              "transition-all rounded-lg",
              isColor
                ? "w-10 h-10 border-2"
                : "px-3 py-1.5 text-sm border",
              selectedValues.includes(value.id)
                ? isColor
                  ? "border-[var(--kb-primary-brand)] ring-2 ring-[var(--kb-primary-brand)]/30"
                  : "border-[var(--kb-primary-brand)] bg-[var(--kb-primary-brand)]/20 text-foreground font-medium"
                : isColor
                  ? "border-white/20 hover:border-white/40"
                  : "border-white/20 bg-white/5 text-foreground/80 hover:border-white/40"
            )}
            style={isColor && value.color_hex ? { backgroundColor: value.color_hex } : undefined}
            title={value.display_value}
          >
            {!isColor && value.display_value}
          </button>
        ))}
      </div>
    </div>
  );
}

// Variant Table Component
interface VariantTableProps {
  variants: VariantForBackend[];
  getVariantName: (variant: VariantForBackend) => string;
  onUpdate: (index: number, field: keyof VariantForBackend, value: any) => void;
}

function VariantTable({ variants, getVariantName, onUpdate }: VariantTableProps) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-white/5 border-b border-white/10">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-foreground/60 uppercase">
                Variant
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-foreground/60 uppercase">
                SKU *
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-foreground/60 uppercase">
                Price (NPR) *
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-foreground/60 uppercase">
                Compare At
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-foreground/60 uppercase">
                Inventory *
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/10">
            {variants.map((variant, index) => (
              <tr key={index} className="hover:bg-white/5 transition-colors">
                <td className="px-4 py-3 text-sm text-foreground font-medium">
                  {getVariantName(variant)}
                </td>
                <td className="px-4 py-3">
                  <input
                    type="text"
                    value={variant.sku}
                    onChange={(e) => onUpdate(index, 'sku', e.target.value)}
                    className="w-full bg-white/10 border border-white/20 rounded px-2 py-1.5 text-sm text-foreground focus:outline-none focus:border-[var(--kb-primary-brand)]"
                    placeholder="SKU-001"
                  />
                </td>
                <td className="px-4 py-3">
                  <input
                    type="number"
                    value={variant.price || ''}
                    onChange={(e) => onUpdate(index, 'price', parseFloat(e.target.value) || 0)}
                    className="w-full bg-white/10 border border-white/20 rounded px-2 py-1.5 text-sm text-foreground focus:outline-none focus:border-[var(--kb-primary-brand)]"
                    placeholder="0"
                    min="0"
                    step="0.01"
                  />
                </td>
                <td className="px-4 py-3">
                  <input
                    type="number"
                    value={variant.compare_at_price || ''}
                    onChange={(e) => onUpdate(index, 'compare_at_price', parseFloat(e.target.value) || undefined)}
                    className="w-full bg-white/10 border border-white/20 rounded px-2 py-1.5 text-sm text-foreground focus:outline-none focus:border-[var(--kb-primary-brand)]"
                    placeholder="0"
                    min="0"
                    step="0.01"
                  />
                </td>
                <td className="px-4 py-3">
                  <input
                    type="number"
                    value={variant.quantity || ''}
                    onChange={(e) => onUpdate(index, 'quantity', parseInt(e.target.value) || 0)}
                    className="w-full bg-white/10 border border-white/20 rounded px-2 py-1.5 text-sm text-foreground focus:outline-none focus:border-[var(--kb-primary-brand)]"
                    placeholder="0"
                    min="0"
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Bulk Actions Menu Component
interface BulkActionsMenuProps {
  onSetAllPrices: (price: number) => void;
  onSetAllInventory: (quantity: number) => void;
  onAutoGenerateSKUs: () => void;
}

function BulkActionsMenu({ onSetAllPrices, onSetAllInventory, onAutoGenerateSKUs }: BulkActionsMenuProps) {
  const [showMenu, setShowMenu] = useState(false);
  const [bulkPrice, setBulkPrice] = useState('');
  const [bulkInventory, setBulkInventory] = useState('');
  
  return (
    <div className="relative">
      <button
        onClick={() => setShowMenu(!showMenu)}
        className="px-3 py-1.5 text-sm border border-white/20 rounded-lg bg-white/5 hover:bg-white/10 text-foreground transition-colors"
      >
        Bulk Actions
      </button>
      
      {showMenu && (
        <>
          <div
            className="fixed inset-0 z-10"
            onClick={() => setShowMenu(false)}
          />
          <div className="absolute right-0 mt-2 w-72 rounded-xl border border-white/10 bg-[#1a1a1a] shadow-xl z-20 overflow-hidden backdrop-blur-xl">
            <div className="p-4 space-y-4">
              <div>
                <label className="text-xs font-medium text-foreground/60 mb-1.5 block">
                  Set All Prices (NPR)
                </label>
                <div className="flex gap-2">
                  <input
                    type="number"
                    value={bulkPrice}
                    onChange={(e) => setBulkPrice(e.target.value)}
                    className="flex-1 bg-white/10 border border-white/20 rounded px-2 py-1.5 text-sm text-foreground focus:outline-none focus:border-[var(--kb-primary-brand)]"
                    placeholder="2999"
                    min="0"
                  />
                  <button
                    onClick={() => {
                      if (bulkPrice) {
                        onSetAllPrices(parseFloat(bulkPrice));
                        setBulkPrice('');
                        setShowMenu(false);
                      }
                    }}
                    className="px-3 py-1.5 bg-[var(--kb-primary-brand)] text-white rounded text-sm font-medium hover:opacity-90"
                  >
                    Apply
                  </button>
                </div>
              </div>
              
              <div>
                <label className="text-xs font-medium text-foreground/60 mb-1.5 block">
                  Set All Inventory
                </label>
                <div className="flex gap-2">
                  <input
                    type="number"
                    value={bulkInventory}
                    onChange={(e) => setBulkInventory(e.target.value)}
                    className="flex-1 bg-white/10 border border-white/20 rounded px-2 py-1.5 text-sm text-foreground focus:outline-none focus:border-[var(--kb-primary-brand)]"
                    placeholder="100"
                    min="0"
                  />
                  <button
                    onClick={() => {
                      if (bulkInventory) {
                        onSetAllInventory(parseInt(bulkInventory));
                        setBulkInventory('');
                        setShowMenu(false);
                      }
                    }}
                    className="px-3 py-1.5 bg-[var(--kb-primary-brand)] text-white rounded text-sm font-medium hover:opacity-90"
                  >
                    Apply
                  </button>
                </div>
              </div>
              
              <div className="pt-2 border-t border-white/10">
                <button
                  onClick={() => {
                    onAutoGenerateSKUs();
                    setShowMenu(false);
                  }}
                  className="w-full px-3 py-2 bg-white/5 hover:bg-white/10 text-foreground rounded text-sm font-medium transition-colors"
                >
                  Auto-Generate SKUs
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
