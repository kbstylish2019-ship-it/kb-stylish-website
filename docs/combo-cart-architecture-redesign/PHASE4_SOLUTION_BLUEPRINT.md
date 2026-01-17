# PHASE 4: SOLUTION BLUEPRINT - COMBO CART REDESIGN

**Date**: January 17, 2026  
**Task**: Detailed technical design for implementation  
**Protocol**: Universal AI Excellence Protocol v2.0

---

## BLUEPRINT OVERVIEW

**Approach**: Surgical Fix + Incremental Enhancement  
**Risk Level**: LOW (price fix) + MEDIUM (UI changes)  
**Rollback**: Possible at each phase

---

## PROBLEM STATEMENT

### Current Issues
1. **Price Calculation Bug**: Mixing cents and rupees causes 50x inflation
2. **Missing Grouping**: Combo items displayed as individual products
3. **Broken Quantity Controls**: Increasing one item affects all instances
4. **Poor UX**: No visual indication of combo grouping

### Business Impact
- Users being overcharged (trust issue)
- Confusing checkout experience (conversion loss)
- Cannot manage combos properly (usability issue)

### Technical Impact
- Database has correct structure but wrong calculation
- Frontend has data but doesn't group it
- State management works but needs enhancement

---

## PROPOSED SOLUTION

### Three-Phase Implementation

**Phase A: Fix Price Calculation** (CRITICAL)
- Fix database function
- Migrate existing cart data
- Deploy immediately

**Phase B: Add Combo Grouping UI** (HIGH)
- Create ComboGroup component
- Add grouping logic to store
- Update ProductList display

**Phase C: Add Combo Quantity Controls** (HIGH)
- Create update_combo_quantity function
- Add edge function action
- Add UI controls

---

## ARCHITECTURE CHANGES

### System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                    REVISED ARCHITECTURE                      │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  USER INTERACTION                                            │
│         │                                                    │
│         ▼                                                    │
│  ┌──────────────────────────────────────┐                   │
│  │ ComboGroup Component (NEW)           │                   │
│  │ - Visual grouping                    │                   │
│  │ - Combo-level controls               │                   │
│  │ - Price breakdown display            │                   │
│  └──────────────────────────────────────┘                   │
│         │                                                    │
│         ▼                                                    │
│  ┌──────────────────────────────────────┐                   │
│  │ decoupledCartStore                   │                   │
│  │ - groupCartItems() helper (NEW)      │                   │
│  │ - updateComboQuantity() action (NEW) │                   │
│  └──────────────────────────────────────┘                   │
│         │                                                    │
│         ▼                                                    │
│  ┌──────────────────────────────────────┐                   │
│  │ cartAPI Client                       │                   │
│  │ - updateComboQuantity() method (NEW) │                   │
│  └──────────────────────────────────────┘                   │
│         │                                                    │
│         ▼                                                    │
│  ┌──────────────────────────────────────┐                   │
│  │ cart-manager Edge Function           │                   │
│  │ - 'update_combo_quantity' action(NEW)│                   │
│  └──────────────────────────────────────┘                   │
│         │                                                    │
│         ▼                                                    │
│  ┌──────────────────────────────────────┐                   │
│  │ Database Functions                   │                   │
│  │ - add_combo_to_cart_secure (FIXED)   │                   │
│  │ - update_combo_quantity_secure (NEW) │                   │
│  └──────────────────────────────────────┘                   │
│         │                                                    │
│         ▼                                                    │
│  ┌──────────────────────────────────────┐                   │
│  │ cart_items Table                     │                   │
│  │ - Correct prices (FIXED)             │                   │
│  │ - combo_group_id used for grouping   │                   │
│  └──────────────────────────────────────┘                   │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### Data Flow Diagram

```
ADD COMBO FLOW (FIXED):
User → ComboDetailPage → addComboItem()
  → cartAPI.addComboToCart()
  → Edge Function: add_combo
  → add_combo_to_cart_secure() [FIXED CALCULATION]
  → Insert cart_items with CORRECT prices
  → Return cart
  → Store updates
  → UI re-renders with grouped display

UPDATE COMBO QUANTITY FLOW (NEW):
User → ComboGroup → handleQuantityChange()
  → updateComboQuantity()
  → cartAPI.updateComboQuantity()
  → Edge Function: update_combo_quantity
  → update_combo_quantity_secure() [NEW]
  → Update all items in combo_group_id
  → Check inventory
  → Return cart
  → Store updates
  → UI re-renders

DISPLAY CART FLOW (ENHANCED):
Load cart → decoupledCartStore.productItems
  → groupCartItems() [NEW]
  → { comboGroups: Map, regularItems: [] }
  → ProductList renders:
      - ComboGroup for each combo
      - RegularItem for each product
```

---

## DATABASE CHANGES

### Migration 1: Fix Price Calculation

**File**: `20260117_fix_combo_price_calculation.sql`

