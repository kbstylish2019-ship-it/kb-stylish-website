# Phase F: Remove Button Bug Fix + Logo Update

## Date: January 18, 2026

## Issues Fixed

### 1. Remove Button Removing Wrong Item

**Problem**: When clicking "Remove" on a regular product, the wrong item was being removed (often the first combo item or a different product). Console showed `id: undefined`.

**Root Cause**: 
- The database function `get_cart_details_secure` was NOT returning the `cart_items.id` field
- The frontend transformation expected `item.id` but it was undefined
- This caused the removal to fail with "cart_item_id or variant_id is required"

**Solution**:
1. Created new database function `remove_cart_item_by_id_secure` that removes by `cart_items.id` directly
2. Updated `get_cart_details_secure` to include `'id', ci.id` in the response
3. Updated edge function to accept `cart_item_id` parameter and use the new function
4. Updated cartAPI to pass `cart_item_id` directly instead of converting to `variant_id`
5. Added debug logging to trace the issue

**Files Changed**:
- `supabase/migrations/20260118_fix_remove_by_cart_item_id.sql` - New removal function
- `supabase/migrations/20260118_add_id_to_cart_details.sql` - Fixed get_cart_details to include id
- `supabase/functions/cart-manager/index.ts` - Added `removeFromCartById` function and updated remove action
- `src/lib/api/cartClient.ts` - Simplified `removeFromCart` to pass cart_item_id directly
- `src/lib/store/decoupledCartStore.ts` - Added debug logging
- `src/components/checkout/CheckoutClient.tsx` - Added debug logging

### 2. Logo Update

**Problem**: Header showed "KB" text logo instead of actual logo image, and slogan was "Beauty & Salon Products" instead of "Friendly, hygienic and affordable"

**Solution**: Replaced the text logo with the actual logo image from `/kbStylishlogo.png` and updated the slogan.

**Files Changed**:
- `src/components/layout/Header.tsx` - Replaced KB text with logo image and updated slogan

## Technical Details

### Database Functions

```sql
-- New removal function (precise)
CREATE OR REPLACE FUNCTION public.remove_cart_item_by_id_secure(
  p_cart_item_id UUID,
  p_user_id UUID DEFAULT NULL,
  p_guest_token TEXT DEFAULT NULL
) RETURNS JSONB

-- Updated cart details function (now includes id)
CREATE OR REPLACE FUNCTION public.get_cart_details_secure(
  p_user_id UUID DEFAULT NULL,
  p_guest_token TEXT DEFAULT NULL
) RETURNS JSONB
-- Now returns: 'id', ci.id in each cart item
```

### Edge Function Changes

```typescript
case 'remove':
  if (cart_item_id) {
    // Use the new precise removal by cart_item_id
    response = await removeFromCartById(serviceClient, authenticatedUser, guestToken, cart_item_id);
  } else {
    // Legacy: remove by variant_id (may remove wrong item if duplicates exist)
    response = await removeFromCart(serviceClient, authenticatedUser, guestToken, variant_id);
  }
  break;
```

Supports both methods for backward compatibility, but prefers `cart_item_id`.

### CartAPI Changes

```typescript
async removeFromCart(itemId: string): Promise<CartResponse> {
  // Now passes cart_item_id directly
  body: JSON.stringify({
    action: 'remove',
    cart_item_id: itemId,
  }),
}
```

Simplified - no longer needs to fetch cart and find variant_id.

## Testing

To test the fix:
1. Refresh the page to get the updated cart data with `id` fields
2. Add a combo to cart
3. Add a regular product (same or different variant)
4. Click "Remove" on the regular product
5. Verify that the correct item is removed, not the combo or another item

## Status

✅ Database migrations applied
✅ Edge function updated (needs deployment)
✅ Frontend code updated
✅ Logo updated
✅ Debug logging added

## Next Steps

1. Deploy the updated edge function to production
2. Test the remove functionality with combos and regular products
3. Verify logo displays correctly on all pages
4. Remove debug logging once confirmed working

## Notes

- The old `remove_item_secure` function (removes by variant_id) is still available for backward compatibility
- The new function is more precise and should be used for all new code
- This fix is especially important for combo products where multiple cart items may have the same variant_id
- The root cause was that `get_cart_details_secure` was missing the `id` field in its response
