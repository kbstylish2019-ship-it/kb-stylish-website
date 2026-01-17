# PHASE 1: ATOMIC CODEBASE IMMERSION - COMBO PRODUCTS FIX

**Date**: January 17, 2026  
**Task**: Fix combo products pricing, cart badge, product details, and quantity logic  
**Protocol**: Universal AI Excellence Protocol v2.0

---

## PROBLEM STATEMENT

### Issues Identified by User:
1. ✅ **WORKING**: Combo creation, combo section display, shop page, add to cart functionality
2. ❌ **BROKEN**: Cart badge number doesn't increase when combo added
3. ❌ **BROKEN**: Price display issues (cents vs price mismatch)
4. ❌ **BROKEN**: Product details page shows "Original Price: 0"
5. ❌ **BROKEN**: "What's Included" shows 0 items instead of 3
6. ❓ **UNCLEAR**: What image is used for combo deals section?
7. ❓ **CRITICAL LOGIC**: What happens when user increases/decreases combo product quantity in cart?
   - Combo pricing should only apply to the bundle quantity
   - Additional units should be charged at individual product prices

---

## 1.1 ARCHITECTURE DOCUMENTS REVIEW ✅ COMPLETE

### Documents Reviewed:
1. ✅ `00_MASTER_PROGRESS.md` - Combo feature completion status
2. ✅ `08_PHASE8_IMPLEMENTATION.md` - Implementation details
3. ✅ `10_PHASE10_BUG_FIXING.md` - Previous bug fixes
4. ✅ `11_PHASE11_CRITICAL_BUG_FIX.md` - Edit page database fix

### Key Findings:
- Combo creation, display, and add-to-cart backend logic is WORKING
- Database functions exist: `get_active_combos`, `get_product_with_variants`, `add_combo_to_cart_secure`
- Frontend components exist: `ComboDetailClient.tsx`, combo section on homepage
- Previous fixes addressed: duplicate imports, database query errors, variant attributes

---

## 1.2 CORE SYSTEMS MAPPING ✅ COMPLETE

### Cart System Architecture

#### Cart Store (`decoupledCartStore.ts`)
```typescript
// State Structure
{
  productItems: CartProductItem[],      // Regular products + combo constituents
  productCount: number,                  // Sum of all product quantities
  productTotal: number,                  // Sum of all product subtotals
  
  bookingItems: CartBookingItem[],       // Service bookings
  bookingCount: number,                  // Number of bookings
  bookingTotal: number,                  // Sum of booking prices
  
  totalItems: number,                    // productCount + bookingCount
  grandTotal: number,                    // productTotal + bookingTotal
  
  isAddingCombo: boolean,                // Loading state for combo add
  isRemovingCombo: string | null         // Combo group being removed
}
```

#### Cart Badge Display (`Header.tsx`)
```typescript
const totalItems = useDecoupledCartStore((state) => state.totalItems);

// Badge shows: totalItems = productCount + bookingCount
// productCount = sum of all item quantities in cart
```

#### Combo Add to Cart Flow
```
1. User clicks "Add to Cart" on combo detail page
2. ComboDetailClient calls: cartAPI.addComboToCart(combo.id)
3. cartAPI calls Edge Function: cart-manager with action='add_combo'
4. Edge Function calls: add_combo_to_cart_secure(p_combo_id, p_user_id/p_guest_token)
5. Database function expands combo into constituent cart_items
6. Edge Function returns updated cart with all items
7. Store transforms API response: transformApiItemsToProducts(apiItems)
8. Store updates: productItems, productCount, productTotal
9. Store calls: updateGrandTotals() → totalItems = productCount + bookingCount
10. Header re-renders with new totalItems
```

### Pricing System Architecture

#### Price Storage (Database)
- **Products**: `price` column in RUPEES (e.g., 1500.00)
- **Product Variants**: `price` column in RUPEES (e.g., 49.98)
- **Combos**: `combo_price_cents` column in CENTS (e.g., 150000 = Rs. 1,500)
- **Combos**: `combo_savings_cents` column in CENTS (e.g., 150100 = Rs. 1,501)

#### Price Display (Frontend)
- **ComboDetailClient**: Converts variant prices to cents for calculation
  ```typescript
  const originalPriceCents = constituents.reduce(
    (sum, item) => sum + ((item.variant?.price || 0) * 100) * item.quantity,
    0
  );
  ```
- **formatNPR()**: Expects RUPEES, formats as "Rs. X,XXX"
- **Cart Display**: Uses `price_snapshot` from cart_items (in RUPEES)

### Product Details Page Architecture