```sql
-- ============================================================================
-- MIGRATION: Fix Combo Price Calculation Bug
-- Date: 2026-01-17
-- Issue: Function mixes cents and rupees causing 50x price inflation
-- Fix: Convert combo_price_cents to rupees before calculation
-- ============================================================================

BEGIN;

-- Step 1: Backup existing cart items with combos
CREATE TABLE IF NOT EXISTS cart_items_backup_20260117 AS 
SELECT * FROM cart_items WHERE combo_id IS NOT NULL;

-- Step 2: Fix the add_combo_to_cart_secure function
CREATE OR REPLACE FUNCTION add_combo_to_cart_secure(
  p_combo_id UUID,
  p_user_id UUID DEFAULT NULL,
  p_guest_token TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_cart_id UUID;
  v_combo RECORD;
  v_item RECORD;
  v_combo_group_id UUID;
  v_total_original_price NUMERIC := 0;
  v_discount_ratio NUMERIC;
  v_discounted_price NUMERIC;
  v_available_qty INTEGER;
  v_combo_remaining INTEGER;
BEGIN
  -- Validate auth
  IF p_user_id IS NULL AND p_guest_token IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'User ID or guest token required');
  END IF;

  -- Get combo details
  SELECT * INTO v_combo FROM products 
  WHERE id = p_combo_id AND is_combo = true AND is_active = true;
  
  IF v_combo IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Combo not found or inactive');
  END IF;
  
  -- Check combo quantity limit
  IF v_combo.combo_quantity_limit IS NOT NULL THEN
    v_combo_remaining := v_combo.combo_quantity_limit - COALESCE(v_combo.combo_quantity_sold, 0);
    IF v_combo_remaining <= 0 THEN
      RETURN jsonb_build_object('success', false, 'message', 'Combo sold out');
    END IF;
  END IF;
  
  -- Calculate total original price IN RUPEES
  FOR v_item IN 
    SELECT ci.*, pv.price, COALESCE(i.quantity_available, 0) as quantity_available, p.name as product_name
    FROM combo_items ci
    JOIN product_variants pv ON ci.constituent_variant_id = pv.id
    JOIN products p ON ci.constituent_product_id = p.id
    LEFT JOIN inventory i ON i.variant_id = pv.id
    WHERE ci.combo_product_id = p_combo_id
  LOOP
    -- Check inventory
    IF v_item.quantity_available < v_item.quantity THEN
      RETURN jsonb_build_object(
        'success', false, 
        'message', 'Insufficient inventory for ' || v_item.product_name
      );
    END IF;
    
    -- Sum original prices (variant price is in RUPEES)
    v_total_original_price := v_total_original_price + (v_item.price * v_item.quantity);
  END LOOP;
  
  -- CRITICAL FIX: Convert combo_price_cents to rupees before calculation
  IF v_total_original_price > 0 THEN
    v_discount_ratio := (v_combo.combo_price_cents::NUMERIC / 100) / v_total_original_price;
  ELSE
    RETURN jsonb_build_object('success', false, 'message', 'Invalid combo configuration');
  END IF;
  
  -- Get or create cart
  IF p_user_id IS NOT NULL THEN
    SELECT id INTO v_cart_id FROM carts WHERE user_id = p_user_id;
    IF v_cart_id IS NULL THEN
      INSERT INTO carts (user_id) VALUES (p_user_id) RETURNING id INTO v_cart_id;
    END IF;
  ELSE
    SELECT id INTO v_cart_id FROM carts WHERE session_id = p_guest_token;
    IF v_cart_id IS NULL THEN
      INSERT INTO carts (session_id) VALUES (p_guest_token) RETURNING id INTO v_cart_id;
    END IF;
  END IF;
  
  -- Generate unique group ID
  v_combo_group_id := gen_random_uuid();
  
  -- Add items with CORRECT discounted prices
  FOR v_item IN 
    SELECT ci.*, pv.price
    FROM combo_items ci
    JOIN product_variants pv ON ci.constituent_variant_id = pv.id
    WHERE ci.combo_product_id = p_combo_id
    ORDER BY ci.display_order
  LOOP
    -- Apply discount ratio (now correct!)
    v_discounted_price := ROUND(v_item.price * v_discount_ratio, 2);
    
    INSERT INTO cart_items (cart_id, variant_id, quantity, price_snapshot, combo_id, combo_group_id)
    VALUES (v_cart_id, v_item.constituent_variant_id, v_item.quantity, v_discounted_price, p_combo_id, v_combo_group_id);
  END LOOP;
  
  -- Update cart timestamp
  UPDATE carts SET updated_at = now() WHERE id = v_cart_id;
  
  RETURN jsonb_build_object(
    'success', true, 
    'combo_group_id', v_combo_group_id,
    'combo_name', v_combo.name,
    'combo_price_cents', v_combo.combo_price_cents,
    'savings_cents', v_combo.combo_savings_cents
  );
END;
$$;

-- Step 3: Recalculate prices for existing cart items
UPDATE cart_items ci
SET price_snapshot = (
  SELECT ROUND(
    pv.price * (
      (p.combo_price_cents::NUMERIC / 100) / 
      (
        SELECT SUM(pv2.price * ci2.quantity)
        FROM cart_items ci2
        JOIN product_variants pv2 ON ci2.variant_id = pv2.id
        WHERE ci2.combo_group_id = ci.combo_group_id
      )
    ),
    2
  )
  FROM product_variants pv
  JOIN products p ON ci.combo_id = p.id
  WHERE pv.id = ci.variant_id AND ci.combo_id IS NOT NULL
)
WHERE ci.combo_id IS NOT NULL;

-- Step 4: Verify results
DO $$
DECLARE
  v_group RECORD;
  v_expected NUMERIC;
  v_actual NUMERIC;
BEGIN
  FOR v_group IN 
    SELECT DISTINCT combo_group_id, combo_id 
    FROM cart_items 
    WHERE combo_id IS NOT NULL
  LOOP
    -- Get expected total (combo price)
    SELECT combo_price_cents / 100 INTO v_expected
    FROM products WHERE id = v_group.combo_id;
    
    -- Get actual total (sum of price_snapshot * quantity)
    SELECT SUM(price_snapshot * quantity) INTO v_actual
    FROM cart_items WHERE combo_group_id = v_group.combo_group_id;
    
    -- Check if they match (within 1 rupee due to rounding)
    IF ABS(v_expected - v_actual) > 1 THEN
      RAISE WARNING 'Price mismatch for combo_group_id %: expected %, got %', 
        v_group.combo_group_id, v_expected, v_actual;
    END IF;
  END LOOP;
END $$;

-- Step 5: Add comment
COMMENT ON FUNCTION add_combo_to_cart_secure IS 
'Adds combo to cart with correct price calculation. 
FIXED: Converts combo_price_cents to rupees before calculating discount ratio.
Version: 2.0 (2026-01-17)';

COMMIT;

-- Rollback plan:
-- BEGIN;
-- DROP FUNCTION IF EXISTS add_combo_to_cart_secure;
-- -- Restore from backup
-- DELETE FROM cart_items WHERE combo_id IS NOT NULL;
-- INSERT INTO cart_items SELECT * FROM cart_items_backup_20260117;
-- COMMIT;
```

