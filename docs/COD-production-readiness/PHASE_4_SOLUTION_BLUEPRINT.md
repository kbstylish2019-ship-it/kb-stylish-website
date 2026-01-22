# Phase 4: Solution Blueprint - COD Production Readiness

**Date**: January 22, 2026  
**Task**: Cash on Delivery (COD) Production Readiness  
**Approach**: Surgical Fix (minimal change, low risk)

---

## 1. Problem Statement

The COD payment system is broken due to missing required columns in the `process_order_with_occ` PostgreSQL function. All COD orders fail silently after the user sees a success message.

**Specific Issues:**
1. `vendor_id` NOT NULL violation in `order_items` INSERT
2. `product_slug` NOT NULL violation in `order_items` INSERT
3. `combo_id` and `combo_group_id` not carried through from cart
4. Cart items not cleared (consequence of #1-2)
5. User sees success but order doesn't exist

---

## 2. Proposed Solution

### 2.1 Approach Selection

☑️ **Surgical Fix** (selected)
- Minimal change to existing RPC function
- Low risk - only adds missing columns
- No architectural changes needed

☐ Refactor  
☐ Rewrite

**Justification**: The COD flow is architecturally sound. The only issue is a missing column mapping in the SQL INSERT statement.

---

## 3. Architecture Changes

### 3.1 Overview

No architectural changes required. The fix is a single SQL function update.

```
BEFORE:                           AFTER:
cart_items ──┐                    cart_items ──┐
             │                                 │
             ▼                                 ▼
  process_order_with_occ            process_order_with_occ
             │                                 │
             ▼                                 ▼
  order_items (FAILS)               order_items (SUCCEEDS)
  - missing vendor_id               + vendor_id ✅
  - missing product_slug            + product_slug ✅
                                    + combo_id ✅
                                    + combo_group_id ✅
```

---

## 4. Database Changes

### 4.1 Migration: Fix process_order_with_occ

**File**: `20260122_fix_process_order_with_occ.sql`

**Changes to INSERT statement:**

```sql
-- CURRENT (BROKEN)
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

-- FIXED
INSERT INTO order_items (
    order_id, product_id, variant_id, vendor_id, product_name, product_slug,
    variant_sku, quantity, unit_price_cents, total_price_cents, fulfillment_status,
    combo_id, combo_group_id
)
SELECT 
    v_order_id, 
    pv.product_id, 
    ci.variant_id, 
    p.vendor_id,           -- NEW: Required NOT NULL column
    p.name, 
    p.slug,                -- NEW: Required NOT NULL column
    pv.sku, 
    ci.quantity,
    (pv.price * 100)::INTEGER, 
    (ci.quantity * pv.price * 100)::INTEGER, 
    'pending',
    ci.combo_id,           -- NEW: Carry through combo tracking
    ci.combo_group_id      -- NEW: Carry through combo grouping
FROM cart_items ci
JOIN product_variants pv ON pv.id = ci.variant_id
JOIN products p ON p.id = pv.product_id
WHERE ci.cart_id = v_cart_id
```

### 4.2 Full Updated Function

The complete updated `process_order_with_occ` function with the fix applied.

---

## 5. API Changes

**No API changes required.** The fix is entirely in the database layer.

---

## 6. Frontend Changes

**No frontend changes required for core fix.**

**Optional Enhancement**: Add order confirmation polling (deferred to post-launch).

---

## 7. Files to Modify

| File Path | Change Type | Description |
|-----------|-------------|-------------|
| `supabase/migrations/20260122_fix_process_order_with_occ.sql` | CREATE | New migration file |
| Live database via Supabase MCP | UPDATE | Apply migration directly |

---

## 8. Security Considerations

### 8.1 No New Security Risks
- Function remains `SECURITY DEFINER`
- No new data exposed
- Same RLS policies apply
- Input validation unchanged

### 8.2 Audit Trail
- Existing `inventory_movements` logging preserved
- Order creation fully logged

---

## 9. Performance Considerations

### 9.1 No Performance Impact
- Same number of JOINs (products table already joined)
- Additional columns are indexed (vendor_id, slug)
- No additional queries required

---

## 10. Testing Strategy

### 10.1 Pre-Deployment Testing

1. **Unit Test**: Verify RPC returns success with test data
2. **Integration Test**: Full COD checkout flow
3. **Verification Queries**:
   ```sql
   -- After placing COD order, verify:
   SELECT * FROM orders WHERE payment_method = 'cod' ORDER BY created_at DESC LIMIT 1;
   SELECT * FROM order_items WHERE order_id = '<new_order_id>';
   SELECT * FROM cart_items WHERE cart_id = '<cart_id>'; -- Should be empty
   ```

### 10.2 Post-Deployment Verification

1. Place a real COD order
2. Verify order appears in admin dashboard
3. Verify order appears in user's order history
4. Verify cart is cleared
5. Verify inventory is decremented

---

## 11. Deployment Plan

### Step 1: Backup Current Function
```sql
-- Save current function definition
SELECT pg_get_functiondef(oid) FROM pg_proc WHERE proname = 'process_order_with_occ';
```

### Step 2: Apply Migration via Supabase MCP
```sql
-- Use mcp0_apply_migration with the fixed function
```

### Step 3: Retry Failed Jobs (Optional)
```sql
-- Reset failed COD jobs to pending for reprocessing
UPDATE job_queue 
SET status = 'pending', attempts = 0, last_error = NULL, failed_at = NULL
WHERE job_type = 'finalize_order' 
AND status = 'failed'
AND payload->>'is_cod' = 'true';
```

### Step 4: Trigger Order Worker
- Call order-worker Edge Function to process retried jobs

### Step 5: Verify Success
- Check orders table for new entries
- Verify cart_items cleared

---

## 12. Rollback Plan

### If Issues Occur:

1. **Restore Previous Function**:
   ```sql
   -- Rollback migration (restore from backup)
   ```

2. **Mark Jobs as Failed**:
   ```sql
   UPDATE job_queue SET status = 'failed' WHERE status = 'pending' AND job_type = 'finalize_order';
   ```

3. **Notify Users**:
   - Affected users contacted via email
   - Manual order creation if needed

---

## 13. Success Criteria

| Criteria | Measurement |
|----------|-------------|
| COD orders created successfully | orders table has new records |
| Order items include vendor_id | No NULL violations |
| Order items include product_slug | No NULL violations |
| Cart cleared after checkout | cart_items empty for user |
| Job queue processes without errors | No failed jobs for COD |
| User sees order in history | Frontend displays order |
| Vendor sees order in dashboard | Vendor dashboard shows order |

---

## 14. Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Migration syntax error | Low | High | Test in staging first |
| Data type mismatch | Low | Medium | Verified column types match |
| Performance regression | Very Low | Low | No new queries added |
| Rollback needed | Low | Medium | Backup saved before applying |

---

**Phase 4 Complete** ✅

**Next**: Phase 5-7 - Blueprint Reviews
