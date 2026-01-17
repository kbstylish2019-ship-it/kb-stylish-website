# PHASE 2: EXPERT PANEL CONSULTATION - COMBO CART REDESIGN

**Date**: January 17, 2026  
**Task**: Consult 5 experts on combo cart architecture redesign  
**Protocol**: Universal AI Excellence Protocol v2.0

---

## CONSULTATION OVERVIEW

**Problem Statement**: 
- Price calculation bug causing 50x-5000x inflation
- Missing combo grouping in UI
- Quantity controls affecting wrong items
- Poor UX for combo products in cart

**Questions for Experts**:
1. How to fix price calculation safely?
2. How to implement combo grouping?
3. What are security implications?
4. What are performance implications?
5. What's the best UX approach?

---

## EXPERT 1: SENIOR SECURITY ARCHITECT

### Questions Asked

**Q1**: What are the security implications of fixing the price calculation?

**A1**: 
- **CRITICAL**: Price calculation happens server-side (good!)
- **RISK**: If we change the calculation, existing cart items have wrong prices
- **MITIGATION**: Need migration to recalculate all existing combo cart items
- **CONCERN**: What if user checked out with wrong prices? Need audit log

**Q2**: Are combo-level quantity controls secure?

**A2**:
- **SAFE**: Quantity changes still go through backend RPC
- **SAFE**: RLS policies still apply
- **SAFE**: Frontend just groups display, doesn't bypass security
- **RECOMMENDATION**: Validate combo_group_id exists before operations

**Q3**: Can the price bug be exploited?

**A3**:
- **YES**: Currently users are being OVERCHARGED (not undercharged)
- **IMPACT**: Business loses sales, users lose trust
- **URGENCY**: HIGH - Fix immediately
- **AUDIT**: Check if any orders completed with wrong prices

**Q4**: Should we add audit logging for price changes?

**A4**:
- **YES**: Log all price calculations
- **YES**: Log combo additions with calculated prices
- **YES**: Add price_calculation_log table for forensics
- **FORMAT**: Store original prices, discount ratio, final prices

### Security Recommendations

1. ✅ **Fix price calculation in database function** (server-side)
2. ✅ **Add price calculation logging**
3. ✅ **Migrate existing cart items** (recalculate prices)
4. ✅ **Audit completed orders** (check for wrong prices)
5. ✅ **Add validation** (combo_group_id must exist)
6. ✅ **Add unit tests** (verify price calculations)

### Security Checklist

- [x] Price calculation server-side (not client)
- [x] RLS policies still enforced
- [x] Input validation on combo_group_id
- [ ] Audit logging implemented
- [ ] Migration for existing data
- [ ] Unit tests for price calculation

---

## EXPERT 2: PERFORMANCE ENGINEER

### Questions Asked

**Q1**: What's the performance impact of grouping cart items?

**A1**:
- **MINIMAL**: Grouping happens in application layer (JavaScript)
- **COST**: O(n) to group items by combo_group_id
- **ACCEPTABLE**: Cart typically has <50 items
- **OPTIMIZATION**: Can use Map for O(1) lookups

**Q2**: Should we change the database query to return grouped data?

**A2**:
- **OPTION A**: Keep flat array, group in frontend (RECOMMENDED)
  - Pros: Simple, flexible, no DB changes
  - Cons: Slight frontend overhead
  
- **OPTION B**: Return nested JSON from database
  - Pros: Less frontend work
  - Cons: Complex SQL, harder to cache, less flexible

**RECOMMENDATION**: Option A - group in frontend

**Q3**: What about query performance with removed UNIQUE constraint?

**A3**:
- **CONCERN**: Without UNIQUE constraint, could have true duplicates
- **MITIGATION**: Added indexes on (cart_id, variant_id) and (combo_group_id)
- **IMPACT**: Query performance maintained
- **MONITORING**: Watch for accidental duplicates

**Q4**: Will combo-level quantity updates be slow?