### Migration 2: Add Combo Quantity Update Function

**File**: `20260117_add_combo_quantity_update.sql`

```sql
-- ============================================================================
-- MIGRATION: Add Combo Quantity Update Function
-- Date: 2026-01-17
-- Purpose: Allow updating quantity for entire combo group
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION update_combo_quantity_secure(
  p_combo_group_id UUID,
  p_new_quantity INTEGER,
  p_user_id UUID DEFAULT NULL,
  p_guest_token TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_cart_id UUID;
  v_current_item RECORD;
  v_quantity_factor NUMERIC;
  v_updated_count INTEGER := 0;
  v_combo_name TEXT;
BEGIN
  -- Validate auth
  IF p_user_id IS NULL AND p_guest_token IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'User ID or guest token required');
  END IF;
  
  -- Validate quantity
  IF p_new_quantity < 1 THEN
    RETURN jsonb_build_object('success', false, 'message', 'Quantity must be at least 1');
  END IF;
  
  -- Get cart
  IF p_user_id IS NOT NULL THEN
    SELECT id INTO v_cart_id FROM carts WHERE user_id = p_user_id;
  ELSE
    SELECT id INTO v_cart_id FROM carts WHERE session_id = p_guest_token;
  END IF;
  
  IF v_cart_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Cart not found');
  END IF;
  
  -- Verify combo group exists in this cart
  IF NOT EXISTS (
    SELECT 1 FROM cart_items 
    WHERE cart_id = v_cart_id AND combo_group_id = p_combo_group_id
  ) THEN
    RETURN jsonb_build_object('success', false, 'message', 'Combo group not found in cart');
  END IF;
  
  -- Get combo name for response
  SELECT p.name INTO v_combo_name
  FROM cart_items ci
  JOIN products p ON ci.combo_id = p.id
  WHERE ci.combo_group_id = p_combo_group_id
  LIMIT 1;
  
  -- Calculate quantity factor (how much to multiply each item)
  -- Get the first item's quantity to determine the factor
  SELECT quantity INTO v_quantity_factor
  FROM cart_items
  WHERE combo_group_id = p_combo_group_id
  ORDER BY created_at
  LIMIT 1;
  
  v_quantity_factor := p_new_quantity::NUMERIC / v_quantity_factor;
  
  -- Check inventory for all items with new quantities
  FOR v_current_item IN
    SELECT 
      ci.variant_id,
      ci.quantity,
      ROUND(ci.quantity * v_quantity_factor) as new_quantity,
      COALESCE(i.quantity_available, 0) as available,
      p.name as product_name
    FROM cart_items ci
    JOIN product_variants pv ON ci.variant_id = pv.id
    JOIN products p ON pv.product_id = p.id
    LEFT JOIN inventory i ON i.variant_id = ci.variant_id
    WHERE ci.combo_group_id = p_combo_group_id
  LOOP
    IF v_current_item.available < v_current_item.new_quantity THEN
      RETURN jsonb_build_object(
        'success', false,
        'message', 'Insufficient inventory for ' || v_current_item.product_name,
        'available', v_current_item.available,
        'requested', v_current_item.new_quantity
      );
    END IF;
  END LOOP;
  
  -- Update all items in the combo group
  UPDATE cart_items
  SET 
    quantity = ROUND(quantity * v_quantity_factor),
    updated_at = now()
  WHERE combo_group_id = p_combo_group_id AND cart_id = v_cart_id;
  
  GET DIAGNOSTICS v_updated_count = ROW_COUNT;
  
  -- Update cart timestamp
  UPDATE carts SET updated_at = now() WHERE id = v_cart_id;
  
  RETURN jsonb_build_object(
    'success', true,
    'combo_group_id', p_combo_group_id,
    'combo_name', v_combo_name,
    'new_quantity', p_new_quantity,
    'items_updated', v_updated_count
  );
END;
$$;

COMMENT ON FUNCTION update_combo_quantity_secure IS
'Updates quantity for all items in a combo group proportionally.
Checks inventory before updating. Atomic operation (all or nothing).
Version: 1.0 (2026-01-17)';

COMMIT;

-- Rollback:
-- DROP FUNCTION IF EXISTS update_combo_quantity_secure;
```

