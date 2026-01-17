/**
 * Combo Products Configuration
 * 
 * This module contains all configuration constants for the combo products feature.
 * Only authorized vendors can create and manage combos.
 */

export const COMBO_CONFIG = {
  // KB Stylish vendor ID - primary vendor for combos
  // This is hardcoded for launch simplicity
  AUTHORIZED_VENDOR_ID: '365bd0ab-e135-45c5-bd24-a907de036287',
  
  // Additional authorized vendor IDs for testing
  // rabindra1816@gmail.com - authorized for testing combo creation
  AUTHORIZED_VENDOR_IDS: [
    '365bd0ab-e135-45c5-bd24-a907de036287', // KB Stylish
    'b40f741d-b1ce-45ae-a5c6-5703a3e9d182', // rabindra1816@gmail.com (testing)
  ],
  
  // Minimum products required for a combo
  MIN_PRODUCTS: 2,
  
  // Maximum products allowed in a combo
  MAX_PRODUCTS: 10,
  
  // Default combo quantity limit for launch (can be overridden per combo)
  DEFAULT_QUANTITY_LIMIT: 10,
  
  // UI Labels
  LABELS: {
    BADGE: 'COMBO',
    SAVINGS_PREFIX: 'Save',
    LIMITED_SUFFIX: 'left!',
    SOLD_OUT: 'Sold Out',
    ADD_TO_CART: 'Add Bundle to Cart',
    REMOVE_COMBO: 'Remove Bundle',
    REMOVE_CONFIRM_TITLE: 'Remove Bundle?',
    REMOVE_CONFIRM_MESSAGE: 'All items in this bundle will be removed from your cart.',
  },
  
  // Accessibility labels
  A11Y: {
    COMBO_BADGE: 'Product bundle',
    SAVINGS_ANNOUNCEMENT: (savings: number) => `You save ${savings} rupees with this bundle`,
    AVAILABILITY_ANNOUNCEMENT: (remaining: number) => `Only ${remaining} bundles remaining`,
    REMOVE_BUTTON: 'Remove entire bundle from cart',
  },
} as const;

// Type for combo configuration
export type ComboConfig = typeof COMBO_CONFIG;

/**
 * Check if a vendor is authorized to create combos
 */
export function isAuthorizedComboVendor(vendorId: string): boolean {
  return (COMBO_CONFIG.AUTHORIZED_VENDOR_IDS as readonly string[]).includes(vendorId);
}
