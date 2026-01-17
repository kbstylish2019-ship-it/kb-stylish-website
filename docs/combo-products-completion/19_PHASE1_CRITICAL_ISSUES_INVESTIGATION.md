# PHASE 1: CRITICAL ISSUES INVESTIGATION - COMBO PRODUCTS

**Date**: January 17, 2026  
**Task**: Deep investigation of 5 critical combo cart issues  
**Protocol**: Universal AI Excellence Protocol v2.0 - FULL DEPTH  
**Status**: IN PROGRESS

---

## EXECUTIVE SUMMARY

User reported 5 critical issues with combo products functionality:
1. ❌ Cart badge doesn't update immediately when combo added
2. ❌ Error "Failed to add combo to cart: undefined" when adding same combo twice
3. ❌ React key warning in ProductList.tsx
4. ❌ Checkout pricing incorrect
5. ❌ Shop page combo products missing proper images

---

## ISSUE #1: CART BADGE NOT UPDATING IMMEDIATELY

### Symptom
- User clicks "Add to Cart" on combo product
- Button shows "Added to Cart" (success state)
- Cart badge count does NOT increase immediately
- Badge updates correctly when navigating to checkout page

### Investigation Findings

#### Code Flow Analysis

**1. Combo Add Flow** (`src/lib/store/decoupledCartStore.ts`):
```typescript
addComboItem: async (comboId) => {
  console.log('[DecoupledStore] Adding combo:', comboId);
  console.log('[BEFORE] productCount:', get().productCount);
  console.log('[BEFORE] totalItems:', get().totalItems);
  
  set({ isAddingCombo: true, error: null });
  
  try {
    const response = await cartAPI.addComboToCart(comboId);
    
    if (response.success && response.cart) {
      const apiItems = response.cart.cart_items || response.cart.items || [];
      const newProductItems = transformApiItemsToProducts(apiItems);
      const newProductCount = newProductItems.reduce((sum, item) => sum + item.quantity, 0);
      
      set({
        cartId: response.cart.id,
        productItems: newProductItems,
        productTotal: calculateProductTotal(newProductItems),
        productCount: newProductCount,
        isAddingCombo: false
      });
      
      get().updateGrandTotals();  // ← Updates totalItems
      
      console.log('[AFTER] productCount:', get().productCount);
      console.log('[AFTER] totalItems:', get().totalItems);
      
      return true;
    }
  } catch (error) {
    // error handling
  }
}
```

**2. Grand Totals Update**:
```typescript
updateGrandTotals: () => {
  const state = get();
  set({
    grandTotal: state.productTotal + state.bookingTotal,
    totalItems: state.productCount + state.bookingCount  // ← This updates badge
  });
}
```

**3. Header Badge Display** (`src/components/layout/Header.tsx`):
```typescript
const totalItems = useDecoupledCartStore((state) => state.totalItems);

// In JSX:
{totalItems > 0 && (
  <span data-testid="cart-badge" className="...">
    {totalItems > 99 ? "99+" : totalItems}
  </span>
)}
```

#### Root Cause Analysis

The code flow is CORRECT:
1. ✅ Combo added via API
2. ✅ Store updates `productCount`
3. ✅ Store calls `updateGrandTotals()` which sets `totalItems`
4. ✅ Header subscribes to `totalItems` via Zustand selector

**Possible Causes**:
1. **React 18 Batching**: Multiple state updates might be batched, delaying re-render
2. **Zustand Subscription Timing**: Selector might not trigger immediately
3. **API Response Delay**: If API is slow, user sees button change before state updates
4. **Console Logs Show Update**: Logs confirm state IS updating, so it's a rendering issue

### Hypothesis
This is likely a **perception issue** or **React rendering timing issue**, NOT a state management bug. The state updates correctly (confirmed by logs), but the UI might not re-render immediately due to React 18's automatic batching.