#### Route: `/product/[slug]/page.tsx`
```typescript
// Server Component
1. Fetches product data: get_product_with_variants(slug)
2. Detects combo: if (product.is_combo === true)
3. Transforms data:
   - combo: ComboProduct type
   - constituents: ComboItem[] type
4. Renders: <ComboDetailClient combo={combo} constituents={constituents} />
```

#### ComboDetailClient Component
```typescript
// Client Component
- Displays combo name, description, images
- Shows pricing: combo_price_cents, originalPriceCents, savings
- Lists constituents with "What's Included" section
- Handles add to cart via cartAPI.addComboToCart()
```

---

## 1.3 EXISTING PATTERNS IDENTIFIED ✅ COMPLETE

### Naming Conventions
- Database functions: `snake_case` (e.g., `add_combo_to_cart_secure`)
- TypeScript interfaces: `PascalCase` (e.g., `ComboProduct`, `CartProductItem`)
- Component files: `PascalCase.tsx` (e.g., `ComboDetailClient.tsx`)
- Store files: `camelCase.ts` (e.g., `decoupledCartStore.ts`)

### Error Handling Patterns
```typescript
// Store pattern
try {
  const response = await cartAPI.someAction();
  if (response.success && response.cart) {
    // Update state
  } else {
    throw new Error(response.error || 'Failed to...');
  }
} catch (error) {
  console.error('[Store] Error:', error);
  set({ error: error.message, isLoading: false });
  return false;
}
```

### Cart API Response Pattern
```typescript
{
  success: boolean,
  cart?: {
    id: string,
    cart_items: CartItem[],  // or items: CartItem[]
    subtotal: number,
    item_count: number       // or total_items: number
  },
  error?: string,
  warnings?: string[]
}
```

### Price Conversion Pattern
```typescript
// Database stores in CENTS for combos
// Frontend displays in RUPEES
// Conversion: cents / 100 = rupees
// Reverse: rupees * 100 = cents
```

---

## 1.4 RELATED CODE SEARCH ✅ COMPLETE

### Combo-Related Files Found
1. **Database Functions** (migrations):
   - `create_get_active_combos_function`
   - `extend_get_product_with_variants_for_combos`
   - `add_combo_to_cart_secure` (not in migrations, likely in earlier work)

2. **Frontend Components**:
   - `src/components/product/ComboDetailClient.tsx`
   - `src/components/vendor/ComboEditForm.tsx`
   - `src/app/product/[slug]/page.tsx`
   - `src/app/page.tsx` (homepage combo section)

3. **API/Store Files**:
   - `src/lib/store/decoupledCartStore.ts`
   - `src/lib/api/cartClient.ts`
   - `supabase/functions/cart-manager/index.ts`

4. **Type Definitions**:
   - `src/types/combo.ts`

---

## 1.5 LIVE DATABASE VERIFICATION ✅ ATTEMPTED

**Status**: Unable to access live database via MCP (permission denied)
**Fallback**: Relying on migration files and previous documentation

**Known Database State** (from previous docs):
- Test combos exist: "Test combo package", "test combo package 2"
- Combo items properly linked with constituent products
- Database functions deployed and working

---

## 2. ATOMIC PROBLEM ANALYSIS

### Issue #1: Cart Badge Not Increasing ❌

**Symptom**: When combo is added to cart, the cart badge number doesn't increase

**Root Cause Hypothesis**:
1. **Possible**: `productCount` calculation issue in store
2. **Possible**: Cart API response not including combo items properly
3. **Possible**: `transformApiItemsToProducts()` not processing combo items
4. **Likely**: Store update not triggering `updateGrandTotals()`

**Evidence Needed**:
- Console logs from `addComboItem()` in store
- Cart API response structure after adding combo
- Value of `productCount` before/after combo add
- Value of `totalItems` before/after combo add

**Investigation Path**:
```typescript
// In decoupledCartStore.ts, addComboItem():
console.log('[BEFORE] productCount:', get().productCount);
console.log('[BEFORE] totalItems:', get().totalItems);
console.log('[API Response]:', response);
console.log('[Transformed Items]:', newProductItems);
console.log('[AFTER] productCount:', newProductItems.reduce(...));
console.log('[AFTER] totalItems:', get().totalItems);
```

---

### Issue #2: Price Display Issues (Cents vs Rupees) ❌

**Symptom**: Prices showing incorrectly, possibly as Rs. 0 or wrong values

**Root Cause Hypothesis**:
1. **Likely**: Mixing cents and rupees in calculations
2. **Possible**: `combo_price_cents` not being divided by 100 for display
3. **Possible**: Variant prices (in rupees) being treated as cents

