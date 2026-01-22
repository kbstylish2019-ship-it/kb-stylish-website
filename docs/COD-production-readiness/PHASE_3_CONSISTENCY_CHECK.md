# Phase 3: Codebase Consistency Check - COD Production Readiness

**Date**: January 22, 2026  
**Task**: Cash on Delivery (COD) Production Readiness

---

## 1. Pattern Matching Analysis

### 1.1 Database Function Patterns

**Existing Pattern in Codebase:**
```sql
-- Pattern: SECURITY DEFINER functions with search_path
CREATE OR REPLACE FUNCTION public.function_name(...)
RETURNS ... 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
...
$function$;
```

**Current `process_order_with_occ`**: ✅ Follows pattern
- Uses `SECURITY DEFINER`
- Returns `jsonb` for structured response
- Implements idempotency check at start

### 1.2 Order Item Insert Pattern

**How other order-related functions insert order_items:**

Searching codebase for similar patterns... The current INSERT is:

```sql
INSERT INTO order_items (
    order_id, product_id, variant_id, product_name, variant_sku, quantity,
    unit_price_cents, total_price_cents, fulfillment_status
)
SELECT 
    v_order_id, pv.product_id, ci.variant_id, p.name, pv.sku, ci.quantity,
    (pv.price * 100)::INTEGER, (ci.quantity * pv.price * 100)::INTEGER, 'pending'
FROM cart_items ci
JOIN product_variants pv ON pv.id = ci.variant_id
JOIN products p ON p.id = pv.product_id
WHERE ci.cart_id = v_cart_id
```

**Missing columns that are NOT NULL:**
- `vendor_id` - Available via `p.vendor_id`
- `product_slug` - Available via `p.slug`

**Correct Pattern (should be):**
```sql
INSERT INTO order_items (
    order_id, product_id, variant_id, vendor_id, product_name, product_slug,
    variant_sku, quantity, unit_price_cents, total_price_cents, fulfillment_status,
    combo_id, combo_group_id
)
SELECT 
    v_order_id, pv.product_id, ci.variant_id, p.vendor_id, p.name, p.slug,
    pv.sku, ci.quantity,
    (pv.price * 100)::INTEGER, (ci.quantity * pv.price * 100)::INTEGER, 'pending',
    ci.combo_id, ci.combo_group_id
FROM cart_items ci
JOIN product_variants pv ON pv.id = ci.variant_id
JOIN products p ON p.id = pv.product_id
WHERE ci.cart_id = v_cart_id
```

### 1.3 Edge Function Patterns

**Dual-Client Pattern**: ✅ Correctly implemented in `create-order-intent`
```typescript
const userClient = createClient(url, anonKey, { headers: { Authorization } });
const serviceClient = createClient(url, serviceRoleKey);
```

**Error Response Pattern**: ✅ Consistent
```typescript
return new Response(JSON.stringify({
  success: false,
  error: 'Error message'
}), { status: 4xx, headers: corsHeaders });
```

### 1.4 Job Queue Pattern

**Existing Pattern:**
```typescript
await serviceClient.from('job_queue').insert({
  job_type: 'finalize_order',
  payload: { ... },
  priority: 1,
  status: 'pending',
  idempotency_key: `unique_key`,
  max_attempts: 3
});
```

**COD Implementation**: ✅ Follows pattern correctly

---

## 2. Dependency Analysis

### 2.1 Circular Dependencies
- **Status**: ✅ None detected
- `orders` depends on `payment_intents` (FK)
- `order_items` depends on `orders`, `products`, `product_variants`
- No circular references

### 2.2 Package Versions
- **Supabase JS**: `@supabase/supabase-js@2.39.3` (Edge Functions)
- **Frontend**: Using latest Supabase client
- **Status**: ✅ Compatible

### 2.3 Deprecated APIs
- **Status**: ✅ None used
- All Supabase methods are current

---

## 3. Anti-Pattern Detection

### 3.1 Hardcoded Values

| Location | Value | Status |
|----------|-------|--------|
| `create-order-intent` | `shipping_cents: 9900` | ⚠️ Hardcoded but acceptable for MVP |
| `create-order-intent` | `tax_cents: 0` | ⚠️ Hardcoded, commented as TODO |
| NPX Config | Credentials in env defaults | 🟡 Should fail if not set |

### 3.2 Direct Database Access
- **Status**: ✅ All access through RPC or Supabase client
- No raw SQL executed from frontend

### 3.3 Missing Error Handling

| Location | Issue | Severity |
|----------|-------|----------|
| `order-worker` | No notification on permanent failure | 🟡 Medium |
| `CheckoutClient` | No polling for order confirmation | 🟡 Medium |

### 3.4 SQL Injection
- **Status**: ✅ Protected
- All RPC calls use parameterized inputs

### 3.5 N+1 Queries
- **Status**: ✅ Avoided
- Order items inserted via single `INSERT ... SELECT`
- Bookings processed in loop but count is typically low (< 5)

### 3.6 Duplicate Code
- **Status**: ✅ DRY maintained
- Shared utilities in `_shared/` directory
- CORS, error handling, auth patterns reused

---

## 4. TypeScript Compliance

### 4.1 Type Definitions
- `PaymentIntentResponse` includes `redirect_to_success` ✅
- `CreateOrderIntentRequest` properly typed ✅

### 4.2 Strict Mode
- **Status**: ✅ Project uses TypeScript strict mode
- No `any` types in critical paths

---

## 5. Consistency Report Summary

### ✅ Consistent With Patterns
1. Edge Function structure
2. Dual-client authentication
3. Job queue usage
4. Error response format
5. RLS policies
6. CORS handling

### 🔴 Inconsistent (Bugs)
1. `process_order_with_occ` missing required columns in INSERT
2. No synchronous order confirmation for COD

### 🟡 Opportunities for Improvement
1. Add rate limiting for COD (other payment methods have gateway limits)
2. Add order confirmation polling
3. Implement cleanup job for orphaned reservations

---

## 6. Schema Alignment Verification

**Live Database vs Code:**

| Column | In Schema | In RPC INSERT | Status |
|--------|-----------|---------------|--------|
| order_id | ✅ | ✅ | OK |
| product_id | ✅ | ✅ | OK |
| variant_id | ✅ | ✅ | OK |
| vendor_id | ✅ NOT NULL | ❌ Missing | 🔴 BUG |
| product_name | ✅ | ✅ | OK |
| product_slug | ✅ NOT NULL | ❌ Missing | 🔴 BUG |
| variant_sku | ✅ | ✅ | OK |
| quantity | ✅ | ✅ | OK |
| unit_price_cents | ✅ | ✅ | OK |
| total_price_cents | ✅ | ✅ | OK |
| fulfillment_status | ✅ | ✅ | OK |
| combo_id | ✅ | ❌ Missing | 🟡 Should add |
| combo_group_id | ✅ | ❌ Missing | 🟡 Should add |

---

**Phase 3 Complete** ✅

**Next**: Phase 4 - Solution Blueprint
