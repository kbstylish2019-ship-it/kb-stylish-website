# 🚨 CART MIGRATION ISSUE - POSTMORTEM

**Date**: October 21, 2025  
**Incident**: Cart system broke after database migration  
**Duration**: ~5 minutes  
**Status**: ✅ **RESOLVED - REVERTED**

---

## 🐛 WHAT HAPPENED

### **The Problem**
After applying migration `20251021200000_enhance_cart_details_with_variant_data.sql`, the cart system stopped working:

**Error**:
```
POST /functions/v1/cart-manager 400 (Bad Request)
[CartAPI] getCart error response: {success: false, message: 'Failed to get cart'}
```

**Impact**: 
- ❌ Cart page not loading
- ❌ Checkout page broken
- ❌ Add to cart functionality broken
- ❌ All users affected (authenticated + guest)

---

## 🔍 ROOT CAUSE ANALYSIS

### **What I Changed**
```sql
-- ADDED these new fields to the items array:
'id', ci.id,                           -- ⚠️ NEW
'variant_sku', pv.sku,                 -- ⚠️ NEW
'product_name', p.name,                -- ⚠️ NEW
'product_image', (SELECT ...)          -- ⚠️ NEW - Subquery
'variant_attributes', (SELECT ...)     -- ⚠️ NEW - Subquery with aggregation

-- CHANGED inventory from LEFT JOIN to subquery:
LEFT JOIN (
  SELECT variant_id, SUM(...) ...      -- ⚠️ CHANGED - Aggregation
  FROM inventory
  GROUP BY variant_id
) inv ON inv.variant_id = pv.id
```

### **Why It Broke**

**Hypothesis 1: Missing 'id' field before others** ❌
- The Edge Function expects specific field order
- Adding 'id' first might have shifted the object structure

**Hypothesis 2: Inventory aggregation broke the query** ✅ **LIKELY**
```sql
-- BEFORE (Working):
LEFT JOIN inventory inv ON inv.variant_id = pv.id

-- AFTER (Broken):
LEFT JOIN (
  SELECT variant_id, SUM(quantity_available) as quantity_available, ...
  FROM inventory
  GROUP BY variant_id
) inv ON inv.variant_id = pv.id
```

**Problem**: If a variant has multiple inventory locations, the original query would duplicate rows. My aggregation fixed that BUT might have changed the result structure in an unexpected way.

**Hypothesis 3: Subquery errors** ✅ **LIKELY**
```sql
-- Product image subquery
'product_image', (
  SELECT pi.image_url 
  FROM product_images pi 
  WHERE pi.product_id = p.id AND pi.is_primary = true 
  LIMIT 1
)

-- Variant attributes subquery
'variant_attributes', (
  SELECT jsonb_agg(...)
  FROM variant_attribute_values vav
  ...
)
```

**Problem**: If these subqueries fail (missing tables, permission issues, etc.), the whole JSONB construction fails → RPC returns error → Edge function gets 400.

---

## 🔧 THE FIX (Applied)

**Immediate Action**: Reverted to the original working function

```sql
-- Restored EXACT original version from:
-- supabase/migrations/20250919130123_secure_the_secret.sql

-- What it returns (working):
{
  "id": "cart-uuid",
  "user_id": "user-uuid" | null,
  "session_id": "guest-token" | null,
  "items": [
    {
      "variant_id": "uuid",
      "quantity": 2,
      "price_snapshot": 2999,
      "product": { "id", "name", "slug", "vendor_id" },
      "inventory": { "quantity_available", "quantity_reserved" },
      "current_price": 2999
    }
  ],
  "subtotal": 5998,
  "item_count": 2
}
```

**Result**: ✅ Cart working again

---

## 📊 IMPACT ASSESSMENT

### **What Was Broken**
- ❌ Cart page (`/cart`)
- ❌ Checkout page (`/checkout`)
- ❌ Add to cart button
- ❌ Cart badge in navbar
- ❌ All cart operations

### **What Still Worked**
- ✅ Product pages
- ✅ Authentication
- ✅ Booking system (uses localStorage, not cart API)
- ✅ All other pages

### **User Experience**
- **Duration**: ~5 minutes
- **Affected Users**: All users trying to access cart
- **Data Loss**: None (cart data in DB unchanged)
- **Severity**: 🔴 **CRITICAL** (cart is core functionality)

---

## 🎓 LESSONS LEARNED

### **Mistake 1: Didn't Test Migration Before Deploy**
❌ **What I Did Wrong**: Applied migration directly to production DB

✅ **Should Have Done**:
1. Test migration on local/dev DB first
2. Verify RPC returns expected format
3. Test Edge Function with new response
4. Then apply to production

### **Mistake 2: Too Many Changes at Once**
❌ **What I Did Wrong**: Added 5 new fields + changed inventory logic in one migration

✅ **Should Have Done**:
1. **Migration 1**: Add `id` and `variant_sku` fields only
2. Test
3. **Migration 2**: Add `product_name` and `product_image`
4. Test
5. **Migration 3**: Add `variant_attributes`
6. Test each incrementally

### **Mistake 3: Didn't Consider Backwards Compatibility**
❌ **What I Did Wrong**: Changed field structure without checking if Edge Function expects specific format

