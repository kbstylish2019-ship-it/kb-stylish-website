# Phase 1: Codebase Immersion - Combo Products Completion

**Date**: January 16, 2026
**Status**: COMPLETE

---

## 1. Current Implementation Status

### ✅ IMPLEMENTED (Working)

| Component | Location | Status |
|-----------|----------|--------|
| Database Schema | `products` table extensions | ✅ Working |
| `combo_items` table | Junction table | ✅ Working |
| `cart_items` combo fields | `combo_id`, `combo_group_id` | ✅ Working |
| `order_items` combo fields | `combo_id`, `combo_group_id` | ✅ Working |
| `create_combo_product` function | Database RPC | ✅ Fixed (price calculation) |
| `add_combo_to_cart_secure` function | Database RPC | ✅ Exists |
| `remove_combo_from_cart_secure` function | Database RPC | ✅ Exists |
| `get_combo_availability` function | Database RPC | ✅ Exists |
| Combo Creation Wizard | `/vendor/combos/create` | ✅ Working |
| Vendor Combo List | `/vendor/combos` | ✅ Working |
| Toggle Combo Active | Server action | ✅ Working |
| ComboDetailClient | Component | ✅ Exists (not used) |
| Combo Types | `src/types/combo.ts` | ✅ Defined |
| Combo Constants | `src/lib/constants/combo.ts` | ✅ Defined |

### ❌ NOT IMPLEMENTED / BROKEN

| Component | Issue | Priority |
|-----------|-------|----------|
| Homepage Combo Deals | Hardcoded placeholder data | P0 |
| Product Detail Page for Combos | Shows blank/broken | P0 |
| Combo Images | Not fetched/displayed | P0 |
| Combo Edit Page | Route doesn't exist | P1 |
| "Combos" Category | Doesn't exist | P1 |
| Shop Filter for Combos | Not implemented | P1 |
| Hero Carousel Combo Link | Links to non-existent filter | P2 |
| `get_product_with_variants` | Missing combo fields | P0 |

---

## 2. Database State Analysis (LIVE)

### Combo Product Created
```
ID: 0877522f-1068-41db-9812-2488c53968a8
Name: Test combo package
Slug: test-combo-package
Price: 150000 cents (NPR 1,500)
Savings: 150100 cents (NPR 1,501)
Quantity Limit: 5
Quantity Sold: 0
Category: Facial Kits (inherited from first constituent)
Image Count: 0 (NO IMAGES!)
Variant Count: 0 (COMBOS DON'T HAVE VARIANTS!)
Item Count: 3 ✅
```

### Combo Items (Constituents)
```
1. Lilium Herbal Gold Cleansing Milk - XS/400ml (x2) - NPR 2,000
2. Lilium Herbal Gold Cleansing Milk - XS/300ml (x1) - NPR 1,000
3. test product - TESTPRODUC (x1) - NPR 1

Total Original: NPR 3,001
Combo Price: NPR 1,500
Savings: NPR 1,501 (50%)
```

### Images Available from Constituents
- Constituent products HAVE images
- These can be used for combo display
- Combo-specific images can be uploaded separately

---

## 3. Root Cause Analysis

### Issue 1: Homepage Shows Placeholder Data
**Location**: `src/app/page.tsx` lines 208-265
**Problem**: Combo Deals section is completely hardcoded with fake data
**Solution**: Fetch real combos from database and render dynamically

### Issue 2: Product Detail Page Blank for Combos
**Location**: `src/app/product/[slug]/page.tsx`
**Problem**: 
1. `get_product_with_variants` doesn't return combo fields
2. Combos have no variants (empty array)
3. Combos have no images (empty array)
4. Price shows as 0 (no variant prices)
5. Stock shows "Out of Stock" (no inventory for combos)

**Solution**: 
1. Update `get_product_with_variants` to include combo data
2. Create separate combo detail page OR detect combo and render differently
3. Fetch constituent products with images for display

### Issue 3: No Combo Edit Functionality
**Location**: `/vendor/combos/[id]/edit` - DOESN'T EXIST
**Problem**: Edit link in VendorComboList points to non-existent route
**Solution**: Create edit page with ComboEditModal or full page editor

### Issue 4: No "Combos" Category
**Problem**: 
- "View All" in Combo Deals links to `/shop?category=combos`
- No category with slug "combos" exists
- Combos inherit category from first constituent

**Solution**: 
- Create dedicated "Combos" category
- OR use `is_combo=true` filter instead of category

---

## 4. Architecture Decisions Needed

### Decision 1: Combo Detail Page Strategy
**Options**:
A. Modify existing product page to detect combos and render ComboDetailClient
B. Create separate `/combo/[slug]` route
C. Keep `/product/[slug]` but with combo-aware logic

**Recommendation**: Option A - Less code duplication, consistent URLs

### Decision 2: Combo Images Strategy
**Options**:
A. Use constituent product images only (auto-generated gallery)
B. Allow combo-specific image upload + constituent images
C. Require combo-specific images only

**Recommendation**: Option B - Best flexibility

### Decision 3: Combos Category Strategy
**Options**:
A. Create dedicated "Combos" category in database
B. Use `is_combo=true` filter in shop page
C. Both - category for navigation, filter for queries

**Recommendation**: Option C - Best UX

---

## 5. Files to Modify

### Database Functions
1. `get_product_with_variants` - Add combo fields and constituent data

### Frontend - Homepage
1. `src/app/page.tsx` - Replace hardcoded Combo Deals with real data

### Frontend - Product Detail
1. `src/app/product/[slug]/page.tsx` - Detect combo, render appropriately
2. `src/components/product/ProductDetailClient.tsx` - Handle combo case

### Frontend - Vendor Portal
1. Create `src/app/vendor/combos/[id]/edit/page.tsx`
2. Create `src/components/vendor/ComboEditForm.tsx`

### Frontend - Shop
1. `src/app/shop/page.tsx` - Add combo filter support

### API
1. Create `/api/products/combos` - Fetch active combos for homepage

---

## 6. Data Flow Analysis

### Current Flow (Broken)
```
Homepage → Hardcoded data → No real combos shown
Product Page → get_product_with_variants → Missing combo data → Blank page
```

### Target Flow
```
Homepage → /api/products/combos → Real combos with images → Dynamic cards
Product Page → get_product_with_variants (enhanced) → Combo data + constituents → ComboDetailClient
```

---

## 7. Security Considerations

- Combo creation already restricted to authorized vendors ✅
- RLS policies exist on combo_items ✅
- No new security concerns identified

---

## 8. Performance Considerations

- Homepage combo fetch should be cached (5 min TTL)
- Combo detail page can use existing caching infrastructure
- Constituent images already in CDN

---

## 9. Next Steps

Proceed to **Phase 2: Expert Panel Consultation** to validate approach and identify edge cases.
