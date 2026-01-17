# Phase 2: Expert Panel Consultation - Combo Products Completion

**Date**: January 16, 2026
**Status**: COMPLETE

---

## Expert 1: Senior Security Architect Review

### Security Analysis

#### 1. Authorization
✅ **PASS** - Combo creation already restricted to authorized vendors (KB Stylish + rabindra)
- `create_combo_product` function checks `auth.uid()` against authorized vendor IDs
- RLS policies on `combo_items` table enforce vendor ownership

#### 2. Data Exposure
✅ **PASS** - No sensitive data exposed
- Combo detail page only shows public product information
- Prices, images, and descriptions are all public data
- No user PII exposed in combo display

#### 3. Input Validation
⚠️ **CONCERN** - Homepage combo fetch needs validation
- **Recommendation**: Ensure API endpoint validates `is_active = true` and `is_combo = true`
- **Recommendation**: Limit number of combos returned (max 8 for homepage)

#### 4. SQL Injection
✅ **PASS** - All queries use parameterized functions
- `get_product_with_variants` uses parameterized slug
- No raw SQL concatenation

#### 5. Rate Limiting
✅ **PASS** - Existing rate limiting applies
- Cart operations already rate-limited
- No new endpoints requiring additional rate limiting

### Security Recommendations
1. Add `is_active` check to combo fetch query
2. Validate combo_id format (UUID) before database queries
3. Ensure combo availability API doesn't leak inventory details

---

## Expert 2: Performance Engineer Review

### Performance Analysis

#### 1. Homepage Combo Fetch
⚠️ **CONCERN** - Need efficient query for homepage
- **Current**: Hardcoded data (no DB query)
- **Proposed**: Single query with JOIN to get combos + first constituent image
- **Recommendation**: Use materialized view or cache (5 min TTL)

#### 2. Product Detail Page for Combos
⚠️ **CONCERN** - `get_product_with_variants` doesn't return combo data
- **Current**: Returns empty variants/images for combos
- **Proposed**: Extend function to detect combos and return constituent data
- **Recommendation**: Single function call, not multiple queries

#### 3. Query Optimization
```sql
-- Efficient combo fetch for homepage (single query)
SELECT 
  p.id, p.name, p.slug, p.combo_price_cents, p.combo_savings_cents,
  p.combo_quantity_limit, p.combo_quantity_sold,
  (SELECT COUNT(*) FROM combo_items ci WHERE ci.combo_product_id = p.id) as item_count,
  COALESCE(
    (SELECT pi.image_url FROM product_images pi WHERE pi.product_id = p.id ORDER BY pi.sort_order LIMIT 1),
    (SELECT pi.image_url FROM combo_items ci 
     JOIN product_images pi ON pi.product_id = ci.constituent_product_id 
     WHERE ci.combo_product_id = p.id ORDER BY ci.display_order, pi.sort_order LIMIT 1)
  ) as image_url
FROM products p
WHERE p.is_combo = true AND p.is_active = true
ORDER BY p.created_at DESC
LIMIT 8;
```

#### 4. Index Coverage
✅ **PASS** - Existing indices sufficient
- `products(is_combo)` partial index exists
- `combo_items(combo_product_id)` index exists

### Performance Recommendations
1. Create `get_active_combos` function for homepage (cached)
2. Extend `get_product_with_variants` to include combo fields
3. Use constituent images as fallback when combo has no images

---

## Expert 3: Data Architect Review

### Data Integrity Analysis

#### 1. Schema Design
✅ **PASS** - Combo schema is well-designed
- `is_combo` flag on products table
- `combo_items` junction table with proper FKs
- Cascade delete on combo_items when combo deleted

#### 2. Price Consistency
✅ **FIXED** - Price calculation now correct
- Migration `fix_combo_price_calculation` converts variant prices to cents
- `combo_savings_cents` calculated correctly

#### 3. Category Handling
✅ **FIXED** - Category inherited from first constituent
- Migration `fix_combo_category_from_constituent` handles NULL category

#### 4. Data Migration
✅ **PASS** - No data migration needed
- Existing combo data is valid
- New functions are additive, not breaking

#### 5. Orphan Prevention
✅ **PASS** - Cascade deletes prevent orphans
- `combo_items` deleted when combo product deleted
- Constituent products can exist independently

### Data Recommendations
1. Add constraint: `combo_price_cents < total_original_price`
2. Consider adding `combo_original_price_cents` for display consistency
3. Ensure combo images table supports combo-specific uploads

---

## Expert 4: Frontend/UX Engineer Review

### UX Analysis

