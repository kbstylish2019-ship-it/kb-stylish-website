# 🎯 Booking/Service Checkout Implementation Plan

**Date:** 2025-10-05 16:40 NPT  
**Issue:** Bookings are not included in order processing  
**Impact:** Users pay for bookings but they don't get confirmed

---

## Current State Analysis

### Database Schema
```sql
-- Products flow
cart_items → order_items (✅ WORKING)

-- Bookings flow  
booking_reservations → ??? (❌ MISSING)
                    → bookings (should be created on payment)
```

### Tables Involved
1. **`booking_reservations`**: Temporary 15-minute holds
   - Columns: id, customer_user_id, stylist_user_id, service_id, start_time, end_time, price_cents, status='reserved', expires_at
   
2. **`bookings`**: Confirmed bookings (after payment)
   - Columns: id, customer_user_id, stylist_user_id, service_id, start_time, end_time, price_cents, status, payment_intent_id, order_item_id

3. **`order_items`**: Product orders (currently products only)
   - Columns: id, order_id, variant_id, product_id, vendor_id, quantity, unit_price_cents

---

## Implementation Plan

### Phase 1: Extend get_cart_details_secure()
**File:** Database function  
**Change:** Include booking reservations in cart response

```sql
CREATE OR REPLACE FUNCTION public.get_cart_details_secure(
  p_user_id uuid DEFAULT NULL,
  p_guest_token text DEFAULT NULL
)
RETURNS jsonb AS $$
DECLARE
  v_cart_id UUID;
  v_result JSONB;
BEGIN
  v_cart_id := public.get_or_create_cart_secure(p_user_id, p_guest_token);

  SELECT jsonb_build_object(
    'id', c.id,
    'user_id', c.user_id,
    'session_id', c.session_id,
    
    -- EXISTING: Product items
    'items', COALESCE((
      SELECT jsonb_agg(...)
      FROM cart_items ci
      WHERE ci.cart_id = c.id
    ), '[]'::jsonb),
    
    -- NEW: Booking reservations
    'bookings', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', br.id,
        'service_id', br.service_id,
        'stylist_user_id', br.stylist_user_id,
        'start_time', br.start_time,
        'end_time', br.end_time,
        'price_cents', br.price_cents,
        'customer_name', br.customer_name,
        'customer_phone', br.customer_phone,
        'customer_email', br.customer_email,
        'expires_at', br.expires_at,
        'service_name', s.name,
        'stylist_name', up.display_name
      ))
      FROM booking_reservations br
      JOIN services s ON s.id = br.service_id
      JOIN user_profiles up ON up.user_id = br.stylist_user_id
      WHERE br.customer_user_id = c.user_id
        AND br.status = 'reserved'
        AND br.expires_at > NOW()
    ), '[]'::jsonb),
    
    'subtotal', COALESCE(...) + COALESCE((
      SELECT SUM(br.price_cents) 
      FROM booking_reservations br 
      WHERE br.customer_user_id = c.user_id AND br.status = 'reserved' AND br.expires_at > NOW()
    ), 0),
    
    'item_count', COALESCE(...) + COALESCE((
      SELECT COUNT(*) FROM booking_reservations br 
      WHERE br.customer_user_id = c.user_id AND br.status = 'reserved' AND br.expires_at > NOW()
    ), 0)
  )
  INTO v_result
  FROM carts c
  WHERE c.id = v_cart_id;

  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

### Phase 2: Update create-order-intent
**File:** `supabase/functions/create-order-intent/index.ts`  
**Change:** Include booking prices in total calculation

```typescript
// Calculate total from products
const product_total = cart.items.reduce((sum, item) => 
  sum + (Math.round(item.price_snapshot * 100) * item.quantity), 0
);

// Calculate total from bookings
const booking_total = (cart.bookings || []).reduce((sum, booking) =>
  sum + booking.price_cents, 0
);

const subtotal_cents = product_total + booking_total;
```

### Phase 3: Update process_order_with_occ()
**File:** Database function  
**Change:** Convert booking_reservations → bookings on payment

```sql
CREATE OR REPLACE FUNCTION public.process_order_with_occ(
  p_payment_intent_id text,
  p_webhook_event_id uuid DEFAULT NULL
)
RETURNS jsonb AS $$
DECLARE
  v_order_id UUID;
  v_items_created INT;
  v_bookings_created INT;
BEGIN
  -- ... existing order creation ...
  
  -- Create order_items for products (EXISTING)
  INSERT INTO order_items (...)
  SELECT ... FROM cart_items ci WHERE ci.cart_id = v_cart_id;
  
  GET DIAGNOSTICS v_items_created = ROW_COUNT;
  
  -- NEW: Convert reservations to confirmed bookings
  INSERT INTO bookings (
    customer_user_id,
    stylist_user_id,
    service_id,
    start_time,
    end_time,
    price_cents,
    status,
    payment_intent_id,
    customer_name,
    customer_phone,
    customer_email,
    customer_notes,
    created_at,
    updated_at
  )
  SELECT
    br.customer_user_id,
    br.stylist_user_id,
    br.service_id,
    br.start_time,
    br.end_time,
    br.price_cents,
    'confirmed'::TEXT,
    p_payment_intent_id,
    br.customer_name,
    br.customer_phone,
    br.customer_email,
    br.customer_notes,
    NOW(),
    NOW()
  FROM booking_reservations br
  WHERE br.customer_user_id = v_user_id
    AND br.status = 'reserved'
    AND br.expires_at > NOW();
  
  GET DIAGNOSTICS v_bookings_created = ROW_COUNT;
  
  -- Validation: At least one item OR booking must exist
  IF v_items_created = 0 AND v_bookings_created = 0 THEN
    RAISE EXCEPTION 'Cart is empty, cannot create order without items or bookings';
  END IF;
  
  -- Clear both cart_items AND booking_reservations
  DELETE FROM cart_items WHERE cart_id = v_cart_id;
  DELETE FROM booking_reservations 
  WHERE customer_user_id = v_user_id 
    AND status = 'reserved';
  
  RETURN jsonb_build_object(
    'success', true,
    'order_id', v_order_id,
    'order_number', v_order_number,
    'items_created', v_items_created,
    'bookings_created', v_bookings_created
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

---

## Testing Plan

### Test Case 1: Product Only
- Add 1 product to cart
- Checkout
- ✅ Expect: Order created with 1 item, 0 bookings

### Test Case 2: Booking Only
- Add 1 booking reservation
- Checkout
- ✅ Expect: Order created with 0 items, 1 booking

### Test Case 3: Mixed (YOUR CASE)
- Add 1 product + 1 booking
- Checkout
- ✅ Expect: Order created with 1 item, 1 booking
- ✅ Expect: Cart cleared (both products AND bookings)

### Test Case 4: Multiple Bookings
- Add 2 bookings + 3 products
- Checkout
- ✅ Expect: Order with 3 items, 2 bookings

---

## Deployment Strategy

1. **Deploy database migrations** (get_cart_details_secure, process_order_with_occ)
2. **Deploy create-order-intent Edge Function** (updated total calculation)
3. **Test with real payment** (product + booking)
4. **Monitor** booking_reservations clearing

---

## Success Criteria

✅ Payment amount includes both products AND bookings  
✅ process_order_with_occ creates bookings table entries  
✅ booking_reservations are deleted after payment  
✅ Cart shows 0 items AND 0 bookings after payment  
✅ User can see confirmed bookings in "My Bookings" page

---

**Status:** Implementation in progress  
**ETA:** 30 minutes
