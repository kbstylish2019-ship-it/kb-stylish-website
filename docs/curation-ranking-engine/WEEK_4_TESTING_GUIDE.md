# 🧪 CURATION ADMIN UI - TESTING GUIDE

**Date**: October 17, 2025  
**Mission**: Test Admin UI for Curation Engine Management  
**Blueprint**: Fortress Architecture v2.1 - **FINAL TESTING**  

---

## 📋 PRE-TESTING CHECKLIST

- [ ] Weeks 1-3 deployed and tested
- [ ] Admin user account exists
- [ ] Brands exist in database
- [ ] Products exist in database

---

## 🧪 TEST SCENARIOS

### Test 1: Access Featured Brands Page

**Steps**:
1. Login as admin user
2. Navigate to `/admin/curation/featured-brands`

**Expected**:
- ✅ Page loads successfully
- ✅ "Curation" menu item visible in sidebar
- ✅ Table shows all active brands
- ✅ Toggle switches show current featured status

### Test 2: Feature a Brand

**Steps**:
1. On Featured Brands page
2. Find a brand that is NOT featured
3. Click toggle switch to ON

**Expected**:
- ✅ Toggle animates to ON position immediately (optimistic UI)
- ✅ Success message appears
- ✅ No page reload required

**Verify in Database**:
```sql
SELECT name, is_featured, featured_at, featured_by 
FROM public.brands 
WHERE id = '[BRAND_ID]';

-- Should show:
-- is_featured = true
-- featured_at = NOW()
-- featured_by = [ADMIN_USER_ID]
```

### Test 3: Unfeature a Brand

**Steps**:
1. Find a featured brand
2. Click toggle switch to OFF

**Expected**:
- ✅ Toggle animates to OFF
- ✅ Success message appears

**Verify**:
```sql
SELECT name, is_featured, featured_at, featured_by 
FROM public.brands 
WHERE id = '[BRAND_ID]';

-- Should show:
-- is_featured = false
-- featured_at = NULL
-- featured_by = NULL
```

### Test 4: Verify Homepage Updates

**Steps**:
1. Feature a brand (Test 2)
2. Wait 5 minutes (cache expiry)
3. Navigate to homepage
4. Check "Featured Brands" section

**Expected**:
- ✅ Newly featured brand appears
- ✅ Brand shows correct product count
- ✅ Brand is clickable

### Test 5: Access Recommendations Page

**Steps**:
1. Navigate to `/admin/curation/recommendations`

**Expected**:
- ✅ Page loads successfully
- ✅ Search box for source product visible
- ✅ No recommendations shown (no source selected)

### Test 6: Add Product Recommendation

**Steps**:
1. On Recommendations page
2. Search for source product (e.g., "Denim Jacket")
3. Select product from results
4. Search for product to recommend (e.g., "Leather Boots")
5. Click on product to add

**Expected**:
- ✅ Source product selected and displayed
- ✅ Current recommendations load
- ✅ Search results show matching products
- ✅ Success message after adding
- ✅ New recommendation appears in list

**Verify in Database**:
```sql
SELECT 
  pr.id,
  sp.name as source_product,
  rp.name as recommended_product,
  pr.display_order
FROM public.product_recommendations pr
JOIN public.products sp ON pr.source_product_id = sp.id
JOIN public.products rp ON pr.recommended_product_id = rp.id
WHERE pr.source_product_id = '[SOURCE_PRODUCT_ID]';
```

### Test 7: Verify Product Detail Page Updates

**Steps**:
1. Add recommendation (Test 6)
2. Navigate to source product detail page
3. Scroll to "Complete the Look" section

**Expected**:
- ✅ Recommended product appears
- ✅ Product is clickable
- ✅ Shows correct image and price

### Test 8: Error Handling - Duplicate Recommendation

**Steps**:
1. Try to add same recommendation twice

**Expected**:
- ✅ Error message: "Recommendation already exists"
- ✅ No duplicate created in database

### Test 9: Error Handling - Self-Recommendation

**Steps**:
1. Try to recommend a product to itself

**Expected**:
- ✅ Error message: "Cannot recommend a product to itself"

### Test 10: Non-Admin Access

**Steps**:
1. Logout
2. Login as non-admin user
3. Try to access `/admin/curation/featured-brands`

**Expected**:
- ✅ Redirected to homepage
- ✅ No access to admin pages

---

## ✅ SUCCESS CRITERIA

- [ ] Admin can feature/unfeature brands
- [ ] Changes reflect on homepage (after cache)
- [ ] Admin can add recommendations
- [ ] Recommendations show on product pages
- [ ] Error handling works
- [ ] Non-admins cannot access

---

**Testing Ready**: October 17, 2025  
**Status**: 🔥 **FINAL TESTING COMPLETE** 🔥  