#### 1. Homepage Combo Display
❌ **ISSUE** - Currently hardcoded placeholder data
- **Current**: Shows fake "Starter Kit", "Pro Facial Kit" etc.
- **Proposed**: Fetch real combos from database
- **Recommendation**: Show "No combos available" if empty, not placeholders

#### 2. Combo Detail Page
❌ **ISSUE** - Shows blank/broken for combos
- **Current**: Rs. 0, Out of Stock, broken image
- **Root Cause**: `get_product_with_variants` doesn't return combo fields
- **Proposed**: Detect combo and render ComboDetailClient

#### 3. Loading States
⚠️ **CONCERN** - Need loading states for combo fetch
- **Recommendation**: Add skeleton loader for combo section
- **Recommendation**: Show loading spinner on combo detail page

#### 4. Error States
⚠️ **CONCERN** - Need graceful error handling
- **Recommendation**: Show "Unable to load combos" on fetch failure
- **Recommendation**: Fallback to placeholder if image fails

#### 5. Accessibility
✅ **PASS** - ComboDetailClient has proper ARIA attributes
- `aria-live="polite"` for availability alerts
- `aria-label` on buttons
- Proper heading hierarchy

#### 6. Mobile Responsiveness
✅ **PASS** - Existing combo components are responsive
- Horizontal scroll on mobile for homepage
- Grid layout on desktop

### UX Recommendations
1. Replace hardcoded combo section with dynamic data
2. Add "Coming Soon" state if no combos exist
3. Use constituent images as fallback for combo display
4. Add skeleton loaders for async data

---

## Expert 5: Principal Engineer (Integration & Systems) Review

### Integration Analysis

#### 1. End-to-End Flow
```
Current (Broken):
Homepage → Hardcoded data → No real combos
Product Page → get_product_with_variants → Missing combo data → Blank

Target:
Homepage → get_active_combos → Real combos with images → Dynamic cards
Product Page → get_product_with_variants (enhanced) → Combo data → ComboDetailClient
```

#### 2. Edge Cases
| Edge Case | Current Handling | Recommendation |
|-----------|------------------|----------------|
| No combos exist | Shows hardcoded placeholders | Show "Coming Soon" or hide section |
| Combo has no images | Broken image | Use constituent images |
| Combo sold out | Not handled | Show "Sold Out" badge |
| Constituent out of stock | Not checked on display | Show availability warning |
| Combo inactive | Not filtered | Filter in query |

#### 3. Failure Modes
| Failure | Impact | Mitigation |
|---------|--------|------------|
| Database query fails | Homepage combo section empty | Show error message, log error |
| Image CDN fails | Broken images | Use placeholder image |
| Combo availability check fails | Can't add to cart | Show retry button |

#### 4. Monitoring
⚠️ **CONCERN** - No combo-specific monitoring
- **Recommendation**: Add logging for combo fetch failures
- **Recommendation**: Track combo add-to-cart success rate

#### 5. Rollback Strategy
✅ **PASS** - Easy rollback available
- Can revert to hardcoded data by reverting page.tsx
- Database changes are additive, not breaking

### Integration Recommendations
1. Create `get_active_combos` database function
2. Extend `get_product_with_variants` to detect and handle combos
3. Add error boundaries around combo components
4. Log combo-related errors for monitoring

---

## Summary of Expert Findings

### Critical Issues (Must Fix)
1. ❌ Homepage shows hardcoded placeholder data instead of real combos
2. ❌ Product detail page shows blank for combos (missing combo fields)
3. ❌ `get_product_with_variants` doesn't return combo data

### High Priority (Should Fix)
1. ⚠️ No loading states for combo fetch
2. ⚠️ No error handling for combo fetch failures
3. ⚠️ Combo images not fetched (use constituent images as fallback)

### Low Priority (Nice to Have)
1. 💡 Add combo-specific monitoring/logging
2. 💡 Add "Coming Soon" state for empty combos
3. 💡 Cache combo data for homepage (5 min TTL)

---

## Approved Approach

Based on expert panel consultation, the approved approach is:

### 1. Database Changes
- Create `get_active_combos()` function for homepage
- Extend `get_product_with_variants()` to include combo fields and constituents

### 2. Frontend Changes
- Replace hardcoded combo section in `src/app/page.tsx` with dynamic data
- Modify `src/app/product/[slug]/page.tsx` to detect combos and render ComboDetailClient
- Add loading and error states

### 3. API Changes
- Create `/api/products/combos` endpoint for homepage (optional, can use direct Supabase call)

### 4. No Breaking Changes
- All changes are additive
- Existing functionality preserved
- Easy rollback if issues arise

---

**Phase 2 Status**: ✅ COMPLETE
**Next**: Phase 3 - Consistency Check