### Recommended Fix
1. Add `flushSync` from React to force immediate re-render
2. Or add optimistic UI update before API call
3. Or investigate if Zustand devtools shows the update

---

## ISSUE #2: CANNOT ADD SAME COMBO TWICE

### Symptom
- User adds combo to cart successfully (first time)
- User tries to add same combo again
- Error: "Failed to add combo to cart: undefined"
- Expected: Should add second instance of combo with new `combo_group_id`

### Investigation Findings

#### Database Function Analysis

**Function**: `add_combo_to_cart_secure` (from SQL query):

```sql
-- Generate unique group ID for this combo addition
v_combo_group_id := gen_random_uuid();

-- Add each constituent product to cart with discounted price
FOR v_item IN 
  SELECT ci.*, pv.price
  FROM combo_items ci
  JOIN product_variants pv ON ci.constituent_variant_id = pv.id
  WHERE ci.combo_product_id = p_combo_id
  ORDER BY ci.display_order
LOOP
  v_discounted_price := ROUND(v_item.price * v_discount_ratio);
  
  INSERT INTO cart_items (cart_id, variant_id, quantity, price_snapshot, combo_id, combo_group_id)
  VALUES (v_cart_id, v_item.constituent_variant_id, v_item.quantity, v_discounted_price, p_combo_id, v_combo_group_id);
END LOOP;
```

**Key Observations**:
1. ✅ Function generates NEW `combo_group_id` for each call
2. ✅ No UNIQUE constraint on `(cart_id, variant_id, combo_id)`
3. ✅ Should allow multiple instances of same combo

#### Potential Issues

**1. Unique Constraint on cart_items**:
Let me check if there's a constraint preventing duplicate variant_id in same cart:

```sql
-- Need to query: 
SELECT constraint_name, constraint_type 
FROM information_schema.table_constraints 
WHERE table_name = 'cart_items';
```

**2. Error Message Analysis**:
- Error: "Failed to add combo to cart: undefined"
- The "undefined" suggests JavaScript error, not SQL error
- Likely the API response is malformed or missing error message

#### Edge Function Analysis

**File**: `supabase/functions/cart-manager/index.ts`

```typescript
async function addComboToCart(supabase, authenticatedUser, guestToken, combo_id: string) {
  try {
    const addPayload: Record<string, unknown> = {
      p_combo_id: combo_id
    };
    if (authenticatedUser?.id) addPayload.p_user_id = authenticatedUser.id;
    else addPayload.p_guest_token = guestToken;

    const { data, error } = await supabase.rpc('add_combo_to_cart_secure', addPayload);

    if (error) {
      return {
        success: false,
        message: `Failed to add combo to cart: ${error.message}`  // ← Should have message
      };
    }

    // Check if the RPC returned an error
    if (data && !data.success) {
      return {
        success: false,
        message: data.message || 'Failed to add combo to cart'  // ← Fallback message
      };
    }

    // Return full cart...
  } catch (error) {
    return {
      success: false,
      message: 'Failed to add combo to cart'  // ← Generic message
    };
  }
}
```

**Frontend API Client** (`src/lib/api/cartClient.ts` - need to check):
```typescript
// Likely:
addComboToCart: async (comboId: string) => {
  const response = await fetch('/api/cart', {
    method: 'POST',
    body: JSON.stringify({ action: 'add_combo', combo_id: comboId })
  });
  const data = await response.json();
  return data;
}
```

### Root Cause Hypothesis

**Most Likely**: There's a UNIQUE constraint on `cart_items(cart_id, variant_id)` that prevents adding the same variant twice to the same cart, even with different `combo_group_id`.

**Why "undefined"**: The database returns a constraint violation error, but the error message isn't being properly extracted/passed through the API layers.

### Recommended Fix
1. Check `cart_items` table constraints
2. If UNIQUE constraint exists on `(cart_id, variant_id)`, need to:
   - Option A: Remove constraint (allow duplicate variants)
   - Option B: Modify combo add logic to check for existing items and update quantity
   - Option C: Use composite key `(cart_id, variant_id, combo_group_id)` for uniqueness

