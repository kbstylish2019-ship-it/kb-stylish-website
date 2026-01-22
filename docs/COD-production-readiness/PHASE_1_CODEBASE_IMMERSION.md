# Phase 1: Codebase Immersion - COD Production Readiness

**Date**: January 22, 2026  
**Author**: AI Engineering Assistant  
**Task**: Cash on Delivery (COD) Production Readiness  
**Status**: 🔴 CRITICAL BUGS IDENTIFIED

---

## 1. Executive Summary

The Cash on Delivery (COD) system has been partially implemented but contains **critical bugs** that prevent orders from being created. All 3 attempted COD orders have failed with database constraint violations.

### Current State
| Metric | Value | Status |
|--------|-------|--------|
| COD Payment Intents | 3 | ✅ Created |
| COD Orders Created | 0 | 🔴 FAILED |
| Failed Jobs | 3 | 🔴 CRITICAL |
| Cart Items Cleared | No | 🔴 BUG |

---

## 2. Architecture Analysis

### 2.1 Current COD Flow (As Designed)

```mermaid
sequenceDiagram
    participant User
    participant CheckoutClient
    participant create-order-intent EF
    participant payment_intents
    participant job_queue
    participant order-worker
    participant process_order_with_occ
    participant orders
    
    User->>CheckoutClient: Select COD, Place Order
    CheckoutClient->>create-order-intent EF: POST /create-order-intent
    create-order-intent EF->>payment_intents: INSERT (status: 'succeeded')
    create-order-intent EF->>job_queue: INSERT finalize_order job
    create-order-intent EF-->>CheckoutClient: {success: true, redirect_to_success: true}
    CheckoutClient-->>User: Show Success Modal
    
    Note over order-worker: Background Processing
    order-worker->>job_queue: Acquire job (SKIP LOCKED)
    order-worker->>process_order_with_occ: Execute RPC
    process_order_with_occ->>orders: INSERT order
    process_order_with_occ->>order_items: INSERT items
    process_order_with_occ->>cart_items: DELETE
```

### 2.2 Where It Breaks

The flow breaks at `process_order_with_occ` RPC with two distinct errors:

1. **Error 1**: `null value in column "vendor_id" of relation "order_items" violates not-null constraint`
2. **Error 2**: `new row for relation "orders" violates check constraint "orders_total_cents_check"`

---

## 3. Root Cause Analysis

### 3.1 Bug #1: Missing `vendor_id` in order_items INSERT

**Location**: `process_order_with_occ` PostgreSQL function

**Problem**: The function inserts into `order_items` without including `vendor_id`:

```sql
-- Current (BROKEN)
INSERT INTO order_items (
    order_id, product_id, variant_id, product_name, variant_sku, quantity,
    unit_price_cents, total_price_cents, fulfillment_status
)
SELECT ...
```

**Required Columns** (per schema):
- `vendor_id` - **NOT NULL** ❌ Missing
- `product_slug` - **NOT NULL** ❌ Missing

**Fix**: Add `vendor_id` and `product_slug` to the INSERT statement by joining to `products` table.

### 3.2 Bug #2: `total_cents` Check Constraint Violation

**Location**: `process_order_with_occ` PostgreSQL function

**Constraint**: `CHECK ((total_cents > 0))`

**Problem**: The function calculates `v_total_amount` from `v_payment_intent.amount_cents` but the variable is declared as `DECIMAL(12,2)` and then cast to `INTEGER`:

```sql
v_total_amount := v_payment_intent.amount_cents;
-- Later...
total_cents, v_total_amount::INTEGER
```

**Observation**: Payment intents show `amount_cents: 10000` (correct), but somewhere the calculation may have gone wrong or rounding issues occur.

**Likely Root Cause**: With `subtotal_cents: 100` (NPR 1.00 product) and `shipping_cents: 9900`, total should be 10000 paisa. The constraint `total_cents > 0` should pass. Need to verify if this is a stale job issue where cart was modified after intent creation.

### 3.3 Bug #3: Cart Items Not Cleared After Success

**Location**: `CheckoutClient.tsx` and `process_order_with_occ`

**Problem**: Cart items remain in the database after successful COD checkout.

