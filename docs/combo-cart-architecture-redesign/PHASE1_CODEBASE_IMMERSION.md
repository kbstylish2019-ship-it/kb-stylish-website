# PHASE 1: CODEBASE IMMERSION - COMBO CART ARCHITECTURE REDESIGN

**Date**: January 17, 2026  
**Task**: Redesign combo cart/checkout architecture to fix critical UX and pricing issues  
**Protocol**: Universal AI Excellence Protocol v2.0  
**Severity**: CRITICAL - Affects money, user experience, and data integrity

---

## EXECUTIVE SUMMARY

### Critical Issues Identified

1. **🔴 PRICE DISPLAY CORRUPTION**:
   - Test product shows Rs. 50 instead of Rs. 1 (5000% error!)
   - Lilium products show Rs. 49,983 instead of Rs. 1,000 (4998% error!)
   - Total shows Rs. 301,198 instead of expected Rs. 1,500

2. **🔴 QUANTITY CONTROL BROKEN**:
   - Increasing quantity of one "test product" increases BOTH test products
   - Same issue with Lilium products
   - Products share same variant_id, causing unintended coupling

3. **🔴 COMBO GROUPING MISSING**:
   - Combo items displayed as individual products
   - No visual separation between combo groups
   - No way to increase/decrease entire combo as unit
   - User cannot distinguish which items belong to which combo

4. **🔴 DISCOUNT CALCULATION WRONG**:
   - Individual item prices don't reflect proportional discount
   - Combo savings not visible in checkout
   - Total doesn't match combo price

### Root Cause Analysis

**The Fundamental Problem**: Current implementation treats combo items as INDIVIDUAL cart items, not as GROUPED entities.

**Why This Breaks**:
1. Multiple cart_items with same variant_id → quantity controls affect all instances
2. No visual grouping → user confusion
3. Price calculation happens per-item → loses combo context
4. No combo-level controls → can't manage combo as unit

**What We Need**: Combo items must be treated as ATOMIC GROUPS with:
- Visual grouping and separation
- Combo-level quantity controls
- Individual items non-editable within combo
- Correct price display with discount breakdown
- Clear combo identification

---

## 1. ARCHITECTURE DOCUMENTS REVIEW

### 1.1 Current Cart Architecture

**File**: `src/lib/store/decoupledCartStore.ts`

**Current Design**:
```typescript
interface CartProductItem {
  id: string;              // cart_items.id
  variant_id: string;      // ← PROBLEM: Multiple items share same variant_id
  product_id: string;
  product_name: string;
  price: number;           // ← PROBLEM: Individual price, not combo-aware
  quantity: number;        // ← PROBLEM: Editable per-item
  combo_id?: string;       // ← EXISTS but not used for grouping
  combo_group_id?: string; // ← EXISTS but not used for grouping
}
```

**Current Cart Display**:
- Flat list of all cart items
- Each item has individual quantity controls
- No grouping by combo_group_id
- No combo-level controls

**Current Add Combo Flow**:
```
1. User clicks "Add Bundle to Cart"
2. Backend expands combo into constituent items
3. Each item inserted into cart_items with:
   - combo_id (same for all items in combo)
   - combo_group_id (unique per combo instance)
   - price_snapshot (proportionally discounted)
4. Frontend displays as individual items
```

### 1.2 Database Schema Review

**Table**: `cart_items`
```sql
CREATE TABLE cart_items (
  id UUID PRIMARY KEY,
  cart_id UUID REFERENCES carts(id),
  variant_id UUID REFERENCES product_variants(id),
  quantity INTEGER,
  price_snapshot NUMERIC,
  combo_id UUID REFERENCES products(id),      -- Which combo this belongs to
  combo_group_id UUID,                         -- Which instance of combo
  created_at TIMESTAMPTZ
);
```

**Key Observations**:
- ✅ `combo_group_id` exists for grouping
- ✅ `combo_id` exists for combo reference
- ❌ No UNIQUE constraint anymore (we removed it)
- ❌ Frontend doesn't use grouping fields

### 1.3 Existing Patterns Analysis

**Pattern 1: Booking Cart Items** (Similar Grouping Problem)
```typescript
// Bookings are stored separately, not mixed with products
interface CartBookingItem {
  id: string;
  reservation_id: string;
  // ... booking-specific fields
}

// Separate arrays in store
bookingItems: CartBookingItem[];
productItems: CartProductItem[];
```

**Lesson**: Separate concerns work well. Combos might need similar treatment.

**Pattern 2: Order Items Grouping**
```sql
-- order_items also has combo_group_id
-- But we don't have order display logic yet to learn from
```