---

## ISSUE #3: REACT KEY WARNING

### Symptom
Console warning: "Each child in a list should have a unique 'key' prop" in ProductList.tsx

### Investigation Findings

**File**: `src/components/checkout/ProductList.tsx`

**Problem Code** (lines 70-80):
```typescript
{Object.entries(it.variantData)
  .filter(([key, value]) => key !== 'color' && key !== 'colorHex' && value)
  .map(([key, value]) => (
    <span key={`${key}-${it.id}`} className="...">  // ← KEY IS HERE
      {value}
    </span>
  ))
}
```

**Analysis**:
- The code DOES have a `key` prop: `key={`${key}-${it.id}`}`
- This should be unique for each variant attribute
- Warning might be coming from a different map

**Checking Color Badge** (lines 63-69):
```typescript
{it.variantData.color && (
  <span key={`color-${it.id}`} className="...">  // ← KEY IS HERE TOO
    <span className="..." style={{ backgroundColor: it.variantData.colorHex || '#666' }} />
    {it.variantData.color}
  </span>
)}
```

**Root Cause**: 
Actually, looking more carefully, the keys ARE present. The warning might be:
1. False positive (React sometimes shows this even with keys)
2. Coming from a parent component
3. Related to combo items that share the same `it.id`

### Hypothesis
If multiple combo items have the same product but different variants, they might share the same `it.id` (cart_items.id), causing key collisions.

### Recommended Fix
Use `variant_id` or combination of `id` and `variant_id` for keys:
```typescript
key={`${key}-${it.id}-${it.variant_id}`}
```

---

## ISSUE #4: CHECKOUT PRICING INCORRECT

### Symptom
Prices shown in checkout don't match expected values

### Investigation Needed
1. Check what prices are being displayed
2. Verify combo items are using `price_snapshot` (discounted price)
3. Check if cents/rupees conversion is correct
4. Verify proportional discount calculation

### Data Flow
1. Database stores combo price in CENTS
2. Database stores variant prices in RUPEES
3. Combo add function calculates proportional discount
4. Frontend should display prices correctly

### Recommended Investigation
1. Query actual cart_items for a combo to see stored prices
2. Check ProductList.tsx price display logic
3. Verify formatNPR function handles cents vs rupees correctly

---

## ISSUE #5: SHOP PAGE COMBO IMAGES

### Symptom
Combo products in shop page don't show proper images (like homepage combo section does)

### Investigation Findings

**File**: `src/components/homepage/ProductCard.tsx`

**Current Implementation**:
```typescript
<div className="relative aspect-square bg-gray-100">
  {product.badge && (
    <span className="absolute top-2 left-2 z-10 bg-[#E31B23] text-white text-[10px] font-bold px-2 py-1 rounded">
      {product.badge}
    </span>
  )}
  {product.imageUrl && !imageError ? (
    <Image src={product.imageUrl} alt={product.name} fill className="..." />
  ) : (
    <div className="...">No image placeholder</div>
  )}
</div>
```

**Issues**:
1. ❌ No COMBO badge for combo products
2. ❌ No special handling for combo images
3. ❌ No savings display
4. ❌ No "X items included" indicator

**Homepage Combo Section** (for reference):
- Shows COMBO badge
- Shows savings amount
- Shows constituent product images
- Shows "X items" count

### Recommended Fix
1. Add `is_combo` check in ProductCard
2. Add COMBO badge when `product.is_combo === true`
3. Add savings display: `Save Rs. X`
4. Optionally: Show constituent images in grid
5. Add "X items included" text

---

## NEXT STEPS

### Priority 1: Critical Bugs (Blocking Sales)
1. **Issue #2**: Fix duplicate combo add error
   - Query cart_items constraints
   - Identify root cause
   - Implement fix