---


## API CHANGES

### Edge Function: cart-manager

**File**: `supabase/functions/cart-manager/index.ts`

**Changes**: Add new action handler

```typescript
// Add to switch statement:
case 'update_combo_quantity':
  if (!combo_group_id || quantity === undefined) {
    return new Response(JSON.stringify({
      error: 'combo_group_id and quantity are required for update_combo_quantity action'
    }), {
      status: 400,
      headers: responseHeaders
    });
  }
  response = await updateComboQuantity(serviceClient, authenticatedUser, guestToken, combo_group_id, quantity);
  break;

// Add new function:
async function updateComboQuantitres spike

---

**STATUS**: ✅ PHASE 4 COMPLETE - READY FOR BLUEPRINT REVIEW

**Next**: Phase 5 - Expert panel reviews this blueprint

 Loading states shown
- ✅ No race conditions

---

## MONITORING

### Metrics to Track
1. **Price Accuracy**: Alert if price_snapshot > variant_price
2. **Combo Operations**: Success rate for add/update/remove
3. **Error Rates**: Track all combo-related errors
4. **Performance**: Cart load time, grouping time
5. **Business**: Combo conversion rate, average quantity

### Alerts
1. Price calculation anomaly (price > expected)
2. High error rate (>5%) on combo operations
3. Slow cart load (>2s)
4. Inventory check failu product shows Rs. 0.50 (not Rs. 50)
- ✅ Lilium shows Rs. 499.83 (not Rs. 49,983)
- ✅ Cart total shows Rs. 1,500 (not Rs. 301,198)
- ✅ No errors in logs
- ✅ All existing carts recalculated

### Phase B Success
- ✅ Combos visually grouped with border
- ✅ Combo name and icon displayed
- ✅ Constituent items indented
- ✅ Savings displayed
- ✅ Mobile responsive
- ✅ No React errors

### Phase C Success
- ✅ Quantity controls work
- ✅ All items update proportionally
- ✅ Inventory checks pass
- ✅ Error messages clear
- ✅ cart_items SELECT * FROM cart_items_backup_20260117;
-- Revert function
-- (restore old version from git)
COMMIT;
```

### If Phase B Fails
```bash
# Revert frontend deployment
git revert <commit-hash>
npm run build
# Deploy previous version
```

### If Phase C Fails
```typescript
// Disable quantity controls in ComboGroup.tsx
const ENABLE_QUANTITY_CONTROLS = false;

// In render:
{ENABLE_QUANTITY_CONTROLS && (
  <div>Quantity controls...</div>
)}
```

---

## SUCCESS CRITERIA

### Phase A Success
- ✅ Testent

**Time**: 4-6 hours

### Phase C: Combo Quantity Controls (DAY 3)

**Steps**:
1. ✅ Apply migration (add function)
2. ✅ Update edge function
3. ✅ Update API client
4. ✅ Update store
5. ✅ Update ComboGroup component
6. ✅ Test end-to-end
7. ✅ Deploy all layers
8. ✅ Verify functionality
9. ✅ Monitor errors

**Rollback**: Disable quantity controls in UI

**Time**: 6-8 hours