**A4**:
- **CURRENT**: Update single cart_item
- **PROPOSED**: Update multiple cart_items in combo group
- **SOLUTION**: Batch update in single transaction
- **PERFORMANCE**: Acceptable (<10 items per combo typically)

### Performance Recommendations

1. ✅ **Group in frontend** (not database)
2. ✅ **Use Map for O(1) grouping**
3. ✅ **Batch updates for combo quantity changes**
4. ✅ **Keep existing indexes**
5. ✅ **Add monitoring for duplicate detection**
6. ✅ **Cache combo metadata** (name, price, savings)

### Performance Checklist

- [x] Grouping algorithm O(n)
- [x] Indexes in place
- [ ] Batch update implementation
- [ ] Caching strategy
- [ ] Monitoring for duplicates

---


## EXPERT 3: DATA ARCHITECT

### Questions Asked

**Q1**: Should we change the schema to better support combo grouping?

**A1**:
- **CURRENT SCHEMA**: Adequate for requirements
- **combo_group_id**: Already exists, just needs to be used
- **combo_id**: Already exists for reference
- **RECOMMENDATION**: No schema changes needed, just fix the logic

**Q2**: What about the price calculation bug - is it a schema issue?

**A2**:
- **NOT A SCHEMA ISSUE**: It's a logic bug in the function
- **ROOT CAUSE**: Mixing units (cents vs rupees)
- **FIX**: Convert units before calculation
- **SCHEMA**: Already correct (combo_price_cents, variant price in rupees)

**Q3**: Should we store combo metadata in cart_items?

**A3**:
- **OPTION A**: Store combo_name, combo_price in each cart_item
  - Pros: Faster queries, no joins needed
  - Cons: Data duplication, update anomalies
  
- **OPTION B**: Join to products table when needed
  - Pros: Normalized, single source of truth
  - Cons: Requires join
  
**RECOMMENDATION**: Option B - join when needed (already doing this)

**Q4**: What about data migration for existing cart items?

**A4**:
- **REQUIRED**: Recalculate price_snapshot for all combo items
- **APPROACH**: 
  1. Identify all cart_items where combo_id IS NOT NULL
  2. Recalculate discount ratio (with correct units)
  3. Update price_snapshot
  4. Log changes for audit
- **TIMING**: Run during low-traffic period
- **ROLLBACK**: Keep backup of old prices

### Data Integrity Recommendations

1. ✅ **No schema changes needed**
2. ✅ **Fix price calculation function**
3. ✅ **Migrate existing cart data**
4. ✅ **Add data validation** (price_snapshot reasonable?)
5. ✅ **Add constraints** (combo_group_id NOT NULL when combo_id NOT NULL)
6. ✅ **Add check constraint** (price_snapshot > 0)

### Data Migration Plan

```sql
-- Step 1: Backup existing data
CREATE TABLE cart_items_backup_20260117 AS 
SELECT * FROM cart_items WHERE combo_id IS NOT NULL;

-- Step 2: Recalculate prices
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
    )
  )
  FROM product_variants pv
  JOIN products p ON ci.combo_id = p.id
  WHERE pv.id = ci.variant_id
)
WHERE ci.combo_id IS NOT NULL;

-- Step 3: Verify results
SELECT 
  combo_group_id,
  SUM(price_snapshot * quantity) as total,
  (SELECT combo_price_cents / 100 FROM products WHERE id = combo_id LIMIT 1) as expected
FROM cart_items
WHERE combo_id IS NOT NULL
GROUP BY combo_group_id, combo_id;
```

### Data Checklist

- [x] Schema adequate
- [ ] Price calculation fixed
- [ ] Migration script ready
- [ ] Backup plan in place
- [ ] Validation queries written
- [ ] Rollback procedure documented

---

## EXPERT 4: FRONTEND/UX ENGINEER

### Questions Asked

**Q1**: What's the best UX for displaying combo groups in cart?

**A1**: **RECOMMENDED APPROACH**:

