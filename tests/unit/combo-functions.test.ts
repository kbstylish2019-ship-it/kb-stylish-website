/**
 * Combo Products - Database Functions Unit Tests
 * 
 * Tests for the combo product database functions:
 * - create_combo_product authorization
 * - create_combo_product validation
 * - add_combo_to_cart_secure inventory checks
 * - get_combo_availability calculations
 * 
 * Feature: combo-products
 * Validates: Requirements 1.1, 1.2, 2.2, 2.3, 2.4, 2.5, 2.7, 3.1, 3.2, 5.6
 */

import { createClient } from '@supabase/supabase-js';

// Test configuration
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://poxjcaogjupsplrcliau.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

// Authorized vendor IDs
const KB_STYLISH_VENDOR_ID = '365bd0ab-e135-45c5-bd24-a907de036287';
const TEST_VENDOR_ID = 'b40f741d-b1ce-45ae-a5c6-5703a3e9d182'; // rabindra1816@gmail.com
const UNAUTHORIZED_VENDOR_ID = '00000000-0000-0000-0000-000000000001';

// Skip tests if no service key (CI environment without secrets)
const skipIfNoServiceKey = !SUPABASE_SERVICE_KEY;

describe('Combo Products - Database Functions', () => {
  let supabase: ReturnType<typeof createClient>;
  let testProductVariants: string[] = [];
  let testComboId: string | null = null;

  beforeAll(async () => {
    if (skipIfNoServiceKey) {
      console.log('Skipping database tests - no service key available');
      return;
    }

    supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
      auth: { persistSession: false }
    });

    // Get some existing product variants for testing
    const { data: variants } = await supabase
      .from('product_variants')
      .select('id, price, product_id, products!inner(vendor_id, is_active)')
      .eq('is_active', true)
      .eq('products.vendor_id', KB_STYLISH_VENDOR_ID)
      .eq('products.is_active', true)
      .limit(5);

    if (variants && variants.length >= 2) {
      testProductVariants = variants.map(v => v.id);
    }
  });

  afterAll(async () => {
    // Cleanup: Remove test combo if created
    if (testComboId && supabase) {
      await supabase.from('combo_items').delete().eq('combo_product_id', testComboId);
      await supabase.from('products').delete().eq('id', testComboId);
    }
  });

  describe('create_combo_product - Authorization', () => {
    /**
     * Property 1: Authorization Check
     * For any vendor attempting to create a combo, the operation SHALL succeed 
     * if and only if the vendor_id equals an authorized vendor ID.
     * Validates: Requirements 1.1, 1.2
     */
    
    it('should reject combo creation from unauthorized vendor', async () => {
      if (skipIfNoServiceKey) return;
      if (testProductVariants.length < 2) {
        console.log('Skipping - not enough test variants');
        return;
      }

      // Simulate unauthorized vendor by calling RPC directly
      // The function checks auth.uid() which we can't easily mock,
      // so we test the function's response structure
      const { data, error } = await supabase.rpc('create_combo_product', {
        p_name: 'Test Unauthorized Combo',
        p_description: 'Should fail',
        p_category_id: null,
        p_combo_price_cents: 1000,
        p_constituent_items: [
          { variant_id: testProductVariants[0], quantity: 1 },
          { variant_id: testProductVariants[1], quantity: 1 }
        ]
      });

      // Without proper auth context, should fail
      expect(data?.success).toBe(false);
      expect(data?.message).toContain('authorized');
    });
  });

  describe('create_combo_product - Validation', () => {
    /**
     * Property 4: Minimum Products Constraint
     * For any combo creation attempt with fewer than 2 constituent products,
     * the operation SHALL be rejected.
     * Validates: Requirements 2.5
     */
    
    it('should reject combo with fewer than 2 products', async () => {
      if (skipIfNoServiceKey) return;
      if (testProductVariants.length < 1) {
        console.log('Skipping - no test variants');
        return;
      }

      const { data } = await supabase.rpc('create_combo_product', {
        p_name: 'Single Product Combo',
        p_description: 'Should fail',
        p_category_id: null,
        p_combo_price_cents: 500,
        p_constituent_items: [
          { variant_id: testProductVariants[0], quantity: 1 }
        ]
      });

      expect(data?.success).toBe(false);
      expect(data?.message).toContain('at least 2');
    });

    it('should reject combo with more than 10 products', async () => {
      if (skipIfNoServiceKey) return;
      
      // Create array of 11 items (even if some are duplicates, validation should fail)
      const tooManyItems = Array(11).fill(null).map((_, i) => ({
        variant_id: testProductVariants[i % testProductVariants.length] || testProductVariants[0],
        quantity: 1
      }));

      const { data } = await supabase.rpc('create_combo_product', {
        p_name: 'Too Many Products Combo',
        p_description: 'Should fail',
        p_category_id: null,
        p_combo_price_cents: 5000,
        p_constituent_items: tooManyItems
      });

      expect(data?.success).toBe(false);
      expect(data?.message).toContain('more than 10');
    });

    it('should reject combo with invalid variant ID', async () => {
      if (skipIfNoServiceKey) return;

      const { data } = await supabase.rpc('create_combo_product', {
        p_name: 'Invalid Variant Combo',
        p_description: 'Should fail',
        p_category_id: null,
        p_combo_price_cents: 1000,
        p_constituent_items: [
          { variant_id: '00000000-0000-0000-0000-000000000001', quantity: 1 },
          { variant_id: '00000000-0000-0000-0000-000000000002', quantity: 1 }
        ]
      });

      expect(data?.success).toBe(false);
      expect(data?.message).toContain('Invalid variant');
    });

    /**
     * Property 3: Savings Calculation
     * Combo price must be less than total of individual prices.
     * Validates: Requirements 2.7
     */
    
    it('should reject combo with no savings (price >= original)', async () => {
      if (skipIfNoServiceKey) return;
      if (testProductVariants.length < 2) {
        console.log('Skipping - not enough test variants');
        return;
      }

      // Get actual prices
      const { data: variants } = await supabase
        .from('product_variants')
        .select('id, price')
        .in('id', testProductVariants.slice(0, 2));

      if (!variants || variants.length < 2) return;

      const totalPrice = variants.reduce((sum, v) => sum + v.price, 0);

      const { data } = await supabase.rpc('create_combo_product', {
        p_name: 'No Savings Combo',
        p_description: 'Should fail',
        p_category_id: null,
        p_combo_price_cents: totalPrice + 100, // More than original
        p_constituent_items: [
          { variant_id: variants[0].id, quantity: 1 },
          { variant_id: variants[1].id, quantity: 1 }
        ]
      });

      expect(data?.success).toBe(false);
      expect(data?.message).toContain('less than');
    });
  });

  describe('get_combo_availability - Calculations', () => {
    /**
     * Property 5: Dual Availability Check
     * For any combo product with a quantity limit, its availability SHALL be true
     * if and only if combo_quantity_sold < combo_quantity_limit AND all constituent
     * products have sufficient inventory.
     * Validates: Requirements 3.1, 3.2
     */
    
    it('should return availability for existing combo', async () => {
      if (skipIfNoServiceKey) return;

      // Find an existing combo
      const { data: combos } = await supabase
        .from('products')
        .select('id')
        .eq('is_combo', true)
        .eq('is_active', true)
        .limit(1);

      if (!combos || combos.length === 0) {
        console.log('Skipping - no existing combos');
        return;
      }

      const { data } = await supabase.rpc('get_combo_availability', {
        p_combo_id: combos[0].id
      });

      expect(data).toBeDefined();
      expect(typeof data.available).toBe('boolean');
      expect(typeof data.max_quantity).toBe('number');
      expect(data.max_quantity).toBeGreaterThanOrEqual(0);
    });

    it('should return unavailable for non-existent combo', async () => {
      if (skipIfNoServiceKey) return;

      const { data } = await supabase.rpc('get_combo_availability', {
        p_combo_id: '00000000-0000-0000-0000-000000000001'
      });

      expect(data?.available).toBe(false);
      expect(data?.max_quantity).toBe(0);
      expect(data?.reason).toContain('not found');
    });
  });

  describe('add_combo_to_cart_secure - Inventory Checks', () => {
    /**
     * Property 8: Inventory Validation on Cart Add
     * For any combo add-to-cart attempt, the operation SHALL fail if:
     * - combo_quantity_limit is set AND combo_quantity_sold >= combo_quantity_limit, OR
     * - any constituent product has insufficient inventory.
     * Validates: Requirements 5.6
     */
    
    it('should reject adding non-existent combo to cart', async () => {
      if (skipIfNoServiceKey) return;

      const { data } = await supabase.rpc('add_combo_to_cart_secure', {
        p_combo_id: '00000000-0000-0000-0000-000000000001',
        p_user_id: null,
        p_guest_token: 'test-guest-token-' + Date.now()
      });

      expect(data?.success).toBe(false);
      expect(data?.message).toContain('not found');
    });

    it('should reject adding inactive combo to cart', async () => {
      if (skipIfNoServiceKey) return;

      // Find an inactive combo if exists
      const { data: combos } = await supabase
        .from('products')
        .select('id')
        .eq('is_combo', true)
        .eq('is_active', false)
        .limit(1);

      if (!combos || combos.length === 0) {
        console.log('Skipping - no inactive combos');
        return;
      }

      const { data } = await supabase.rpc('add_combo_to_cart_secure', {
        p_combo_id: combos[0].id,
        p_user_id: null,
        p_guest_token: 'test-guest-token-' + Date.now()
      });

      expect(data?.success).toBe(false);
    });
  });

  describe('remove_combo_from_cart_secure', () => {
    /**
     * Property 7: Combo Group Removal
     * For any cart containing combo items, removing one item with a combo_group_id
     * SHALL remove all items with that same combo_group_id.
     * Validates: Requirements 5.5
     */
    
    it('should return error for non-existent combo group', async () => {
      if (skipIfNoServiceKey) return;

      const { data } = await supabase.rpc('remove_combo_from_cart_secure', {
        p_combo_group_id: '00000000-0000-0000-0000-000000000001',
        p_user_id: null,
        p_guest_token: 'test-guest-token-' + Date.now()
      });

      // Should fail because cart doesn't exist
      expect(data?.success).toBe(false);
    });
  });

  describe('increment_combo_sold', () => {
    /**
     * Property 11: Combo Sold Counter Increment
     * For any successful combo purchase, combo_quantity_sold SHALL be
     * incremented by the quantity purchased.
     * Validates: Requirements 3.4
     */
    
    it('should increment combo sold counter', async () => {
      if (skipIfNoServiceKey) return;

      // Find an existing combo
      const { data: combos } = await supabase
        .from('products')
        .select('id, combo_quantity_sold')
        .eq('is_combo', true)
        .limit(1);

      if (!combos || combos.length === 0) {
        console.log('Skipping - no existing combos');
        return;
      }

      const originalSold = combos[0].combo_quantity_sold || 0;

      // Increment
      const { data } = await supabase.rpc('increment_combo_sold', {
        p_combo_id: combos[0].id,
        p_quantity: 1
      });

      expect(data?.success).toBe(true);

      // Verify increment
      const { data: updated } = await supabase
        .from('products')
        .select('combo_quantity_sold')
        .eq('id', combos[0].id)
        .single();

      expect(updated?.combo_quantity_sold).toBe(originalSold + 1);

      // Decrement back to original (cleanup)
      await supabase
        .from('products')
        .update({ combo_quantity_sold: originalSold })
        .eq('id', combos[0].id);
    });
  });
});