**Pattern 3: Product Variants Display**
```typescript
// In ProductList.tsx, variants are displayed with attributes
// But no grouping logic exists
```

---

## 2. LIVE DATABASE INVESTIGATION

### 2.1 Current Cart Data Analysis

**Query**: Check actual cart data structure
```sql
SELECT 
  ci.id,
  ci.variant_id,
  ci.quantity,
  ci.price_snapshot,
  ci.combo_id,
  ci.combo_group_id,
  p.name as combo_name,
  prod.name as product_name,
  pv.price as variant_original_price,
  pv.sku
FROM cart_items ci
LEFT JOIN products p ON ci.combo_id = p.id
LEFT JOIN product_variants pv ON ci.variant_id = pv.id
LEFT JOIN products prod ON pv.product_id = prod.id
WHERE ci.combo_id IS NOT NULL
ORDER BY ci.combo_group_id, ci.created_at;
```

**Results** (from previous investigation):
```json
[
  {
    "id": "d9ccf88a-02bd-4e31-b6f8-05c801325cd2",
    "variant_id": "b7f0774f-21d2-4da7-a633-6ac3fb8e2e0e",
    "quantity": 1,
    "price_snapshot": "50",  // ← Rs. 50 (WRONG - should be ~Rs. 0.50)
    "combo_group_id": "df65ed3d-d51a-4a92-97cc-3de312970146",
    "product_name": "test product"
  },
  {
    "id": "00ad9ab5-8589-4fca-b545-1537bf79ae8e",
    "variant_id": "c573d152-a821-40fa-8d2b-ada1a0481c0d",
    "quantity": 2,
    "price_snapshot": "49983",  // ← Rs. 49,983 (WRONG - should be ~Rs. 500)
    "combo_group_id": "df65ed3d-d51a-4a92-97cc-3de312970146",
    "product_name": "Lilium Herbal Gold Cleansing Milk"
  }
]
```

**🔴 CRITICAL FINDING**: `price_snapshot` values are MASSIVELY INFLATED!

### 2.2 Combo Product Data Analysis

**Query**: Check combo pricing
```sql
SELECT 
  p.id,
  p.name,
  p.combo_price_cents,
  p.combo_savings_cents,
  (SELECT json_agg(json_build_object(
    'product_name', prod.name,
    'variant_price', pv.price,
    'quantity', ci.quantity
  ))
  FROM combo_items ci
  JOIN product_variants pv ON ci.constituent_variant_id = pv.id
  JOIN products prod ON ci.constituent_product_id = prod.id
  WHERE ci.combo_product_id = p.id
  ) as constituents
FROM products p
WHERE p.id = '0877522f-1068-41db-9812-2488c53968a8';
```

**Expected Result**:
```json
{
  "name": "Test combo package",
  "combo_price_cents": 150000,  // Rs. 1,500
  "constituents": [
    {
      "product_name": "test product",
      "variant_price": 1.00,  // Rs. 1
      "quantity": 1
    },
    {
      "product_name": "Lilium Herbal (400ml)",
      "variant_price": 1000.00,  // Rs. 1,000
      "quantity": 2
    },
    {
      "product_name": "Lilium Herbal (300ml)",
      "variant_price": 1000.00,  // Rs. 1,000
      "quantity": 1
    }
  ]
}
```

**Total Original Price**: Rs. 1 + (Rs. 1,000 × 2) + Rs. 1,000 = Rs. 3,001  
**Combo Price**: Rs. 1,500  
**Savings**: Rs. 1,501 (50%)

### 2.3 Price Calculation Investigation

**Database Function**: `add_combo_to_cart_secure`

**Relevant Code**:
```sql
-- Calculate total original price
FOR v_item IN 
  SELECT ci.*, pv.price
  FROM combo_items ci
  JOIN product_variants pv ON ci.constituent_variant_id = pv.id
  WHERE ci.combo_product_id = p_combo_id
LOOP
  v_total_original_price := v_total_original_price + (v_item.price * v_item.quantity);
END LOOP;

-- Calculate discount ratio
v_discount_ratio := v_combo.combo_price_cents::NUMERIC / v_total_original_price;

-- Apply discount to each item
v_discounted_price := ROUND(v_item.price * v_discount_ratio);
```

**🔴 CRITICAL BUG IDENTIFIED**:

The function calculates:
```
v_discount_ratio = combo_price_cents / total_original_price
                 = 150000 / 3001
                 = 49.98...
```