```
┌─────────────────────────────────────────────────────────┐
│ 🎁 Test Combo Package                    Qty: [1] [▼]  │
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ │
│                                                          │
│   ✓ test product × 1                        Rs. 0.50   │
│   ✓ Lilium Herbal (400ml) × 2              Rs. 999.66  │
│   ✓ Lilium Herbal (300ml) × 1              Rs. 499.83  │
│                                                          │
│   Combo Price: Rs. 1,500  (Save Rs. 1,501 - 50%)       │
│   [Remove Combo]                                        │
└─────────────────────────────────────────────────────────┘
```

**Key UX Elements**:
1. 🎁 Combo icon/badge
2. Combo name as header
3. Horizontal line separator
4. Constituent items indented (non-editable)
5. Combo-level quantity control
6. Price breakdown showing savings
7. Single "Remove Combo" button

**Q2**: Should individual items in combo be editable?

**A2**: **NO - STRONGLY RECOMMEND AGAINST IT**

**Reasons**:
- Breaks combo integrity
- Confusing pricing (what happens to discount?)
- Complex logic (recalculate proportions?)
- User expectation: combo is atomic unit

**Alternative**: If user wants different quantities, remove combo and add items individually

**Q3**: How to handle combo quantity increases?

**A3**: **MULTIPLY ALL CONSTITUENT QUANTITIES**

**Example**:
```
Combo contains:
- 1× test product
- 2× Lilium (400ml)
- 1× Lilium (300ml)

User increases combo quantity to 2:
- 2× test product
- 4× Lilium (400ml)
- 2× Lilium (300ml)

Total price: Rs. 1,500 × 2 = Rs. 3,000
```

**Implementation**:
- Frontend: Show combo quantity control
- Backend: Update all cart_items in combo_group_id proportionally
- Validation: Check inventory for all items

**Q4**: What about mobile responsiveness?

**A4**: **MOBILE-FIRST DESIGN**

```
Mobile View:
┌──────────────────────────┐
│ 🎁 Test Combo Package    │
│ Qty: [1] [▼]             │
│ ─────────────────────    │
│ ✓ test product × 1       │
│   Rs. 0.50               │
│ ✓ Lilium (400ml) × 2     │
│   Rs. 999.66             │
│ ✓ Lilium (300ml) × 1     │
│   Rs. 499.83             │
│ ─────────────────────    │
│ Rs. 1,500                │
│ Save Rs. 1,501 (50%)     │
│ [Remove Combo]           │
└──────────────────────────┘
```

**Q5**: How to differentiate combo items from regular products?

**A5**: **VISUAL HIERARCHY**

1. **Background color**: Light purple/blue tint for combo groups
2. **Border**: Distinct border around combo group
3. **Icon**: 🎁 or 📦 icon for combos
4. **Indentation**: Constituent items indented
5. **Typography**: Combo name bold, items regular
6. **Spacing**: More padding around combo groups

### UX Recommendations

1. ✅ **Create ComboGroup component**
2. ✅ **Disable individual item controls**
3. ✅ **Add combo-level quantity control**
4. ✅ **Show price breakdown with savings**
5. ✅ **Visual separation** (border, background, icon)
6. ✅ **Mobile-responsive design**
7. ✅ **Accessibility** (ARIA labels, keyboard navigation)
8. ✅ **Loading states** (when updating quantity)
9. ✅ **Error states** (insufficient inventory)
10. ✅ **Confirmation** (before removing combo)

### UX Checklist

- [ ] ComboGroup component created
- [ ] Visual design implemented
- [ ] Quantity controls working
- [ ] Price breakdown displayed
- [ ] Mobile responsive
- [ ] Accessibility compliant
- [ ] Loading states
- [ ] Error handling
- [ ] Confirmation dialogs

---

## EXPERT 5: PRINCIPAL ENGINEER (INTEGRATION & SYSTEMS)

### Questions Asked

**Q1**: What's the complete end-to-end flow with the new design?

**A1**: **REVISED FLOW**:

