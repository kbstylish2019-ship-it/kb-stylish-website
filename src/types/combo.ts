/**
 * Combo Products Type Definitions
 * 
 * TypeScript interfaces for the combo products feature.
 */

import type { Product, ProductVariant } from '@/lib/types';

/**
 * Combo item - links a combo to its constituent products
 */
export interface ComboItem {
  id: string;
  combo_product_id: string;
  constituent_product_id: string;
  constituent_variant_id: string;
  quantity: number;
  display_order: number;
  created_at?: string;
  // Joined data (when fetched with relations)
  product?: Product;
  variant?: ProductVariant;
}

/**
 * Extended Product interface with combo fields
 */
export interface ComboProduct extends Omit<Product, 'price'> {
  is_combo: true;
  combo_price_cents: number;
  combo_savings_cents: number;
  combo_quantity_limit: number | null;
  combo_quantity_sold: number;
  // Constituent items (when fetched with relations)
  combo_items?: ComboItem[];
  // Computed fields for display
  original_price_cents?: number;
  savings_percentage?: number;
}

/**
 * Cart item with combo tracking
 */
export interface ComboCartItem {
  id: string;
  cart_id: string;
  variant_id: string;
  quantity: number;
  price_snapshot: number;
  combo_id: string | null;
  combo_group_id: string | null;
  created_at?: string;
  updated_at?: string;
  // Joined data
  product?: Product;
  variant?: ProductVariant;
}

/**
 * Grouped combo items in cart (for display)
 */
export interface CartComboGroup {
  combo_group_id: string;
  combo_id: string;
  combo_name: string;
  combo_price_cents: number;
  combo_savings_cents: number;
  items: ComboCartItem[];
  total_quantity: number;
}

/**
 * Order item with combo tracking
 */
export interface ComboOrderItem {
  id: string;
  order_id: string;
  variant_id: string;
  quantity: number;
  unit_price_cents: number;
  total_price_cents: number;
  combo_id: string | null;
  combo_group_id: string | null;
}

/**
 * Combo availability response
 */
export interface ComboAvailability {
  available: boolean;
  max_quantity: number;
  combo_limit: number | null;
  combo_sold: number;
  reason?: string;
}

/**
 * Create combo request payload
 */
export interface CreateComboRequest {
  name: string;
  description?: string;
  category_id?: string;
  combo_price_cents: number;
  quantity_limit?: number;
  constituent_items: Array<{
    variant_id: string;
    quantity?: number;
    display_order?: number;
  }>;
  images?: string[];
}

/**
 * Create combo response
 */
export interface CreateComboResponse {
  success: boolean;
  combo_id?: string;
  savings_cents?: number;
  quantity_limit?: number;
  message?: string;
}

/**
 * Update combo request payload
 */
export interface UpdateComboRequest {
  name?: string;
  description?: string;
  combo_price_cents?: number;
  quantity_limit?: number | null;
}

/**
 * Type guard to check if a product is a combo
 */
export function isComboProduct(product: Product | ComboProduct): product is ComboProduct {
  return 'is_combo' in product && product.is_combo === true;
}

/**
 * Type guard to check if a cart item is part of a combo
 */
export function isComboCartItem(item: { combo_id?: string | null }): boolean {
  return item.combo_id != null;
}

/**
 * Helper to calculate savings percentage
 */
export function calculateSavingsPercentage(
  originalPriceCents: number,
  comboPriceCents: number
): number {
  if (originalPriceCents <= 0) return 0;
  return Math.round(((originalPriceCents - comboPriceCents) / originalPriceCents) * 100);
}

/**
 * Helper to format price in NPR
 */
export function formatPriceNPR(cents: number): string {
  return `NPR ${(cents / 100).toLocaleString('en-NP')}`;
}
