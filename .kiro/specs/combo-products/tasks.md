# Implementation Tasks: Combo Products

**Version**: 1.0  
**Created**: January 16, 2026  
**Status**: READY FOR IMPLEMENTATION (Phase 8)

## Pre-Implementation Checklist

- [x] Phase 1: Codebase Immersion ✅
- [x] Phase 2: 5-Expert Panel Consultation ✅
- [x] Phase 3: Codebase Consistency Check ✅
- [x] Phase 4: Solution Blueprint ✅
- [x] Phase 5: Expert Panel Review of Blueprint ✅
- [x] Phase 6: Blueprint Revision ✅
- [x] Phase 7: FAANG-Level Code Review ✅
- [x] Phase 8: Implementation ✅ COMPLETE
- [x] Phase 9: Post-Implementation Review ✅
- [ ] Phase 10: Bug Fixing & Refinement

---

## Task Groups

### Group 1: Database Schema (Foundation)

#### Task 1.1: Create Migration - Products Table Extension
- [x] Add `is_combo` boolean column (default false)
- [x] Add `combo_price_cents` integer column
- [x] Add `combo_savings_cents` integer column
- [x] Add `combo_quantity_limit` integer column (nullable)
- [x] Add `combo_quantity_sold` integer column (default 0)

**File**: `supabase/migrations/20260116065535_add_combo_fields_to_products.sql` ✅

#### Task 1.2: Create Migration - Combo Items Table
- [x] Create `combo_items` junction table
- [x] Add foreign keys to products and product_variants
- [x] Add unique constraint on (combo_product_id, constituent_variant_id)
- [x] Enable RLS
- [x] Add RLS policies (public read, KB Stylish vendor write)

**File**: `supabase/migrations/20260116065553_create_combo_items_table.sql` ✅

#### Task 1.3: Create Migration - Cart Items Extension
- [x] Add `combo_id` UUID column (nullable, FK to products)
- [x] Add `combo_group_id` UUID column (nullable)
- [x] Add index on combo_group_id

**File**: `supabase/migrations/20260116065604_add_combo_fields_to_cart_items.sql` ✅

#### Task 1.4: Create Migration - Order Items Extension
- [x] Add `combo_id` UUID column (nullable, FK to products)
- [x] Add `combo_group_id` UUID column (nullable)
- [x] Add index on combo_group_id

**File**: `supabase/migrations/20260116065614_add_combo_fields_to_order_items.sql` ✅

#### Task 1.5: Create Migration - Performance Indices
- [x] Add partial index on products(is_combo) WHERE is_combo = true
- [x] Add index on combo_items(combo_product_id)

**File**: Included in above migrations ✅

---

### Group 2: Database Functions

#### Task 2.1: Create Combo Product Function
- [x] Implement `create_combo_product` with vendor authorization
- [x] Validate minimum products (2)
- [x] Validate vendor ownership of constituents
- [x] Calculate savings automatically
- [x] Support quantity limit parameter

**File**: `supabase/migrations/20260116065702_create_combo_product_function.sql` ✅

#### Task 2.2: Add Combo to Cart Function
- [x] Implement `add_combo_to_cart_secure`
- [x] Check combo-specific inventory limit
- [x] Check constituent inventory
- [x] Calculate proportional discounts
- [x] Generate unique combo_group_id
- [x] Insert all constituent items

**File**: `supabase/migrations/20260116065727_add_combo_to_cart_function.sql` ✅

#### Task 2.3: Remove Combo from Cart Function
- [x] Implement `remove_combo_from_cart_secure`
- [x] Remove all items with matching combo_group_id

**File**: `supabase/migrations/20260116065743_remove_combo_from_cart_function.sql` ✅

#### Task 2.4: Get Combo Availability Function
- [x] Implement `get_combo_availability`
- [x] Check combo_quantity_limit vs combo_quantity_sold
- [x] Check all constituent inventory
- [x] Return max available quantity

**File**: `supabase/migrations/20260116065808_get_combo_availability_function.sql` ✅

#### Task 2.5: Increment Combo Sold Function
- [x] Implement `increment_combo_sold`
- [x] Atomic increment of combo_quantity_sold

**File**: `supabase/migrations/20260116065821_increment_combo_sold_function.sql` ✅