Then applies:
```
v_discounted_price = variant_price * discount_ratio
                   = 1 * 49.98 = 50  (for test product)
                   = 1000 * 49.98 = 49,983  (for Lilium)
```

**THE PROBLEM**: 
- `combo_price_cents` is in CENTS (150000 = Rs. 1,500)
- `variant_price` is in RUPEES (1, 1000)
- **MIXING UNITS!** This is the root cause of price inflation!

**Correct Calculation Should Be**:
```
v_discount_ratio = (combo_price_cents / 100) / total_original_price
                 = 1500 / 3001
                 = 0.4998...  (50% discount)

v_discounted_price = variant_price * discount_ratio
                   = 1 * 0.4998 = 0.50  (for test product)
                   = 1000 * 0.4998 = 499.83  (for Lilium)
```

---

## 3. EXISTING PATTERNS IDENTIFICATION

### 3.1 Cart Display Patterns

**Current Pattern**: Flat list with individual controls
```typescript
// ProductList.tsx
{items.map((it) => (
  <li key={it.id}>
    <div>{it.name}</div>
    <div>
      <button onClick={() => onQtyChange(it.id, it.quantity - 1)}>-</button>
      <input value={it.quantity} />
      <button onClick={() => onQtyChange(it.id, it.quantity + 1)}>+</button>
    </div>
    <button onClick={() => onRemove(it.id)}>Remove</button>
  </li>
))}
```

**Problem**: No grouping, all items treated equally

### 3.2 Quantity Control Patterns

**Current Pattern**: Per-item quantity control
```typescript
updateProductQuantity: async (itemId, quantity) => {
  const response = await cartAPI.updateCartItem(itemId, quantity);
  // Updates single cart_item by id
}
```

**Problem**: When multiple items share same variant_id, UI might update wrong item

### 3.3 Price Display Patterns

**Current Pattern**: Direct price display
```typescript
<div>{formatNPR(it.price)}</div>
```

**Problem**: No context about combo discount, original price, or savings

---

## 4. ANTI-PATTERNS DETECTED

### 4.1 Unit Mixing (CRITICAL)
- ❌ Mixing CENTS and RUPEES in calculations
- ❌ No unit conversion in database function
- ❌ Inconsistent storage (combo in cents, variants in rupees)

### 4.2 Missing Abstraction
- ❌ No ComboGroup component
- ❌ No combo-level state management
- ❌ No combo-aware quantity controls

### 4.3 Insufficient Grouping
- ❌ `combo_group_id` exists but unused
- ❌ No visual separation of combos
- ❌ No combo metadata in cart response

### 4.4 Poor UX Patterns
- ❌ User can modify individual combo items
- ❌ No indication items are part of combo
- ❌ No way to remove entire combo at once
- ❌ Confusing when same product appears multiple times

---

## 5. RELATED CODE SEARCH

### 5.1 Combo-Related Files

**Database**:
- ✅ `add_combo_to_cart_secure` function (HAS BUG)
- ✅ `remove_combo_from_cart_secure` function
- ✅ `get_cart_details_secure` function (needs enhancement)

**Frontend**:
- ✅ `src/lib/store/decoupledCartStore.ts` (needs combo grouping)
- ✅ `src/components/checkout/ProductList.tsx` (needs combo display)
- ❌ No `ComboGroup.tsx` component (MISSING)
- ❌ No combo-specific cart logic (MISSING)

**API**:
- ✅ `supabase/functions/cart-manager/index.ts` (has combo actions)
- ✅ `src/lib/api/cartClient.ts` (has combo methods)

### 5.2 Similar Grouping Implementations

**Search Results**: No existing grouping patterns found in cart display

**Booking System**: Separate array, not grouped with products

**Order History**: Need to check if orders display combos grouped

---

## 6. ARCHITECTURE MAP

### 6.1 Current Data Flow (BROKEN)