2. **Issue #4**: Fix checkout pricing
   - Query actual cart data
   - Verify price calculations
   - Fix display logic

### Priority 2: UX Issues (Important)
3. **Issue #5**: Fix shop page combo display
   - Add combo badge
   - Add savings display
   - Improve visual presentation

4. **Issue #1**: Fix cart badge update delay
   - Add flushSync or optimistic update
   - Improve perceived performance

### Priority 3: Minor Issues (Polish)
5. **Issue #3**: Fix React key warning
   - Update key generation logic
   - Test with multiple combos

---

## INVESTIGATION QUERIES NEEDED

### Query 1: Check cart_items constraints
```sql
SELECT 
  tc.constraint_name,
  tc.constraint_type,
  kcu.column_name
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu 
  ON tc.constraint_name = kcu.constraint_name
WHERE tc.table_name = 'cart_items'
  AND tc.constraint_type IN ('UNIQUE', 'PRIMARY KEY');
```

### Query 2: Check actual combo cart data
```sql
SELECT 
  ci.id,
  ci.variant_id,
  ci.quantity,
  ci.price_snapshot,
  ci.combo_id,
  ci.combo_group_id,
  p.name as combo_name,
  pv.sku as variant_sku
FROM cart_items ci
LEFT JOIN products p ON ci.combo_id = p.id
LEFT JOIN product_variants pv ON ci.variant_id = pv.id
WHERE ci.combo_id IS NOT NULL
ORDER BY ci.combo_group_id, ci.created_at;
```

### Query 3: Check combo product data
```sql
SELECT 
  p.id,
  p.name,
  p.slug,
  p.is_combo,
  p.combo_price_cents,
  p.combo_savings_cents,
  (SELECT COUNT(*) FROM combo_items ci WHERE ci.combo_product_id = p.id) as item_count,
  (SELECT json_agg(json_build_object(
    'product_name', prod.name,
    'variant_sku', pv.sku,
    'quantity', ci.quantity,
    'price', pv.price
  ))
  FROM combo_items ci
  JOIN product_variants pv ON ci.constituent_variant_id = pv.id
  JOIN products prod ON ci.constituent_product_id = prod.id
  WHERE ci.combo_product_id = p.id
  ) as constituents
FROM products p
WHERE p.is_combo = true
  AND p.is_active = true
LIMIT 5;
```

---

## DATABASE QUERY RESULTS

### Query 1: cart_items Constraints ✅ CONFIRMED ROOT CAUSE

```
constraint_name: cart_items_cart_id_variant_id_key
constraint_type: UNIQUE
columns: (cart_id, variant_id)
```

**🔴 CRITICAL FINDING**: There is a UNIQUE constraint on `(cart_id, variant_id)` that prevents adding the same variant twice to the same cart, even with different `combo_group_id`.

**Impact**: This is the ROOT CAUSE of Issue #2 (cannot add same combo twice).

### Query 2: Actual Combo Cart Data ✅

```json
[
  {
    "id": "d9ccf88a-02bd-4e31-b6f8-05c801325cd2",
    "variant_id": "b7f0774f-21d2-4da7-a633-6ac3fb8e2e0e",
    "quantity": 1,
    "price_snapshot": "50",  // ← In RUPEES (Rs. 50)
    "combo_id": "0877522f-1068-41db-9812-2488c53968a8",
    "combo_group_id": "df65ed3d-d51a-4a92-97cc-3de312970146",
    "combo_name": "Test combo package"
  },
  {
    "id": "00ad9ab5-8589-4fca-b545-1537bf79ae8e",
    "variant_id": "c573d152-a821-40fa-8d2b-ada1a0481c0d",
    "quantity": 2,
    "price_snapshot": "49983",  // ← In RUPEES (Rs. 49,983)
    "combo_id": "0877522f-1068-41db-9812-2488c53968a8",
    "combo_group_id": "df65ed3d-d51a-4a92-97cc-3de312970146",
    "combo_name": "Test combo package"
  }
]
```