#### Task 2.6: Update Cart Merge Function
- [x] Modify `merge_carts_secure` to preserve combo_group_id
- [x] Test guest-to-user cart merge with combos

**File**: `supabase/migrations/20260116065850_update_merge_carts_for_combos.sql` ✅

---

### Group 3: Backend - Edge Functions

#### Task 3.1: Extend Cart Manager - Add Combo Action
- [x] Add `add_combo` action handler
- [x] Validate combo_id parameter
- [x] Call `add_combo_to_cart_secure`
- [x] Return updated cart

**File**: `supabase/functions/cart-manager/index.ts` ✅

#### Task 3.2: Extend Cart Manager - Remove Combo Action
- [x] Add `remove_combo` action handler
- [x] Validate combo_group_id parameter
- [x] Call `remove_combo_from_cart_secure`
- [x] Return updated cart

**File**: `supabase/functions/cart-manager/index.ts` ✅

#### Task 3.3: Update Get Cart Details
- [x] Modify `get_cart_details_secure` to include combo information
- [x] Group cart items by combo_group_id in response
- [x] Include combo name and savings for grouped items

**File**: `supabase/migrations/20260116065922_update_get_cart_details_for_combos.sql` ✅

---

### Group 4: Backend - Server Actions

#### Task 4.1: Create Combo Server Action
- [x] Implement `createComboProduct` server action
- [x] Validate vendor authorization
- [x] Call `create_combo_product` RPC
- [x] Revalidate vendor products page

**File**: `src/app/actions/combo.ts` ✅

#### Task 4.2: Update Combo Server Action
- [x] Implement `updateComboProduct` server action
- [x] Validate vendor authorization
- [x] Support updating price, name, description, quantity limit

**File**: `src/app/actions/combo.ts` ✅

#### Task 4.3: Toggle Combo Active Server Action
- [x] Implement `toggleComboActive` server action
- [x] Validate vendor authorization
- [x] Update is_active flag

**File**: `src/app/actions/combo.ts` ✅

---

### Group 5: Frontend - Constants & Types

#### Task 5.1: Create Combo Constants
- [x] Define `COMBO_CONFIG` with authorized vendor ID
- [x] Define MIN_PRODUCTS, MAX_PRODUCTS
- [x] Define DEFAULT_QUANTITY_LIMIT

**File**: `src/lib/constants/combo.ts` ✅

#### Task 5.2: Extend TypeScript Types
- [x] Extend `Product` interface with combo fields
- [x] Create `ComboItem` interface
- [x] Extend `CartItem` interface with combo_id, combo_group_id
- [x] Create `ComboProduct` type alias

**File**: `src/types/combo.ts` ✅

---

### Group 6: Frontend - Components

#### Task 6.1: Create ComboProductCard Component
- [x] Display COMBO badge
- [x] Show original price crossed out
- [x] Show combo price and savings
- [x] Show "X left!" indicator when limited
- [x] Add accessibility attributes

**File**: `src/components/products/ComboProductCard.tsx` ✅

#### Task 6.2: Create ComboDetailPage Component
- [x] Display combo images
- [x] List constituent products with prices
- [x] Show total savings
- [x] Add to Cart button with availability check
- [x] Accessibility: aria-live for availability

**File**: `src/components/product/ComboDetailClient.tsx` ✅

#### Task 6.3: Create CartComboGroup Component
- [x] Group combo items visually
- [x] Show combo name header
- [x] Remove button with confirmation dialog
- [x] Accessibility attributes

**File**: `src/components/cart/CartComboGroup.tsx` ✅

#### Task 6.4: Update Cart Display
- [x] Detect combo groups in cart items
- [x] Render CartComboGroup for grouped items
- [x] Render regular items normally

**File**: `src/components/cart/CartItemList.tsx` ✅

---

### Group 7: Frontend - Vendor Portal

#### Task 7.1: Create VendorComboList Component
- [x] List all vendor combos
- [x] Show status, sales, availability
- [x] Edit/Deactivate actions

**File**: `src/app/vendor/combos/page.tsx` ✅
**File**: `src/components/vendor/VendorComboList.tsx` ✅

#### Task 7.2: Create ComboCreationWizard Component
- [x] Step 1: Select constituent products
- [x] Step 2: Set combo price and quantity limit
- [x] Step 3: Add name, description, images
- [x] Step 4: Review and create