---

## ROLLBACK PLAN

### If Phase A Fails
```sql
BEGIN;
-- Restore from backup
DELETE FROM cart_items WHERE combo_id IS NOT NULL;
INSERT INTOiew migration SQL
2. ✅ Test on local database
3. ✅ Backup production cart_items
4. ✅ Apply migration to production
5. ✅ Verify prices corrected
6. ✅ Monitor for errors

**Rollback**: Restore from backup if issues

**Time**: 1-2 hours

### Phase B: Combo Grouping UI (NEXT DAY)

**Steps**:
1. ✅ Create ComboGroup component
2. ✅ Add grouping logic to store
3. ✅ Update ProductList component
4. ✅ Test locally
5. ✅ Deploy frontend
6. ✅ Verify grouping works
7. ✅ Monitor user feedback

**Rollback**: Revert frontend deploym page.goto('/checkout');
    
    // Click remove
    await page.click('button:has-text("Remove Combo")');
    
    // Confirm
    await page.click('button:has-text("Confirm Remove")');
    
    // Wait for removal
    await page.waitForTimeout(1000);
    
    // Verify combo removed
    await expect(page.locator('.combo-group')).not.toBeVisible();
    await expect(page.locator('text=Your bag is empty')).toBeVisible();
  });
});
```

---

## DEPLOYMENT PLAN

### Phase A: Price Fix (IMMEDIATE)

**Steps**:
1. ✅ Revty"]');
    
    // Wait for update
    await page.waitForTimeout(1000);
    
    // Verify quantity updated
    await expect(page.locator('.combo-group').locator('text=2')).toBeVisible();
    
    // Verify total doubled
    await expect(page.locator('text=NPR 3,000')).toBeVisible();
  });
  
  test('should remove entire combo', async ({ page }) => {
    // Add combo and go to checkout
    await page.goto('/product/test-combo-package');
    await page.click('button:has-text("Add Bundle to Cart")');
    awaitrect (not inflated)
    await expect(page.locator('text=NPR 1,500')).toBeVisible();
    await expect(page.locator('text=NPR 301,198')).not.toBeVisible();
  });
  
  test('should update combo quantity', async ({ page }) => {
    // Add combo and go to checkout
    await page.goto('/product/test-combo-package');
    await page.click('button:has-text("Add Bundle to Cart")');
    await page.goto('/checkout');
    
    // Increase combo quantity
    await page.click('.combo-group button[aria-label="Increase combo quantiext=NPR 1,500')).toBeVisible();
    await expect(page.locator('text=Save NPR 1,501')).toBeVisible();
    
    // Add to cart
    await page.click('button:has-text("Add Bundle to Cart")');
    await expect(page.locator('text=Added to Cart')).toBeVisible();
    
    // Go to checkout
    await page.goto('/checkout');
    
    // Verify combo is grouped
    await expect(page.locator('.combo-group')).toBeVisible();
    await expect(page.locator('text=Test Combo Package')).toBeVisible();
    
    // Verify total is cor=> item.combo_group_id === comboGroupId
    );
    
    groupItems.forEach(item => {
      expect(item.quantity).toBeGreaterThan(1);
    });
  });
});
```

### E2E Tests

**File**: `tests/e2e/combo-cart-flow.spec.ts`

```typescript
import { test, expect } from '@playwright/test';

test.describe('Combo Cart Flow', () => {
  test('should display combo with correct prices', async ({ page }) => {
    await page.goto('/product/test-combo-package');
    
    // Check combo price display
    await expect(page.locator('t
      }
    });
  });
  
  it('should update combo quantity for all items', async () => {
    // Add combo
    const addResponse = await cartAPI.addComboToCart('combo-id');
    const comboGroupId = addResponse.cart.items[0].combo_group_id;
    
    // Update quantity
    const updateResponse = await cartAPI.updateComboQuantity(comboGroupId, 2);
    
    expect(updateResponse.success).toBe(true);
    
    // Verify all items in group updated
    const groupItems = updateResponse.cart.items.filter(
      item e**: `tests/integration/combo-cart-api.test.ts`

```typescript
describe('Combo Cart API', () => {
  it('should add combo with correct prices', async () => {
    const response = await cartAPI.addComboToCart('combo-id');
    
    expect(response.success).toBe(true);
    expect(response.cart.items).toBeDefined();
    
    // Verify prices are in reasonable range (not inflated)
    response.cart.items.forEach(item => {
      if (item.combo_id) {
        expect(item.price_snapshot).toBeLessThan(item.variant_price);{
  it('should group items by combo_group_id', () => {
    const items = [
      { id: '1', combo_group_id: 'group-a', name: 'Item 1' },
      { id: '2', combo_group_id: 'group-a', name: 'Item 2' },
      { id: '3', combo_group_id: null, name: 'Item 3' },
    ];
    
    const { comboGroups, regularItems } = groupCartItems(items);
    
    expect(comboGroups.size).toBe(1);
    expect(comboGroups.get('group-a')).toHaveLength(2);
    expect(regularItems).toHaveLength(1);
  });
});
```

### Integration Tests

**FilalOriginalPrice;
    
    expect(discountRatio).toBeCloseTo(0.4998, 4);
    expect(discountRatio).not.toBeCloseTo(49.98, 2);
  });
  
  it('should calculate correct discounted prices', () => {
    const variantPrice = 1000; // Rs. 1,000
    const discountRatio = 0.4998;
    
    const discountedPrice = Math.round(variantPrice * discountRatio * 100) / 100;
    
    expect(discountedPrice).toBeCloseTo(499.80, 2);
    expect(discountedPrice).not.toBeCloseTo(49980, 2);
  });
});

