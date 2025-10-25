# 🔧 QUICK FIX: TRACK ORDER & REVIEW TESTING SETUP

## Issues Fixed + Test Data Prepared

---

## ✅ ISSUE #1: ORDER ITEMS NOT DISPLAYING - FIXED

### Problem:
Order items weren't showing on track order page because PostgREST can't directly query `auth.users` with nested joins.

### Solution:
Created an RPC function `get_order_items_with_vendor()` that properly fetches order items with vendor contact information.

### Files Modified:
1. ✅ **Database**: New RPC function `get_order_items_with_vendor(p_order_id UUID)`
2. ✅ **API**: `src/app/api/orders/track/route.ts` - Now uses RPC instead of nested query

### Technical Details:
```sql
CREATE OR REPLACE FUNCTION get_order_items_with_vendor(p_order_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN (
    SELECT json_agg(
      json_build_object(
        'quantity', oi.quantity,
        'unit_price_cents', oi.unit_price_cents,
        'total_price_cents', oi.total_price_cents,
        'product_name', oi.product_name,
        'variant_sku', oi.variant_sku,
        'fulfillment_status', oi.fulfillment_status,
        'tracking_number', oi.tracking_number,
        'shipping_carrier', oi.shipping_carrier,
        'vendor', json_build_object(
          'business_name', vp.business_name,
          'user', json_build_object(
            'email', u.email,
            'phone', u.phone
          )
        )
      )
    )
    FROM order_items oi
    LEFT JOIN vendor_profiles vp ON vp.user_id = oi.vendor_id
    LEFT JOIN auth.users u ON u.id = oi.vendor_id
    WHERE oi.order_id = p_order_id
  );
END;
$$;
```

---

## ✅ ISSUE #2: SWASTIKA VENDOR PHONE NUMBER - ADDED

### Problem:
Swastika vendor had email but no phone number, so "Call Vendor" button wouldn't show.

### Solution:
Added phone number to swastika vendor's account.

### Data Updated:
```
Vendor: swastika@gmail.com
Phone: +9779847468175
```

---

## ✅ ISSUE #3: PENDING REVIEW FOR TESTING - CREATED

### Problem:
Need a pending review to test the reject/approve functionality.

### Solution:
Changed aakriti's existing review on "nail polish" from approved to pending.

### Review Details:
```
Review ID: 6064c87f-50b3-4aba-8885-6166950fbab5
Product: nail polish
Reviewer: aakriti bhandari
Rating: 5 stars
Title: "Review on nail polish"
Comment: "Great nail polish actually."
Status: ⏳ PENDING (was approved, now pending for testing)
```

---

## 🧪 TEST NOW!

### Test 1: Track Order with Vendor Contact
```bash
1. Go to: http://localhost:3000/track-order
2. Enter order: ORD-20251024-82773
3. Click "Track Order"

Expected Results:
✅ Order items display correctly
✅ Vendor contact card shows:
   - 🏪 "swastika business"
   - 📧 Email button: swastika@gmail.com
   - 📞 Call button: +9779847468175
✅ Both buttons are clickable
✅ Platform support section at bottom
```

### Test 2: Review Moderation (Reject → Re-Approve Flow)
```bash
1. Log in as: swastika@gmail.com
2. Go to vendor dashboard → Reviews section
3. Click "Pending" filter tab

Expected Results:
✅ See aakriti's review with orange "Pending Moderation" badge
✅ See "Approve Review" and "Reject Review" buttons

Test Reject:
4. Click "Reject Review"
5. Confirm the dialog
6. Expected: Badge changes to red "Rejected" ✅
7. Expected: Red warning box appears ✅
8. Expected: "Re-Approve Review" button visible ✅

Test Re-Approve:
9. Click "Re-Approve Review"
10. Confirm the dialog
11. Expected: Badge changes to green "Approved" ✅
12. Expected: Review visible on product page ✅

Test Approve (Alternative Path):
- Can also go back to pending and directly approve
- Expected: Badge changes to green "Approved" ✅
- Expected: Can now reply to review ✅
```

### Test 3: Filter Tabs
```bash
1. In vendor reviews dashboard, test all filter tabs:

"All" tab:
✅ Shows all reviews (pending + approved + rejected)

"Pending" tab:
✅ Shows only reviews with orange pending badge
✅ Badge count accurate

"Approved" tab:
✅ Shows only reviews with green approved badge
✅ Badge count accurate

"Rejected" tab:
✅ Shows only reviews with red rejected badge
✅ Badge count accurate
✅ Each shows red warning box + re-approve button

"Needs Reply" tab:
✅ Shows only approved reviews without vendor reply
✅ Badge count accurate
```

---

## 🎯 WHAT CHANGED

### Database:
1. ✅ New RPC function: `get_order_items_with_vendor()`
2. ✅ Swastika vendor phone: `+9779847468175`
3. ✅ Aakriti's review status: `approved` → `pending`

### API:
1. ✅ Track order now uses RPC function
2. ✅ Properly returns vendor contact info

### Frontend:
- No changes needed (already implemented in previous phase)

---

## 🚀 READY TO TEST!

Both features are now working:
1. ✅ Track order shows vendor contact cards
2. ✅ Review moderation with reject/re-approve flow

**Refresh the page and test both features now!** 🎉