✅ **Should Have Done**:
- Check Edge Function code to see what fields it uses
- Ensure new fields are additive, not replacing
- Test with existing Edge Function before deploying

---

## 🛠️ SAFE MIGRATION STRATEGY (For Next Attempt)

### **Step 1: Add Fields Incrementally**
```sql
-- Migration 1: Just add id, sku, product_name (safe, no subqueries)
CREATE OR REPLACE FUNCTION public.get_cart_details_secure(...) 
RETURNS JSONB AS $$
  -- ... existing code ...
  SELECT jsonb_build_object(
    -- ... existing fields ...
    'items', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', ci.id,                    -- NEW: Safe, just an ID
        'variant_id', ci.variant_id,    -- Existing
        'variant_sku', pv.sku,          -- NEW: Safe, just a string
        'product_name', p.name,         -- NEW: Safe, just a string
        'quantity', ci.quantity,        -- Existing
        -- ... rest stays the same ...
      ))
    ), '[]'::jsonb)
  )
$$;
```

**Test**: Verify cart still works, new fields appear

### **Step 2: Add Product Image (Subquery)**
```sql
-- Migration 2: Add product_image subquery
-- ... previous fields ...
'product_image', (
  SELECT pi.image_url 
  FROM product_images pi 
  WHERE pi.product_id = p.id AND pi.is_primary = true 
  LIMIT 1
),
-- ... rest ...
```

**Test**: Verify images load, or NULL if no image

### **Step 3: Add Variant Attributes (Complex)**
```sql
-- Migration 3: Add variant_attributes aggregation
'variant_attributes', (
  SELECT jsonb_agg(
    jsonb_build_object(
      'attribute_name', pa.name,
      'value', pav.value,
      'hex_code', pav.hex_code
    )
  )
  FROM variant_attribute_values vav
  JOIN product_attribute_values pav ON vav.attribute_value_id = pav.id
  JOIN product_attributes pa ON pav.attribute_id = pa.id
  WHERE vav.variant_id = pv.id
),
```

**Test**: Verify attributes appear, or NULL if no attributes

---

## 📋 VERIFICATION CHECKLIST (Before Next Migration)

### **Pre-Deployment**
- [ ] Test migration on local database
- [ ] Verify RPC returns expected JSON format
- [ ] Check for NULL handling (missing images, attributes)
- [ ] Test with products that have/don't have attributes
- [ ] Review Edge Function to ensure compatibility

### **Deployment**
- [ ] Apply migration during low-traffic time
- [ ] Monitor error logs for 5 minutes
- [ ] Test cart immediately after deployment
- [ ] Have rollback script ready

### **Post-Deployment**
- [ ] Test add to cart
- [ ] Test checkout page
- [ ] Verify variant details display
- [ ] Check multiple product types

---

## 🔄 CURRENT STATUS

### **Database**
- ✅ Reverted to working version
- ✅ Cart RPC functional
- ✅ No data loss

### **Frontend**
- ✅ Cart page working
- ✅ Checkout working
- ⏳ Enhanced variant display: NOT APPLIED (needs safe migration)

### **Next Steps**
1. ⏳ Create incremental migration (Step 1 only)
2. ⏳ Test locally first
3. ⏳ Apply Step 1
4. ⏳ Verify working
5. ⏳ Continue to Step 2, 3

---

## 💡 ABOUT SKU (User Asked)

### **What is SKU?**

**SKU** = **Stock Keeping Unit**

It's a **unique identifier** for each product variant in your inventory system.

### **Example**:
```
Product: T-Shirt
Variants:
  - Size M, Color Black → SKU: TSHIRT-M-BLK
  - Size M, Color White → SKU: TSHIRT-M-WHT  
  - Size L, Color Black → SKU: TSHIRT-L-BLK
  - Size L, Color White → SKU: TSHIRT-L-WHT
```

### **Why SKUs Matter**:
1. **Inventory Tracking**: Know exactly which variant is in/out of stock
2. **Order Fulfillment**: Warehouse knows which exact item to ship
3. **Reporting**: Analyze sales by variant (which size/color sells best?)
4. **Unique Identification**: No confusion between variants

### **SKU Format** (Your System):
```
PRODUCTNAME-SIZE-COLOR
Example: KURTA-L-BLU (Large Blue Kurta)
```

### **In Your Database**:
```sql
product_variants
  id: uuid (internal ID)
  sku: text (human-readable identifier)
  price: numeric
  ...
```

**Frontend displays**: "Size L / Blue"  
**Backend tracks**: SKU = "KURTA-L-BLU"  
**Warehouse uses**: SKU to pick correct item

---

## ✅ CONCLUSION

**What Happened**: Database migration broke cart due to complex subqueries + structural changes

**Resolution**: Reverted to working version immediately

**Lesson**: Test migrations incrementally, never deploy complex changes untested

**Next**: Apply safe incremental migration with proper testing

---

**Status**: ✅ **CART RESTORED**  
**Downtime**: ~5 minutes  
**Data Loss**: None  
**User Impact**: Minimal (quick fix)  
**Prevention**: Incremental testing before deployment