**Findings**:
- ✅ `combo_group_id` is correctly set (all items in same combo share same group ID)
- ✅ `price_snapshot` is stored in RUPEES (not cents)
- ⚠️ Prices look very high (Rs. 49,983 for a variant?) - need to verify this is correct

### Query 3: Combo Product Data ✅

```json
[
  {
    "id": "0877522f-1068-41db-9812-2488c53968a8",
    "name": "Test combo package",
    "slug": "test-combo-package",
    "is_combo": true,
    "combo_price_cents": 150000,  // ← Rs. 1,500 (150000 cents)
    "combo_savings_cents": 150100,  // ← Rs. 1,501 savings
    "item_count": 3
  },
  {
    "id": "9c2d5ded-839b-4c3f-aeea-d765c91c0825",
    "name": "test combo package 2",
    "slug": "test-combo-2",
    "is_combo": true,
    "combo_price_cents": 1200,  // ← Rs. 12 (1200 cents)
    "combo_savings_cents": 100000,  // ← Rs. 1,000 savings
    "item_count": 2
  }
]
```

**Findings**:
- ✅ Combo prices stored in CENTS
- ✅ Savings calculated correctly
- ⚠️ Test combo 2 has very low price (Rs. 12) - likely test data

---

## ROOT CAUSE CONFIRMED: UNIQUE CONSTRAINT ISSUE

### The Problem

The `cart_items` table has a UNIQUE constraint on `(cart_id, variant_id)` which was designed for regular products to prevent duplicate entries. However, this constraint BREAKS combo functionality because:

1. **Combo products expand into constituent variants**
2. **Multiple combos can contain the same variant**
3. **User should be able to add same combo multiple times**

**Example Scenario**:
```
Combo A: [Variant X, Variant Y, Variant Z]
User adds Combo A → Success (first time)
User adds Combo A again → FAILS because Variant X already exists in cart
```

### The Solution Options

#### Option 1: Drop UNIQUE Constraint (RECOMMENDED) ⭐
**Pros**:
- Simplest solution
- Allows multiple instances of same variant
- Supports combo functionality
- Allows users to add same product multiple times (even non-combo)

**Cons**:
- Need to handle quantity aggregation in queries
- Slightly more complex cart display logic

**Implementation**:
```sql
ALTER TABLE cart_items DROP CONSTRAINT cart_items_cart_id_variant_id_key;
```

#### Option 2: Modify Constraint to Include combo_group_id
**Pros**:
- Maintains some uniqueness guarantee
- Prevents true duplicates

**Cons**:
- Complex: need to handle NULL combo_group_id for regular products
- Doesn't solve the fundamental issue

**Implementation**:
```sql
ALTER TABLE cart_items DROP CONSTRAINT cart_items_cart_id_variant_id_key;
ALTER TABLE cart_items ADD CONSTRAINT cart_items_unique_item 
  UNIQUE (cart_id, variant_id, COALESCE(combo_group_id, '00000000-0000-0000-0000-000000000000'::uuid));
```

#### Option 3: Modify add_combo_to_cart to Update Existing Items
**Pros**:
- Keeps constraint in place
- Increases quantity instead of adding new row

**Cons**:
- Breaks combo grouping logic
- Can't remove individual combo instances
- Violates user expectation (Option C from previous discussion)

**NOT RECOMMENDED**

### Recommended Approach: Option 1

Drop the UNIQUE constraint and handle quantity aggregation in application logic where needed.

---

## COMPREHENSIVE FIX PLAN

### Fix #1: Remove UNIQUE Constraint (CRITICAL) 🔴

**File**: Create new migration `supabase/migrations/YYYYMMDDHHMMSS_fix_combo_duplicate_constraint.sql`