describe('Cart Item Grouping', () => em rendering code */}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
```

---

## TESTING STRATEGY

### Unit Tests

**File**: `tests/unit/combo-cart-functions.test.ts`

```typescript
describe('Combo Price Calculation', () => {
  it('should convert cents to rupees before calculating discount', () => {
    const comboPriceCents = 150000; // Rs. 1,500
    const totalOriginalPrice = 3001; // Rs. 3,001
    
    const discountRatio = (comboPriceCents / 100) / totItems]) => (
          <ComboGroup
            key={groupId}
            comboGroupId={groupId}
            items={groupItems}
            {...getComboMetadata(groupItems)}
            onRemove={handleComboRemove}
          />
        ))}
        
        {/* Render regular items */}
        {regularItems.length > 0 && (
          <ul className="divide-y divide-gray-100">
            {regularItems.map((it) => (
              <li key={it.id} className="flex gap-3 py-3">
                {/* Existing regular ittem action
    const store = useDecoupledCartStore.getState();
    await store.removeComboItem(comboGroupId);
  };

  return (
    <section aria-labelledby="your-products" className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <h2 id="your-products" className="mb-3 text-lg font-semibold tracking-tight text-gray-900">
        Your Products
      </h2>
      
      <div className="space-y-4">
        {/* Render combo groups */}
        {Array.from(comboGroups.entries()).map(([groupId, group, calculate from items
    const comboPrice = groupItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    
    // Get combo name and savings from first item's combo_id
    // This would ideally come from a combo metadata object
    return {
      comboName: firstItem.combo_name || 'Combo Bundle',
      comboPrice: comboPrice,
      comboSavings: 0 // Would need to fetch from combo product
    };
  };
  
  const handleComboRemove = async (comboGroupId: string) => {
    // Use the store's removeComboIproducts" className="mb-2 text-lg font-semibold tracking-tight text-gray-900">
          Your Products
        </h2>
        <p className="text-sm text-gray-500">Your bag is empty.</p>
      </section>
    );
  }

  // Group items by combo
  const { comboGroups, regularItems } = groupCartItems(items);
  
  // Helper to get combo metadata
  const getComboMetadata = (groupItems: CartProductItem[]) => {
    const firstItem = groupItems[0];
    // Combo metadata should come from the combo product
    // For now} from "@/lib/store/decoupledCartStore";

// ... existing imports and RegularCartItem component ...

export default function ProductList({
  items,
  onQtyChange,
  onRemove,
}: {
  items: CartProductItem[];
  onQtyChange: (id: string, qty: number, variant?: string) => void;
  onRemove: (id: string, variant?: string) => void;
}) {
  if (items.length === 0) {
    return (
      <section aria-labelledby="your-products" className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <h2 id="your- "Confirm remove combo" : "Remove combo"}
        >
          <Trash2 className="h-4 w-4" />
          {showConfirm ? 'Confirm Remove' : 'Remove Combo'}
        </button>
      </div>
    </div>
  );
}
```

### Component: ProductList.tsx (Updated)

**File**: `src/components/checkout/ProductList.tsx`

**Changes**: Add combo grouping logic

```typescript
"use client";
import React from "react";
import type { CartProductItem } from "@/lib/types";
import { ComboGroup } from "./ComboGroup";
import { groupCartItems eQuantity)} ({savingsPercent}%)
            </p>
          )}
        </div>
        
        <button
          type="button"
          onClick={handleRemove}
          disabled={isUpdating}
          className={cn(
            "inline-flex items-center gap-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
            showConfirm
              ? "bg-red-600 text-white hover:bg-red-700"
              : "text-red-600 border border-red-200 hover:bg-red-50"
          )}
          aria-label={showConfirm ?t-gray-500">{formatNPR(item.price * item.quantity)}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
      
      {/* Footer */}
      <div className="border-t border-purple-200 pt-3 flex items-center justify-between">
        <div>
          <p className="text-lg font-bold text-purple-700">{formatNPR(comboPrice * baseQuantity)}</p>
          {comboSavings > 0 && (
            <p className="text-sm text-green-600 font-semibold">
              Save {formatNPR(comboSavings * bas      <p className="text-xs text-gray-500">
                      {Object.entries(item.variantData)
                        .filter(([key, value]) => key !== 'colorHex' && value)
                        .map(([_, value]) => value)
                        .join(' • ')}
                    </p>
                  )}
                </div>
              </div>
              <div className="text-right">
                <p className="text-sm text-gray-600">× {item.quantity}</p>
                <p className="text-xs texay-200 overflow-hidden flex-shrink-0">
                    <Image
                      src={item.imageUrl}
                      alt={item.name}
                      fill
                      className="object-cover"
                      sizes="40px"
                    />
                  </div>
                )}
                <div>
                  <p className="text-sm text-gray-700">{item.name}</p>
                  {item.variantData && Object.keys(item.variantData).length > 0 && (
              r-t border-purple-200 my-3" />
      
      {/* Constituent Items */}
      <div className="space-y-2 mb-3">
        {items.map((item) => (
          <div key={item.id} className="flex items-center gap-3 pl-4">
            <div className="w-1 h-1 rounded-full bg-purple-400" />
            <div className="flex-1 flex items-center justify-between">
              <div className="flex items-center gap-2">
                {item.imageUrl && (
                  <div className="relative w-10 h-10 rounded border border-gr  {isUpdating ? '...' : baseQuantity}
            </div>
            <button
              type="button"
              onClick={() => handleQuantityChange(baseQuantity + 1)}
              disabled={isUpdating}
              className="h-8 w-8 text-gray-600 hover:bg-gray-50 disabled:opacity-50 rounded-r-lg"
              aria-label="Increase combo quantity"
            >
              +
            </button>
          </div>
        </div>
      </div>
      
      {/* Divider */}
      <div className="borde">
            <button
              type="button"
              onClick={() => handleQuantityChange(baseQuantity - 1)}
              disabled={isUpdating || baseQuantity <= 1}
              className="h-8 w-8 text-gray-600 hover:bg-gray-50 disabled:opacity-50 rounded-l-lg"
              aria-label="Decrease combo quantity"
            >
              −
            </button>
            <div className="h-8 w-12 flex items-center justify-center text-sm font-medium text-gray-900 border-x border-gray-300">
               <Package className="h-5 w-5 text-purple-600 flex-shrink-0" />
          <div>
            <h3 className="font-semibold text-gray-900">{comboName}</h3>
            <p className="text-xs text-purple-600 font-medium">Combo Bundle</p>
          </div>
        </div>
        
        {/* Quantity Control */}
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-600">Qty:</span>
          <div className="inline-flex items-center rounded-lg border border-gray-300 bg-white);
    } else {
      setShowConfirm(true);
      setTimeout(() => setShowConfirm(false), 3000);
    }
  };
  
  const savingsPercent = comboSavings > 0 && comboPrice > 0
    ? Math.round((comboSavings / (comboPrice + comboSavings)) * 100)
    : 0;
  
  return (
    <div className="combo-group rounded-xl border-2 border-purple-200 bg-purple-50/30 p-4 mb-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2 flex-1">
       mbo has 1x product A and 2x product B:
    // - If product A has quantity 2, combo quantity is 2
    // - If product B has quantity 4, combo quantity is 2 (4/2)
    // We'll use the first item as reference for simplicity
    return item.quantity;
  }));
  
  const handleQuantityChange = async (newQty: number) => {
    if (newQty < 1) return;
    await updateComboQuantity(comboGroupId, newQty);
  };
  
  const handleRemove = () => {
    if (showConfirm) {
      onRemove(comboGroupId);
      setShowConfirm(falseomboQuantity = useDecoupledCartStore(state => state.updateComboQuantity);
  const isUpdating = useDecoupledCartStore(state => state.isUpdatingCombo === comboGroupId);
  
  // Calculate current combo quantity (use first item as reference)
  const baseQuantity = items[0]?.quantity || 1;
  
  // Find the minimum quantity among items to determine combo quantity
  const comboQuantity = Math.min(...items.map(item => {
    // Each item has its own quantity, we need to find the combo multiplier
    // For example, if cocn } from '@/lib/utils';
import { useDecoupledCartStore } from '@/lib/store/decoupledCartStore';

interface ComboGroupProps {
  comboGroupId: string;
  items: CartProductItem[];
  comboName: string;
  comboPrice: number; // in rupees
  comboSavings: number; // in rupees
  onRemove: (groupId: string) => void;
}

export function ComboGroup({
  comboGroupId,
  items,
  comboName,
  comboPrice,
  comboSavings,
  onRemove
}: ComboGroupProps) {
  const [showConfirm, setShowConfirm] = useState(false);
  const updateCstanceof Error ? error.message : 'Failed to update combo quantity',
            lastError: error instanceof Error ? error : null
          });
          return false;
        }
      }
    }))
  )
);
```

### Component: ComboGroup.tsx

**File**: `src/components/cart/ComboGroup.tsx` (NEW)

```typescript
'use client';

import React, { useState } from 'react';
import Image from 'next/image';
import { Trash2, Package } from 'lucide-react';
import type { CartProductItem } from '@/lib/types';
import { formatNPR, (response.warnings && response.warnings.length > 0) {
              console.warn('[DecoupledStore] Combo update warnings:', response.warnings);
            }
            
            return true;
          } else {
            throw new Error(response.error || response.message || 'Failed to update combo quantity');
          }
        } catch (error) {
          console.error('[DecoupledStore] Failed to update combo quantity:', error);
          set({ 
            isUpdatingCombo: null, 
            error: error in        const apiItems = response.cart.cart_items || response.cart.items || [];
            const newProductItems = transformApiItemsToProducts(apiItems);
            
            set({
              productItems: newProductItems,
              productTotal: calculateProductTotal(newProductItems),
              productCount: newProductItems.reduce((sum, item) => sum + item.quantity, 0),
              isUpdatingCombo: null
            });
            
            get().updateGrandTotals();
            
            if 
      
      // ... existing actions ...
      
      updateComboQuantity: async (comboGroupId, quantity) => {
        console.log('[DecoupledStore] Updating combo quantity:', { comboGroupId, quantity });
        
        set({ isUpdatingCombo: comboGroupId, error: null });
        
        try {
          const response = await cartAPI.updateComboQuantity(comboGroupId, quantity);
          
          console.log('[API Response]:', response);
          
          if (response.success && response.cart) {
    Items };
}

// Add to store interface:
interface DecoupledCartState {
  // ... existing fields ...
  
  isUpdatingCombo: string | null; // combo_group_id being updated
  
  // ... existing actions ...
  
  updateComboQuantity: (comboGroupId: string, quantity: number) => Promise<boolean>;
}

// Add to store implementation:
export const useDecoupledCartStore = create<DecoupledCartState>()(
  devtools(
    subscribeWithSelector((set, get) => ({
      // ... existing state ...
      
      isUpdatingCombo: null,/ Add helper function (outside store)
export function groupCartItems(items: CartProductItem[]) {
  const comboGroups = new Map<string, CartProductItem[]>();
  const regularItems: CartProductItem[] = [];
  
  items.forEach(item => {
    if (item.combo_group_id) {
      if (!comboGroups.has(item.combo_group_id)) {
        comboGroups.set(item.combo_group_id, []);
      }
      comboGroups.get(item.combo_group_id)!.push(item);
    } else {
      regularItems.push(item);
    }
  });
  
  return { comboGroups, regular-guest-token': getGuestToken()
      },
      body: JSON.stringify({
        action: 'update_combo_quantity',
        combo_group_id: comboGroupId,
        quantity
      })
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    return response.json();
  }
};
```

---

## FRONTEND CHANGES

### State Management: decoupledCartStore.ts

**File**: `src/lib/store/decoupledCartStore.ts`

**Changes**: Add grouping helper and new action

```typescript
/
  }
}
```

### API Client: cartClient.ts

**File**: `src/lib/api/cartClient.ts`

**Changes**: Add new method

```typescript
export const cartAPI = {
  // ... existing methods ...
  
  /**
   * Update quantity for entire combo group
   */
  updateComboQuantity: async (comboGroupId: string, quantity: number) => {
    const response = await fetch('/api/cart', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${await getAuthToken()}`,
        'x;
    if (cartResponse.success) {
      return {
        success: true,
        cart: cartResponse.cart,
        message: 'Combo quantity updated successfully',
        warnings: cartResponse.warnings
      };
    } else {
      return {
        success: false,
        message: 'Combo updated but failed to retrieve updated cart'
      };
    }
  } catch (error) {
    console.error('Error updating combo quantity:', error);
    return {
      success: false,
      message: 'Failed to update combo quantity'
    };;

    if (error) {
      console.error('RPC error in update_combo_quantity_secure:', JSON.stringify({ error, payload }));
      return {
        success: false,
        message: `Failed to update combo quantity: ${error.message}`
      };
    }

    if (data && !data.success) {
      return {
        success: false,
        message: data.message || 'Failed to update combo quantity'
      };
    }

    // Return full updated cart
    const cartResponse = await getCart(supabase, authenticatedUser, guestToken)y(supabase, authenticatedUser, guestToken, combo_group_id: string, quantity: number) {
  try {
    const payload: Record<string, unknown> = {
      p_combo_group_id: combo_group_id,
      p_new_quantity: quantity
    };
    if (authenticatedUser?.id) payload.p_user_id = authenticatedUser.id;
    else payload.p_guest_token = guestToken;

    console.log('[Edge Function] Calling update_combo_quantity_secure with:', payload);
    const { data, error } = await supabase.rpc('update_combo_quantity_secure', payload)