**Analysis**:
- Frontend comment says: "CRITICAL: DO NOT call clearCart() here. The background order-worker will clear the cart items in the database."
- The `process_order_with_occ` RPC has: `DELETE FROM cart_items WHERE cart_id = v_cart_id;`
- **BUT**: If the RPC fails (due to bugs #1 and #2), the cart is never cleared!

**Evidence**: 
```sql
-- Cart still has items after 3 COD attempts
SELECT * FROM cart_items WHERE cart_id = 'b79cb971-4fcf-4a4f-93de-d71377a90952';
-- Returns 1 row (item still in cart)
```

---

## 4. Database Schema Analysis

### 4.1 Key Tables

| Table | Purpose | RLS Enabled |
|-------|---------|-------------|
| `orders` | Order records | ✅ Yes |
| `order_items` | Line items per order | ✅ Yes |
| `payment_intents` | Payment tracking | ✅ Yes |
| `job_queue` | Background job processing | ✅ Yes |
| `cart_items` | User cart items | ✅ Yes |
| `inventory` | Stock management | ✅ Yes |

### 4.2 Critical Constraints

**orders table**:
- `total_cents > 0` - Total must be positive
- `subtotal_cents >= 0` - Subtotal must be non-negative
- `status` IN ('pending', 'confirmed', 'processing', 'shipped', 'delivered', 'canceled', 'refunded')

**order_items table**:
- `vendor_id` NOT NULL - **Causes Bug #1**
- `product_slug` NOT NULL - **Also missing from INSERT**
- `product_id` NOT NULL
- `variant_id` NOT NULL

### 4.3 Live vs Migration State

✅ Live database state verified via Supabase MCP matches migration expectations.

---

## 5. Edge Function Analysis

### 5.1 create-order-intent

**Status**: ✅ Working correctly for COD

- Correctly validates `payment_method` includes 'cod'
- Sets `status: 'succeeded'` for COD (line 329)
- Enqueues `finalize_order` job immediately (line 385-418)
- Returns `redirect_to_success: true` (line 430)

### 5.2 order-worker

**Status**: ⚠️ Works but calls broken RPC

- Correctly processes `finalize_order` jobs
- Calls `process_order_with_occ` RPC which fails
- Error handling properly marks jobs as failed

---

## 6. Frontend Analysis

### 6.1 CheckoutClient.tsx

**Status**: ✅ Working correctly for COD

- COD payment method enabled (line 250: "COD is now supported!")
- Handles `redirect_to_success` response (line 355-368)
- Shows success modal with payment_intent_id
- Correctly does NOT call clearCart() (relies on backend)

**Issue**: User sees success but order fails silently in background.

---

## 7. Existing Patterns Identified

### 7.1 Database Functions
- Use `SECURITY DEFINER` for admin operations
- Use `SET search_path` for security
- Implement idempotency checks at start of functions

### 7.2 Edge Functions
- Dual-client pattern (userClient + serviceClient)
- CORS headers from `_shared/cors.ts`
- Consistent error response format

### 7.3 Job Queue Pattern
- SKIP LOCKED for concurrent workers
- Idempotency keys prevent duplicate processing
- Max 3 retry attempts with exponential backoff

---

## 8. Live System Verification

### 8.1 Failed Jobs Details

| Job ID | Error | Created At |
|--------|-------|------------|
| 85e520dd... | `vendor_id` violates not-null | 2026-01-22 16:32 |
| 352d5796... | `total_cents_check` violated | 2026-01-22 16:02 |
| 14baff0b... | `total_cents_check` violated | 2026-01-22 16:00 |

### 8.2 Payment Intents (All COD)

| Intent ID | Amount | Status |
|-----------|--------|--------|
| pi_cod_1769099525990_359eb0ad | 10000 paisa | succeeded |
| pi_cod_1769097770153_e45eb995 | 10000 paisa | succeeded |
| pi_cod_1769097659200_eca89069 | 11100 paisa | succeeded |

---

## 9. Priority Bug List

| # | Bug | Severity | Impact | Fix Location |
|---|-----|----------|--------|--------------|
| 1 | `vendor_id` NOT NULL violation | 🔴 CRITICAL | No orders created | `process_order_with_occ` |
| 2 | `product_slug` NOT NULL violation | 🔴 CRITICAL | No orders created | `process_order_with_occ` |
| 3 | Cart not cleared after checkout | 🟡 HIGH | User confusion | Depends on #1,#2 being fixed |
| 4 | No user feedback on background failure | 🟡 HIGH | Silent failures | Frontend + notification system |

---

## 10. Related Documentation Read

- [x] `docs/COD_ARCHITECTURE_MAP.md`
- [x] `docs/COD_SOLUTION_BLUEPRINT.md`
- [x] `docs/COD_EXPERT_PANEL_CONSULTATION.md`
- [x] `docs/COD_CONSISTENCY_REPORT.md`
- [x] `docs/UNIVERSAL_AI_EXCELLENCE_PROMPT.md`

---

## 11. Next Steps

1. **Phase 2**: Expert Panel Consultation on root causes
2. **Phase 3**: Codebase Consistency Check
3. **Phase 4**: Solution Blueprint with detailed fix plan
4. **Phase 5-7**: Reviews
5. **Phase 8**: Implementation of fixes
6. **Phase 9-10**: Testing and validation

---

**Phase 1 Complete** ✅
