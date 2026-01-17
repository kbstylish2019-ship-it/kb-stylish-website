# Phase 4: Solution Blueprint - Combo Products Completion

**Date**: January 16, 2026
**Status**: COMPLETE

---

## Problem Statement

The Combo Products feature has database and backend implementation complete, but the frontend display is broken:

1. **Homepage**: Shows hardcoded placeholder data instead of real combos
2. **Product Detail Page**: Shows blank (Rs. 0, Out of Stock) for combo products
3. **Missing Data**: `get_product_with_variants` doesn't return combo fields

---

## Proposed Solution

### Approach: Surgical Fix (Minimal Changes)

**Justification**: 
- Database schema and functions already exist
- ComboDetailClient component already exists
- Only need to connect frontend to backend

---

## Technical Design

### 1. Database Changes

#### 1.1 Create `get_active_combos` Function
Purpose: Fetch active combos for homepage display

```sql
CREATE OR REPLACE FUNCTION get_active_combos(p_limit INTEGER DEFAULT 8)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public', 'pg_temp'
AS $$
DECLARE
  result JSON;
BEGIN
  SELECT json_agg(combo_data ORDER BY combo_data->>'created_at' DESC)
  INTO result
  FROM (
    SELECT json_build_object(
      'id', p.id,
      'name', p.name,
      'slug', p.slug,
      'description', p.description,
      'combo_price_cents', p.combo_price_cents,
      'combo_savings_cents', p.combo_savings_cents,
      'combo_quantity_limit', p.combo_quantity_limit,
      'combo_quantity_sold', p.combo_quantity_sold,
      'item_count', (SELECT COUNT(*) FROM combo_items ci WHERE ci.combo_product_id = p.id),
      'image_url', COALESCE(
        (SELECT pi.image_url FROM product_images pi WHERE pi.product_id = p.id ORDER BY pi.sort_order LIMIT 1),
        (SELECT pi.image_url FROM combo_items ci 
         JOIN product_images pi ON pi.product_id = ci.constituent_product_id 
         WHERE ci.combo_product_id = p.id ORDER BY ci.display_order, pi.sort_order LIMIT 1)
      ),
      'created_at', p.created_at
    ) as combo_data
    FROM products p
    WHERE p.is_combo = true AND p.is_active = true
    LIMIT p_limit
  ) subq;
  
  RETURN COALESCE(result, '[]'::json);
END;
$$;
```

#### 1.2 Extend `get_product_with_variants` Function
Purpose: Return combo fields and constituent data for combo products

Changes:
- Add combo fields to product JSON (is_combo, combo_price_cents, combo_savings_cents, etc.)
- Add combo_items array with constituent product/variant data
- Use constituent images as fallback when combo has no images

### 2. Frontend Changes

#### 2.1 Homepage (`src/app/page.tsx`)

**Current** (lines 208-265): Hardcoded combo cards
**New**: Dynamic combo section with real data

```typescript
// Fetch combos in Server Component
const { data: combos } = await supabase.rpc('get_active_combos', { p_limit: 4 });

// Render dynamic combo cards
{combos?.length > 0 ? (
  combos.map((combo) => <ComboCard key={combo.id} combo={combo} />)
) : (
  <p>No combo deals available</p>
)}
```

#### 2.2 Product Detail Page (`src/app/product/[slug]/page.tsx`)

**Current**: Always renders ProductDetailClient
**New**: Detect combo and render ComboDetailClient

```typescript
// Check if product is a combo
if (productData.product.is_combo) {
  // Fetch combo constituents
  const constituents = productData.combo_items || [];
  return <ComboDetailClient combo={productData.product} constituents={constituents} />;
}

// Regular product
return <ProductDetailClient product={product} />;
```

#### 2.3 API Client (`src/lib/apiClient.ts`)

Extend `fetchProductBySlug` to handle combo data:
- Include combo fields in return type
- Include combo_items in return data

### 3. Type Updates

#### 3.1 Extend ProductWithVariants Type
```typescript
interface ProductWithVariants {
  product: {
    // ... existing fields
    is_combo?: boolean;
    combo_price_cents?: number;
    combo_savings_cents?: number;
    combo_quantity_limit?: number;
    combo_quantity_sold?: number;
  };
  variants: ProductVariant[];
  images: ProductImage[];
  inventory: Record<string, InventoryData>;
  combo_items?: ComboItem[]; // NEW
}
```

---

## Impact Analysis

### Files to Modify

| File | Change Type | Risk |
|------|-------------|------|
| `supabase/migrations/XXXXXX_get_active_combos.sql` | CREATE | Low |
| `supabase/migrations/XXXXXX_extend_get_product_with_variants.sql` | ALTER | Medium |
| `src/app/page.tsx` | MODIFY | Low |
| `src/app/product/[slug]/page.tsx` | MODIFY | Medium |
| `src/lib/apiClient.ts` | MODIFY | Low |
| `src/lib/types.ts` | MODIFY | Low |

### Breaking Changes
**NONE** - All changes are additive

### Rollback Plan
1. Revert `src/app/page.tsx` to hardcoded data
2. Revert `src/app/product/[slug]/page.tsx` to always use ProductDetailClient
3. Database functions can remain (no harm)

---

## Security Considerations

- ✅ Public read access for combo data (same as products)
- ✅ No sensitive data exposed
- ✅ Parameterized queries prevent SQL injection
- ✅ Rate limiting applies to all endpoints

---

## Performance Considerations

- ✅ Single query for homepage combos (no N+1)
- ✅ Single query for combo detail (includes constituents)
- ✅ Images served from CDN
- ⚠️ Consider caching homepage combos (future optimization)

---

## Testing Strategy

### Manual Testing
1. Create combo via vendor portal
2. Verify combo appears on homepage
3. Click combo card → verify detail page loads
4. Verify constituent products displayed
5. Add combo to cart → verify all items added
6. Complete checkout → verify order created

### Automated Testing
- Existing E2E tests cover combo creation
- Add test for homepage combo display
- Add test for combo detail page

---

## Deployment Plan

### Step 1: Database Migration
```bash
# Apply get_active_combos function
supabase db push

# Apply extended get_product_with_variants
supabase db push
```

### Step 2: Frontend Deployment
```bash
# Deploy updated pages
vercel deploy
```

### Step 3: Verification
1. Check homepage shows real combos
2. Check combo detail page works
3. Check add to cart works
4. Monitor for errors

---

## Success Criteria

- [ ] Homepage shows real combo products from database
- [ ] Combo detail page shows correct price, images, constituents
- [ ] Add to cart works for combos
- [ ] No console errors
- [ ] No broken images
- [ ] Mobile responsive

---

**Phase 4 Status**: ✅ COMPLETE
**Next**: Phase 5-7 - Blueprint Review (consolidated)