```
1. USER ADDS COMBO
   ├─ Frontend: Click "Add Bundle to Cart"
   ├─ API: POST /cart { action: 'add_combo', combo_id }
   ├─ Edge Function: addComboToCart()
   ├─ Database: add_combo_to_cart_secure()
   │   ├─ Get combo details
   │   ├─ Calculate discount ratio (FIXED: convert cents to rupees)
   │   ├─ Insert cart_items with correct prices
   │   └─ Return combo_group_id
   ├─ Response: Full cart with combo metadata
   └─ Frontend: Group items by combo_group_id, display ComboGroup

2. USER VIEWS CART
   ├─ Frontend: Navigate to /checkout
   ├─ Store: Load cart from decoupledCartStore
   ├─ Transform: Group productItems by combo_group_id
   │   ├─ Regular items: Display normally
   │   └─ Combo items: Display in ComboGroup component
   └─ Render: Hierarchical cart display

3. USER INCREASES COMBO QUANTITY
   ├─ Frontend: Click + on combo quantity control
   ├─ API: POST /cart { action: 'update_combo_quantity', combo_group_id, quantity }
   ├─ Edge Function: updateComboQuantity() [NEW]
   ├─ Database: update_combo_quantity_secure() [NEW]
   │   ├─ Get all cart_items in combo_group_id
   │   ├─ Calculate new quantities (multiply by factor)
   │   ├─ Check inventory for all items
   │   ├─ Update all cart_items in transaction
   │   └─ Return updated cart
   └─ Frontend: Refresh cart display

4. USER REMOVES COMBO
   ├─ Frontend: Click "Remove Combo" (with confirmation)
   ├─ API: POST /cart { action: 'remove_combo', combo_group_id }
   ├─ Edge Function: removeComboFromCart() [EXISTS]
   ├─ Database: remove_combo_from_cart_secure() [EXISTS]
   │   ├─ Delete all cart_items with combo_group_id
   │   └─ Return updated cart
   └─ Frontend: Refresh cart display

5. USER CHECKS OUT
   ├─ Frontend: Click "Place Order"
   ├─ Validation: Check inventory for all items (including combos)
   ├─ Payment: Process payment
   ├─ Order Creation: Create order with combo metadata
   │   ├─ order_items preserve combo_id and combo_group_id
   │   └─ Order total matches cart total
   ├─ Inventory: Decrement for all items
   ├─ Combo Tracking: Increment combo_quantity_sold
   └─ Confirmation: Show order with combo grouping
```

**Q2**: What are the failure modes and how do we handle them?

**A2**: **FAILURE SCENARIOS**:

**Scenario 1: Insufficient Inventory During Quantity Increase**
```
User increases combo quantity from 1 to 2
One constituent product has only 1 unit left
→ Show error: "Insufficient inventory for [product name]"
→ Suggest: "Maximum quantity: 1"
→ Don't update any items (atomic operation)
```

**Scenario 2: Price Calculation Fails**
```
Database function encounters error
→ Rollback transaction
→ Return error to frontend
→ Show user-friendly message
→ Log error for debugging
```

**Scenario 3: Combo Deleted While in Cart**
```
Admin deactivates combo product
User tries to checkout
→ Detect combo_id references inactive product
→ Show warning: "This combo is no longer available"
→ Offer to remove from cart
```

**Scenario 4: Race Condition (Multiple Users)**
```
Two users add last combo simultaneously
→ Database handles with inventory checks
→ Second user gets "sold out" error
→ Graceful degradation
```

**Q3**: What about backwards compatibility?

**A3**: **MIGRATION STRATEGY**:

**Phase 1: Fix Price Calculation** (CRITICAL)
- Deploy fixed database function
- Migrate existing cart items
- No frontend changes yet
- Users see correct prices immediately

**Phase 2: Add Combo Grouping** (UX IMPROVEMENT)
- Deploy ComboGroup component
- Update cart display logic
- Backwards compatible (works with old and new data)
- Gradual rollout possible