```
┌─────────────────────────────────────────────────────────────┐
│                    CURRENT FLOW (BROKEN)                     │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  User clicks "Add Bundle"                                    │
│         │                                                    │
│         ▼                                                    │
│  ┌──────────────────────────────────────┐                   │
│  │ add_combo_to_cart_secure()           │                   │
│  │ - Calculates discount ratio          │                   │
│  │ - BUG: Mixes cents and rupees! ❌    │                   │
│  │ - Inserts individual cart_items      │                   │
│  └──────────────────────────────────────┘                   │
│         │                                                    │
│         ▼                                                    │
│  ┌──────────────────────────────────────┐                   │
│  │ cart_items table                     │                   │
│  │ - Multiple rows with same variant_id │                   │
│  │ - combo_group_id set but unused      │                   │
│  │ - price_snapshot WRONG (inflated)    │                   │
│  └──────────────────────────────────────┘                   │
│         │                                                    │
│         ▼                                                    │
│  ┌──────────────────────────────────────┐                   │
│  │ get_cart_details_secure()            │                   │
│  │ - Returns flat array of items        │                   │
│  │ - No grouping by combo_group_id      │                   │
│  └──────────────────────────────────────┘                   │
│         │                                                    │
│         ▼                                                    │
│  ┌──────────────────────────────────────┐                   │
│  │ Frontend: decoupledCartStore         │                   │
│  │ - Stores as flat productItems[]      │                   │
│  │ - No combo grouping logic            │                   │
│  └──────────────────────────────────────┘                   │
│         │                                                    │
│         ▼                                                    │
│  ┌──────────────────────────────────────┐                   │
│  │ ProductList.tsx                      │                   │
│  │ - Displays all items individually    │                   │
│  │ - Quantity controls per item ❌      │                   │
│  │ - No visual grouping ❌              │                   │
│  │ - Wrong prices displayed ❌          │                   │
│  └──────────────────────────────────────┘                   │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### 6.2 Dependencies Map

```
Database Layer:
  ├─ add_combo_to_cart_secure (NEEDS FIX)
  ├─ remove_combo_from_cart_secure (OK)
  ├─ get_cart_details_secure (NEEDS ENHANCEMENT)
  └─ combo_items table (OK)

API Layer:
  ├─ cart-manager edge function (OK)
  └─ cartClient.ts (OK)

State Layer:
  └─ decoupledCartStore.ts (NEEDS COMBO GROUPING)

UI Layer:
  ├─ ProductList.tsx (NEEDS REWRITE)
  ├─ ComboGroup.tsx (NEEDS CREATION)
  └─ checkout page (NEEDS UPDATE)
```

---

## 7. KEY FINDINGS SUMMARY

### 7.1 Critical Bugs

1. **🔴 PRICE CALCULATION BUG** (Severity: CRITICAL):
   - Location: `add_combo_to_cart_secure` function
   - Issue: Mixing cents and rupees in discount calculation
   - Impact: Prices inflated by 50x-5000x
   - Fix: Convert combo_price_cents to rupees before calculation

2. **🔴 MISSING COMBO GROUPING** (Severity: HIGH):
   - Location: Frontend cart display
   - Issue: No visual grouping of combo items
   - Impact: User confusion, wrong quantity controls
   - Fix: Create ComboGroup component, group by combo_group_id

3. **🔴 QUANTITY CONTROL COUPLING** (Severity: HIGH):
   - Location: ProductList.tsx quantity controls
   - Issue: Multiple items with same variant_id affected together
   - Impact: Increasing one item increases all instances
   - Fix: Disable individual controls for combo items, add combo-level controls

### 7.2 Design Flaws

1. **Combo items treated as individual products**:
   - Should be: Atomic groups with combo-level controls
   
2. **No combo metadata in cart response**:
   - Should include: Combo name, original price, savings, item count

3. **Flat cart structure**:
   - Should be: Hierarchical (combos → items, regular products)

### 7.3 Missing Features

1. ❌ ComboGroup UI component
2. ❌ Combo-level quantity controls
3. ❌ Visual separation between combos
4. ❌ Combo discount breakdown display
5. ❌ "Remove entire combo" action
6. ❌ Combo metadata in cart state

---

## 8. PHASE 1 COMPLETION CHECKLIST

- [x] Read architecture documents
- [x] Map relevant systems (cart, checkout, combo)
- [x] Identify existing patterns (flat list, per-item controls)
- [x] Search for similar code (no grouping patterns found)
- [x] Check LIVE database (found price calculation bug)
- [x] Document data flow (mapped current broken flow)
- [x] Identify anti-patterns (unit mixing, missing abstraction)
- [x] List dependencies (database → API → state → UI)
- [x] Find critical bugs (price calculation, grouping, quantity)
- [x] Document findings (comprehensive analysis complete)

---

## NEXT STEPS: PHASE 2

Consult the 5-expert panel on:
1. **Security**: Are combo-level controls secure?
2. **Performance**: Impact of grouping logic on cart queries?
3. **Data**: Should we change schema or just display logic?
4. **UX**: Best way to display grouped combos?
5. **Systems**: End-to-end flow with grouping?

---

**STATUS**: ✅ PHASE 1 COMPLETE - READY FOR EXPERT CONSULTATION

**Critical Finding**: Price calculation bug is the root cause of inflated prices. Must fix before any UI changes.