**Evidence from Code**:
```typescript
// ComboDetailClient.tsx - CORRECT
const originalPriceCents = constituents.reduce(
  (sum, item) => sum + ((item.variant?.price || 0) * 100) * item.quantity,
  0
);
// Converts variant prices (rupees) to cents

// Display - CORRECT
{formatNPR(combo.combo_price_cents / 100)}
// Converts cents to rupees for display
```

**Potential Issue**: Shop page or other components not doing this conversion

---

### Issue #3: Product Details Page Shows "Original Price: 0" ❌

**Symptom**: Combo detail page shows original price as 0

**Root Cause Hypothesis**:
1. **Likely**: `constituents` array is empty or missing variant price data
2. **Possible**: `get_product_with_variants()` not returning combo_items properly
3. **Possible**: Data transformation losing variant price information

**Evidence Needed**:
- Value of `constituents` prop in ComboDetailClient
- Value of `originalPriceCents` calculation
- Database query result from `get_product_with_variants()`

**Investigation Path**:
```typescript
// In ComboDetailClient.tsx
console.log('[ComboDetail] constituents:', constituents);
console.log('[ComboDetail] originalPriceCents:', originalPriceCents);
constituents.forEach((item, i) => {
  console.log(`[Item ${i}]`, {
    name: item.product?.name,
    price: item.variant?.price,
    quantity: item.quantity
  });
});
```

---

### Issue #4: "What's Included" Shows 0 Items ❌

**Symptom**: Should show "3 items" but shows "0 items"

**Root Cause Hypothesis**:
1. **Certain**: `constituents.length` is 0
2. **Likely**: Data not being passed correctly from page.tsx to ComboDetailClient
3. **Possible**: Database query not returning combo_items

**Evidence Needed**:
- Value of `constituents` array length
- Database query result structure
- Data transformation in page.tsx

---

### Issue #5: Combo Image Source ❓

**Question**: What image is used for combo deals section?

**Answer from Code**:
```typescript
// ComboDetailClient.tsx
const images = combo.images?.length
  ? combo.images
  : constituents
      .filter((c) => c.product?.images?.[0])
      .slice(0, 4)
      .map((c) => c.product!.images![0]);
```

**Logic**: 
1. If combo has its own images → use combo images
2. Else → use first image from each constituent product (up to 4)

---

### Issue #6: Quantity Increase Logic ❓ CRITICAL

**Question**: What happens when user increases combo product quantity in cart?

**Expected Behavior**:
- Combo pricing applies ONLY to the bundle quantity
- Additional units should be charged at individual product prices
- Example: Combo of 3 products for Rs. 1,500 (50% off)
  - Quantity 1: Rs. 1,500 (combo price)
  - Quantity 2: Rs. 1,500 + Rs. 3,001 = Rs. 4,501 (combo + individual)
  - Quantity 3: Rs. 1,500 + Rs. 6,002 = Rs. 7,502 (combo + 2x individual)

**Current Implementation**: UNKNOWN - needs investigation

**Investigation Path**:
1. Check if combo items in cart have `combo_id` and `combo_group_id`
2. Check if quantity update affects entire combo group or individual items
3. Check if pricing recalculates based on quantity
4. Check database function logic for combo expansion

**Critical Questions**:
- Are combo items stored as separate cart_items with combo_id?
- Can user increase quantity of individual combo constituent?
- Does backend enforce combo pricing only for first bundle?
- How does cart display grouped combo items?

---

## 3. SUMMARY OF FINDINGS

### ✅ WORKING
1. Combo creation and management (vendor portal)
2. Combo display on homepage
3. Combo detail page rendering
4. Add to cart backend logic (database function)
5. Cart API integration
6. Price calculations in ComboDetailClient

### ❌ BROKEN
1. Cart badge not updating after combo add
2. Price display issues (location TBD)
3. Product details showing "Original Price: 0"
4. "What's Included" showing "0 items"

### ❓ UNCLEAR
1. Combo quantity increase logic and pricing
2. How cart displays combo items (grouped or individual)
3. Whether combo pricing is enforced for additional quantities

---

## 4. NEXT STEPS

### Phase 2: Expert Panel Consultation
Will consult 5 experts on:
1. **Security**: Combo pricing enforcement, cart manipulation risks
2. **Performance**: Cart update efficiency, database query optimization
3. **Data**: Combo item storage, price consistency, data integrity
4. **UX**: Cart badge updates, quantity controls, price display
5. **Systems**: End-to-end flow, edge cases, failure modes

### Immediate Investigation Needed
1. Add console logs to `addComboItem()` in store
2. Test combo add to cart and capture logs
3. Verify cart API response structure
4. Check `constituents` data in ComboDetailClient
5. Test quantity increase on combo items in cart

---

**Phase 1 Status**: ✅ COMPLETE
**Next**: Phase 2 - Expert Panel Consultation