**Phase 3: Add Combo Quantity Controls** (FEATURE)
- Deploy new edge function
- Add quantity controls to UI
- Optional feature (can be feature-flagged)

**Q4**: What monitoring do we need?

**A4**: **MONITORING REQUIREMENTS**:

1. **Price Calculation Monitoring**:
   - Log all combo additions with calculated prices
   - Alert if price_snapshot > variant_price (indicates bug)
   - Track discount ratios (should be 0-1)

2. **Cart Operations Monitoring**:
   - Track combo add/remove/update operations
   - Monitor error rates
   - Track inventory check failures

3. **Performance Monitoring**:
   - Cart load time
   - Grouping operation time
   - Database query performance

4. **Business Metrics**:
   - Combo conversion rate
   - Average combo quantity
   - Combo removal rate

### Integration Recommendations

1. ✅ **Phased rollout** (price fix → grouping → quantity controls)
2. ✅ **Atomic operations** (all or nothing for combo updates)
3. ✅ **Comprehensive error handling**
4. ✅ **Monitoring and alerting**
5. ✅ **Backwards compatibility**
6. ✅ **Feature flags** (for gradual rollout)
7. ✅ **Rollback plan** (for each phase)
8. ✅ **Documentation** (for support team)

### Integration Checklist

- [ ] End-to-end flow documented
- [ ] Failure modes identified
- [ ] Error handling implemented
- [ ] Monitoring in place
- [ ] Rollback plan ready
- [ ] Feature flags configured
- [ ] Documentation written
- [ ] Support team trained

---

## EXPERT PANEL CONSENSUS

### Critical Priorities (DO FIRST)

1. **🔴 FIX PRICE CALCULATION BUG** (CRITICAL)
   - Impact: Users being overcharged
   - Effort: Low (single function fix)
   - Risk: Low (well-understood bug)
   - Timeline: IMMEDIATE

2. **🔴 MIGRATE EXISTING CART DATA** (CRITICAL)
   - Impact: Fix prices for current carts
   - Effort: Medium (write migration, test)
   - Risk: Medium (data migration)
   - Timeline: Same day as price fix

3. **🟠 IMPLEMENT COMBO GROUPING UI** (HIGH)
   - Impact: Fixes UX confusion
   - Effort: Medium (new component)
   - Risk: Low (display-only change)
   - Timeline: 1-2 days

4. **🟠 ADD COMBO QUANTITY CONTROLS** (HIGH)
   - Impact: Enables proper combo management
   - Effort: Medium (new edge function + UI)
   - Risk: Medium (inventory checks)
   - Timeline: 2-3 days

### Secondary Priorities (DO LATER)

5. **🟡 ADD MONITORING** (MEDIUM)
   - Impact: Catch future issues
   - Effort: Medium
   - Timeline: 1 week

6. **🟢 OPTIMIZE PERFORMANCE** (LOW)
   - Impact: Marginal improvement
   - Effort: Low
   - Timeline: As needed

### All Experts Agree

✅ **Price bug is CRITICAL** - fix immediately  
✅ **Combo grouping is ESSENTIAL** - not optional  
✅ **Individual item controls must be DISABLED** - for combo items  
✅ **Phased rollout is SAFEST** - price fix first, then UI  
✅ **Monitoring is IMPORTANT** - catch issues early  
✅ **Documentation is REQUIRED** - for support and future devs  

---

## PHASE 2 COMPLETION CHECKLIST

- [x] Security Architect consulted
- [x] Performance Engineer consulted
- [x] Data Architect consulted
- [x] UX Engineer consulted
- [x] Principal Engineer consulted
- [x] All concerns documented
- [x] Consensus reached
- [x] Priorities established
- [x] Risks identified
- [x] Recommendations documented

---

**STATUS**: ✅ PHASE 2 COMPLETE - READY FOR CONSISTENCY CHECK

**Next**: Phase 3 - Verify solution aligns with existing codebase patterns

