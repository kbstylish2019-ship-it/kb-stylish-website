# Phase 1: Codebase Immersion - Cart 400 Errors Investigation

**Date**: January 22, 2026  
**Protocol**: Universal AI Excellence Protocol v2.0  
**Severity**: 🔴 CRITICAL - Production Blocking

---

## 1.1 Architecture Documents Read ✅

| Document | Status | Key Findings |
|----------|--------|--------------|
| `UNIVERSAL_AI_EXCELLENCE_PROMPT.md` | ✅ Read | 10-phase protocol, 5-expert panel required |
| `combo-cart-architecture-redesign/00_MASTER_PLAN.md` | ✅ Read | Combo redesign complete, price calculation fixed |
| `combo-products-completion/20_CRITICAL_FIXES_APPLIED.md` | ✅ Read | 5 critical fixes applied |
| `combo-cart-architecture-redesign/PHASE_G_CART_API_ERRORS_INVESTIGATION.md` | ✅ Read | Previous investigation concluded cart working (OUTDATED) |

---

## 1.2 Core Systems Mapped ✅

### Authentication Flow
```
Client → getAuthHeaders() → {
  Authorization: Bearer <JWT or anon_key>
  x-guest-token: <guest_token>
  apikey: <anon_key>
}
→ Edge Function (cart-manager v66) 
→ Dual Client Pattern (userClient + serviceClient)
→ Database Functions (SECURITY DEFINER)
```

### Cart Data Flow
```
1. ProductDetailClient.handleBuyNow()
   ↓
2. decoupledCartStore.addProductItem()
   ↓
3. cartAPI.addToCart()
   ↓
4. Edge Function: cart-manager/index.ts
   - Validates auth (JWT or guest token)
   - Calls addToCart() handler
   ↓
5. Database: add_to_cart_secure()
   - Creates/gets cart
   - Checks inventory
   - Inserts cart_item
   ↓
6. Database: get_cart_details_secure() ← 🔴 FAILS HERE
   - References non-existent table
   - Throws SQL error
   ↓
7. Edge Function returns success: false
   ↓
8. Client shows error
```

### Database Schema (Key Tables)

| Table | Purpose | Row Count |
|-------|---------|-----------|
| `carts` | User/guest carts | Active |
| `cart_items` | Items in carts | 8 backup rows |
| `products` | Product catalog | Active |
| `product_variants` | Variant options (size, color) | Active |
| `attribute_values` | ✅ ACTUAL attribute values table | Active |
| `product_attributes` | Attribute definitions | Active |
| `variant_attribute_values` | Links variants to attributes | Active |
| `combo_items` | Combo product mappings | Active |

---

## 1.3 Existing Patterns Identified ✅

### Database Function Pattern
```sql
CREATE OR REPLACE FUNCTION public.function_name(...)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public', 'pg_temp'
AS $function$
  -- Implementation
$function$;
```

### Edge Function Pattern
```typescript
// Dual client pattern
const userClient = createClient(URL, ANON_KEY, { headers: { Authorization } });
const serviceClient = createClient(URL, SERVICE_KEY);

// RPC call pattern
const { data, error } = await supabase.rpc('function_name', params);
```

### Cart API Pattern
```typescript
// All cart operations follow this pattern:
1. Call mutation RPC (add/update/remove)
2. Call getCart() to get updated state
3. Return full cart to client

// This pattern means getCart() failure breaks ALL operations
```

---

## 1.4 Related Code Search ✅

### Recent Migrations (Combo Related)
```
20260116065702 - create_combo_product_function
20260116065727 - add_combo_to_cart_function
20260116065743 - remove_combo_from_cart_function
20260116065922 - update_get_cart_details_for_combos
20260117155218 - fix_combo_duplicate_constraint
20260117173952 - add_combo_quantity_update
20260118082014 - fix_remove_by_cart_item_id
20260118082754 - add_id_to_cart_details ← LIKELY INTRODUCED BUG
```

### Key File Versions
- Edge function `cart-manager`: v66 (ACTIVE)
- Database functions: 11 cart-related functions (all SECURITY DEFINER)

---

## 1.5 Live Database Verification ✅

### Function Exists
```sql
SELECT proname FROM pg_proc WHERE proname LIKE '%cart%';
-- ✅ add_combo_to_cart_secure
-- ✅ add_to_cart_secure
-- ✅ clear_cart_secure
-- ✅ get_cart_details_secure
-- ... (11 total)
```