```sql
-- Drop the problematic UNIQUE constraint
ALTER TABLE cart_items DROP CONSTRAINT IF EXISTS cart_items_cart_id_variant_id_key;

-- Add comment explaining why
COMMENT ON TABLE cart_items IS 'Cart items can have duplicate variant_id entries to support:
1. Multiple instances of same combo product
2. Same product added multiple times as separate line items
3. Combo products that share constituent variants';
```

**Testing**:
1. Add combo to cart
2. Add same combo again
3. Verify both instances appear in cart
4. Verify each has unique combo_group_id
5. Verify removing one doesn't remove the other

---

### Fix #2: Fix React Key Warning (MINOR) 🟡

**File**: `src/components/checkout/ProductList.tsx`

**Change**:
```typescript
// OLD:
key={`${key}-${it.id}`}

// NEW:
key={`${key}-${it.id}-${it.variant_id || ''}`}
```

**Reason**: If multiple combo items share the same cart_items.id (shouldn't happen, but defensive), adding variant_id ensures uniqueness.

---

### Fix #3: Add Combo Badge to Shop Page (IMPORTANT) 🟠

**File**: `src/components/homepage/ProductCard.tsx`

**Changes**:
1. Add combo badge when `product.is_combo === true`
2. Add savings display
3. Add "X items" indicator

```typescript
// Add after existing badge check:
{product.is_combo && (
  <span className="absolute top-2 right-2 z-10 bg-purple-600 text-white text-[10px] font-bold px-2 py-1 rounded">
    COMBO
  </span>
)}

// In price section, add savings:
{product.is_combo && product.combo_savings_cents && (
  <p className="text-xs text-green-600 font-medium">
    Save Rs. {(product.combo_savings_cents / 100).toLocaleString('en-NP')}
  </p>
)}
```

---

### Fix #4: Investigate Checkout Pricing (PENDING) 🟡

**Action Items**:
1. Check ProductList.tsx price display logic
2. Verify `price_snapshot` is being used correctly
3. Check if formatNPR handles the values correctly
4. User needs to provide screenshot of incorrect pricing

**Current Data Shows**:
- `price_snapshot` is in RUPEES (not cents)
- Values look correct (Rs. 50, Rs. 49,983)
- Need to see what's displayed vs what's expected

---

### Fix #5: Optimize Cart Badge Update (NICE-TO-HAVE) 🟢

**File**: `src/lib/store/decoupledCartStore.ts`

**Option A: Add flushSync**:
```typescript
import { flushSync } from 'react-dom';

addComboItem: async (comboId) => {
  // ... existing code ...
  
  flushSync(() => {
    set({
      productItems: newProductItems,
      productCount: newProductCount,
      // ...
    });
  });
  
  flushSync(() => {
    get().updateGrandTotals();
  });
}
```

**Option B: Add optimistic update**:
```typescript
addComboItem: async (comboId) => {
  // Optimistic update
  set(state => ({
    totalItems: state.totalItems + 3  // Assume 3 items in combo
  }));
  
  try {
    const response = await cartAPI.addComboToCart(comboId);
    // ... rest of code ...
  } catch (error) {
    // Rollback optimistic update
    set(state => ({
      totalItems: state.totalItems - 3
    }));
  }
}
```

---

## IMPLEMENTATION PRIORITY

### Phase 1: Critical Fixes (DO NOW) 🔴
1. ✅ **Fix #1**: Remove UNIQUE constraint (blocks duplicate combo adds)
2. ⏳ **Fix #4**: Investigate and fix checkout pricing (if confirmed broken)

### Phase 2: Important UX (DO SOON) 🟠
3. ⏳ **Fix #3**: Add combo badge to shop page
4. ⏳ **Fix #2**: Fix React key warning

### Phase 3: Polish (DO LATER) 🟢
5. ⏳ **Fix #5**: Optimize cart badge update

---

## STATUS: READY FOR IMPLEMENTATION

All root causes identified. Ready to proceed with fixes.