**File**: `src/app/vendor/combos/create/page.tsx` ✅
**File**: `src/components/vendor/ComboCreationWizard.tsx` ✅

#### Task 7.3: Create ComboEditModal Component
- [x] Edit combo name, description
- [x] Edit price and quantity limit
- [x] Cannot edit constituents (create new combo instead)

**File**: `src/components/vendor/ComboEditModal.tsx` ✅

---

### Group 8: Integration

#### Task 8.1: Update Order Completion Handler
- [x] Detect combo items in order
- [x] Call `increment_combo_sold` for each unique combo
- [x] Pass correct quantity

**File**: `supabase/functions/order-worker/index.ts` ✅

#### Task 8.2: Update Checkout Validation
- [x] Revalidate combo availability before payment
- [x] Show error if combo sold out during checkout

**File**: `supabase/functions/create-order-intent/index.ts` ✅

---

### Group 9: Testing

#### Task 9.1: Unit Tests - Database Functions
- [x] Test `create_combo_product` authorization
- [x] Test `create_combo_product` validation
- [x] Test `add_combo_to_cart_secure` inventory checks
- [x] Test `get_combo_availability` calculations

**File**: `tests/unit/combo-functions.test.ts` ✅

#### Task 9.2: Property-Based Tests
- [x] Authorization property test
- [x] Savings calculation property test
- [x] Availability calculation property test
- [x] Cart expansion property test

**File**: `tests/property/combo-properties.test.ts` ✅

#### Task 9.3: Integration Tests
- [x] E2E combo creation flow
- [x] E2E add combo to cart flow
- [x] E2E checkout with combo
- [x] Cart merge with combo

**File**: `tests/e2e/combo-flow.spec.ts` ✅

---

## Implementation Order

1. **Week 1: Database Foundation** ✅ COMPLETE
   - Tasks 1.1 - 1.5 (Schema) ✅
   - Tasks 2.1 - 2.6 (Functions) ✅

2. **Week 2: Backend Integration** ✅ COMPLETE
   - Tasks 3.1 - 3.3 (Edge Functions) ✅
   - Tasks 4.1 - 4.3 (Server Actions) ✅
   - Task 8.1 - 8.2 (Integration) ✅

3. **Week 3: Frontend - Customer** ✅ COMPLETE
   - Tasks 5.1 - 5.2 (Types) ✅
   - Tasks 6.1 - 6.4 (Components) ✅

4. **Week 4: Frontend - Vendor & Testing** ✅ COMPLETE
   - Tasks 7.1 - 7.3 (Vendor Portal) ✅
   - Tasks 9.1 - 9.3 (Testing) ✅

---

## Rollback Plan

If critical issues are discovered post-deployment:

1. **Immediate**: Set all combos to `is_active = false`
2. **Short-term**: Remove combo items from carts
3. **Full rollback**:
   ```sql
   -- Remove combo data
   DELETE FROM combo_items;
   UPDATE cart_items SET combo_id = NULL, combo_group_id = NULL;
   UPDATE order_items SET combo_id = NULL, combo_group_id = NULL;
   
   -- Drop combo columns (if needed)
   ALTER TABLE products DROP COLUMN IF EXISTS is_combo;
   ALTER TABLE products DROP COLUMN IF EXISTS combo_price_cents;
   ALTER TABLE products DROP COLUMN IF EXISTS combo_savings_cents;
   ALTER TABLE products DROP COLUMN IF EXISTS combo_quantity_limit;
   ALTER TABLE products DROP COLUMN IF EXISTS combo_quantity_sold;
   
   -- Drop combo_items table
   DROP TABLE IF EXISTS combo_items;
   ```

---

## Success Criteria

- [x] KB Stylish vendor can create combos with 2-10 products
- [x] Combos display correctly on storefront with savings
- [x] Customers can add combos to cart (expands to constituent items)
- [x] Removing one combo item removes entire group (with confirmation)
- [x] Combo quantity limits are enforced
- [x] Checkout works correctly with combo items
- [x] Order completion increments combo_quantity_sold
- [x] All tests pass
- [x] No security vulnerabilities
- [x] Accessibility requirements met (WCAG 2.1)

**Additional Testing Authorization:**
- [x] rabindra1816@gmail.com added as authorized combo vendor for testing