### Table Verification
```sql
SELECT table_name FROM information_schema.tables WHERE table_name LIKE '%attribute%';
-- ✅ attribute_values (EXISTS)
-- ✅ product_attributes (EXISTS)
-- ✅ variant_attribute_values (EXISTS)
-- ❌ product_attribute_values (DOES NOT EXIST)
```

### Direct Function Test
```sql
SELECT public.get_cart_details_secure(NULL::UUID, 'test_token');
-- ❌ ERROR: 42P01: relation "product_attribute_values" does not exist
```

---

## 🔴 ROOT CAUSE IDENTIFIED

### The Bug
The `get_cart_details_secure` function references `product_attribute_values` but this table doesn't exist. The correct table name is `attribute_values`.

### Error Location
```sql
-- In get_cart_details_secure function:
FROM variant_attribute_values vav
JOIN product_attribute_values pav ON vav.attribute_value_id = pav.id  -- ❌ WRONG
JOIN product_attributes pa ON pav.attribute_id = pa.id
```

### Correct Query
```sql
FROM variant_attribute_values vav
JOIN attribute_values pav ON vav.attribute_value_id = pav.id  -- ✅ CORRECT
JOIN product_attributes pa ON pav.attribute_id = pa.id
```

### Impact
- ALL cart operations return 400 errors
- Users cannot add products to cart
- Users cannot view cart
- Checkout is broken
- Both regular products AND combos affected

---

## 1.6 Error Screenshots Analysis

### Screenshot 1: getCart error
```
[CartAPI] getCart error response: {}
Call Stack:
  CartAPIClient.getCart (src/lib/api/cartClient.ts:306:17)
  async initializeCart (src/lib/store/decoupledCartStore.ts:642:30)
```

### Screenshot 2: addToCart error
```
[CartAPI] addToCart error response: {}
Call Stack:
  CartAPIClient.addToCart (src/lib/api/cartClient.ts:356:17)
  async addProductItem (src/lib/store/decoupledCartStore.ts:170:28)
```

### Screenshot 3: Store error
```
Item added but failed to retrieve updated cart
Call Stack:
  addProductItem (src/lib/store/decoupledCartStore.ts:197:19)
```

**Analysis**: The error message "Item added but failed to retrieve updated cart" comes from edge function line 328-329. This confirms:
1. `add_to_cart_secure` succeeds (item is added)
2. `getCart()` fails (returns `success: false`)
3. Error propagates up as empty `{}` because edge function returns minimal error info

---

## Phase 1 Output: Architecture Map

```
┌─────────────────────────────────────────────────────────────────────┐
│                         CLIENT LAYER                                 │
├─────────────────────────────────────────────────────────────────────┤
│  ProductDetailClient.tsx                                            │
│       ↓ handleBuyNow()                                              │
│  decoupledCartStore.ts                                              │
│       ↓ addProductItem()                                            │
│  cartClient.ts                                                       │
│       ↓ addToCart() → POST /functions/v1/cart-manager               │
└─────────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────────┐
│                       EDGE FUNCTION LAYER                            │
├─────────────────────────────────────────────────────────────────────┤
│  cart-manager/index.ts (v66)                                         │
│       ├── Auth: JWT verification → guest token fallback             │
│       ├── action: 'add' → addToCart()                               │
│       │       ├── Step 1: RPC add_to_cart_secure() ✅               │
│       │       └── Step 2: getCart() ❌ FAILS                        │
│       └── Returns: { success: false, message: '...' }               │
└─────────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────────┐
│                      DATABASE LAYER                                  │
├─────────────────────────────────────────────────────────────────────┤
│  add_to_cart_secure()                                               │
│       ├── get_or_create_cart_secure() ✅                            │
│       ├── Check inventory ✅                                        │
│       └── INSERT cart_items ✅                                      │
│                                                                      │
│  get_cart_details_secure() ❌ BROKEN                                │
│       ├── get_or_create_cart_secure() ✅                            │
│       └── SELECT with JOINs ❌                                      │
│           └── JOIN product_attribute_values ← TABLE DOESN'T EXIST  │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Next Steps

**Proceed to Phase 2: Expert Panel Consultation** to validate the fix approach before implementation.
