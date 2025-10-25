# 🔍 REVIEW ELIGIBILITY DEBUG REPORT

## Issue: User sees "You must purchase before reviewing" despite item being delivered

---

## Database State Verification ✅

```sql
-- Query Result:
order_id: 7c27ce5a-4744-49c1-8cf3-c954cc2db0d3
order_number: ORD-20251024-82773
order_status: "confirmed"       ← Order level
item_status: "delivered"         ← Item level ✅ 
item_delivered_at: 2025-10-24 04:15:27
product_name: "nail polish"
customer_email: "aakriti@gmail.com"
has_existing_review: false       ← User hasn't reviewed yet ✅
```

**Database Verdict**: User SHOULD be eligible to review!

---

## API Code Analysis

### Current Query (Line 82-95):
```typescript
const { data: orderData, error: orderError } = await supabase
  .from('orders')
  .select(`
    id,
    status,
    delivered_at,
    order_items!inner(product_id, fulfillment_status, delivered_at)
  `)
  .eq('user_id', user.id)
  .eq('order_items.product_id', productId)
  .eq('order_items.fulfillment_status', 'delivered')
  .order('order_items.delivered_at', { ascending: false, nullsFirst: false })
  .limit(1)
  .maybeSingle();
```

### Potential Issues:

#### Issue #1: PostgREST Ordering on Nested Resources
**Problem**: PostgREST might not support `.order('order_items.delivered_at', ...)` syntax
**Evidence**: This is non-standard PostgREST syntax for embedded resources

#### Issue #2: Inner Join Returns Array
**Problem**: `order_items!inner(...)` returns an ARRAY of order items, not a single item
**Evidence**: Even with `maybeSingle()`, the `order_items` field will be an array

**Example Response Shape**:
```json
{
  "id": "order-uuid",
  "status": "confirmed",
  "delivered_at": null,
  "order_items": [
    {
      "product_id": "product-uuid",
      "fulfillment_status": "delivered",
      "delivered_at": "2025-10-24T04:15:27"
    }
  ]
}
```

#### Issue #3: Wrong Field for Delivery Date
**Problem**: Code checks `orderData.delivered_at` (order level)
**Reality**: Should check `orderData.order_items[0].delivered_at` (item level)

---

## Root Cause Hypothesis

The query IS returning data, BUT the code at line 104-119 is checking the wrong fields:

```typescript
// Line 104-119 (currently):
if (orderData.delivered_at) {
  const deliveredDate = new Date(orderData.delivered_at);
  // ... 90-day check ...
}
```

**Problem**: `orderData.delivered_at` is NULL (order-level), even though the item IS delivered!

---

## Required Fixes

### Fix #1: Simplify Query to Get Item Data Directly

Instead of querying `orders` with embedded `order_items`, query `order_items` directly:

```typescript
const { data: orderItem, error } = await supabase
  .from('order_items')
  .select(`
    id,
    order_id,
    product_id,
    fulfillment_status,
    delivered_at,
    order:orders!inner(
      user_id,
      status
    )
  `)
  .eq('order.user_id', user.id)
  .eq('product_id', productId)
  .eq('fulfillment_status', 'delivered')
  .order('delivered_at', { ascending: false, nullsFirst: false })
  .limit(1)
  .maybeSingle();

if (!orderItem) {
  return { canReview: false, reason: 'NO_PURCHASE' };
}

// Now we have direct access to:
// - orderItem.order_id
// - orderItem.delivered_at (item level!)
// - orderItem.fulfillment_status
```

### Fix #2: Update 90-Day Check

```typescript
// Use item-level delivered_at
if (orderItem.delivered_at) {
  const deliveredDate = new Date(orderItem.delivered_at);
  const daysSinceDelivery = Math.floor(
    (Date.now() - deliveredDate.getTime()) / (1000 * 60 * 60 * 24)
  );

  if (daysSinceDelivery > 90) {
    return NextResponse.json({
      canReview: false,
      orderId: null,
      reason: 'REVIEW_WINDOW_EXPIRED',
      message: 'Review period has expired (90 days after delivery)'
    });
  }
}

// User is eligible!
return NextResponse.json({
  canReview: true,
  orderId: orderItem.order_id,  // ← Return the order_id
  reason: null,
  message: 'You can review this product'
});
```

---

## Why Current Code Fails

1. Query returns: `{ id: "order-uuid", delivered_at: null, order_items: [...] }`
2. Code checks: `if (orderData.delivered_at)` → **false** (it's null!)
3. Code skips 90-day check (good)
4. Code returns: `{ canReview: true, orderId: orderData.id }`

**Wait... if this is the case, it SHOULD work!**

Let me re-analyze...

---

## Alternative Hypothesis: Query Returns NO Results

Maybe the PostgREST query is malformed and returns `null`:

```typescript
const { data: orderData, error: orderError } = await supabase
  .from('orders')
  .select(...)
  .eq('order_items.fulfillment_status', 'delivered')  // ← This might not work!
  .order('order_items.delivered_at', ...)              // ← This might fail!
  .maybeSingle();

if (orderError || !orderData) {  // ← If orderData is null, we hit this!
  return NextResponse.json({
    canReview: false,
    reason: 'NO_PURCHASE',
    message: 'You must purchase this product before reviewing it'
  });
}
```

**This is the most likely issue!**

---

## Testing Plan

### Test 1: Add Debug Logging

Add to `src/app/api/user/reviews/eligibility/route.ts` (line 96):

```typescript
const { data: orderData, error: orderError } = await supabase
  .from('orders')
  .select(...)
  .maybeSingle();

// DEBUG: Log what we actually got
console.log('[Eligibility Debug] Query result:', {
  hasData: !!orderData,
  error: orderError,
  orderData: JSON.stringify(orderData, null, 2)
});

if (orderError || !orderData) {
  console.error('[Eligibility Debug] NO ORDER DATA FOUND!');
  return NextResponse.json(...);
}
```

### Test 2: Browser Console

When user visits product page:
1. Open browser DevTools (F12)
2. Go to Network tab
3. Filter for "eligibility"
4. Refresh page
5. Check the API response

Expected if bug exists:
```json
{
  "canReview": false,
  "orderId": null,
  "reason": "NO_PURCHASE",
  "message": "You must purchase this product before reviewing it"
}
```

### Test 3: Direct API Test

```bash
# Get auth token from browser (DevTools → Application → Cookies → sb-access-token)
curl 'http://localhost:3000/api/user/reviews/eligibility?productId=e2353d46-b528-47e1-b3c3-46ec2f1463c8' \\
  -H 'Cookie: sb-access-token=YOUR_TOKEN'
```

---

## NEXT STEPS

1. ✅ Add debug logging to API route
2. ✅ Test API endpoint with user's auth token
3. ✅ Fix query based on findings
4. ✅ Retest on frontend

**Most Likely Fix Needed**: Rewrite query to start from `order_items` table instead of `orders` table.
