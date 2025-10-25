# 🧪 TRUST ENGINE - COMPLETE TESTING MANUAL

**Date**: October 21, 2025  
**System**: KB Stylish Trust Engine  
**Test Users**: 
- Customer: `shishirbhusal08@gmail.com` (ID: `8e80ead5-ce95-4bad-ab30-d4f54555584b`)
- Vendor: `vendor.trust@kbstylish.test` (ID: `0b7682f9-1a7b-4a88-a961-604ffc8604f4`)

---

## 🔴 CURRENT ISSUE: Review-Manager Error

### Problem
The review-manager v15 is returning **400 errors** when fetching reviews.

**Error Log**:
```
POST | 400 | https://poxjcaogjupsplrcliau.supabase.co/functions/v1/review-manager
```

### Root Cause
The query is likely failing on the **inner join** for `user_profiles`. If a review exists but the user profile is missing, the query fails.

### Quick Fix
I need to change the inner join to a left join:

```typescript
// BEFORE (fails if user_profiles missing):
user:user_profiles!inner(display_name, avatar_url)

// AFTER (handles missing profiles):
user:user_profiles(display_name, avatar_url)
```

Let me deploy this fix now before continuing with testing.

---

## 📋 TESTING CHECKLIST

### Phase 1: Review Eligibility ✅
- [ ] Customer can see "Write a Review" button only on purchased products
- [ ] Customer sees "You must purchase this product" message on non-purchased products
- [ ] Eligibility check happens server-side (cannot be bypassed)
- [ ] 90-day review window enforced

### Phase 2: Review Submission
- [ ] Customer can submit review with rating 1-5
- [ ] Customer can add title and comment
- [ ] Review requires existing order (purchase verification)
- [ ] Rate limiting works (5 reviews per hour)
- [ ] CSRF token required (security)
- [ ] Duplicate reviews prevented

### Phase 3: Review Display
- [ ] Reviews show on product pages
- [ ] Star ratings displayed correctly
- [ ] Review count accurate
- [ ] Sorting works (recent, helpful)
- [ ] Pagination works
- [ ] Vendor replies visible

### Phase 4: Voting System
- [ ] Helpful/unhelpful voting works
- [ ] Vote counts update in real-time
- [ ] User's previous votes highlighted
- [ ] Vote state persists across page reloads
- [ ] Duplicate votes prevented

### Phase 5: Vendor Dashboard
- [ ] Vendor can see all reviews on their products
- [ ] Filter by status (pending reply, replied, all)
- [ ] Vendor can reply to reviews
- [ ] Reply shows on product page
- [ ] Tab navigation works

### Phase 6: Product Ratings
- [ ] Average rating calculates correctly
- [ ] Rating distribution shows breakdown
- [ ] Ratings update automatically (every 2 minutes via cron)
- [ ] Product search/filter by rating works

---

## 🧪 TEST SCENARIOS

### Test 1: Customer Cannot Review Un-Purchased Product

**Steps**:
1. Login as `shishirbhusal08@gmail.com`
2. Browse to ANY product you haven't purchased
3. Scroll to reviews section

**Expected Result**:
- ✅ "Write a Review" button is DISABLED or shows message
- ✅ Message: "You must purchase this product before reviewing it"
- ✅ No review form appears

**Current Status**: ⚠️ **FAILING** - All products show this message

---

### Test 2: Customer CAN Review Purchased Product

**Prerequisites**: Customer must have a **delivered** order containing the product

**Steps**:
1. Login as `shishirbhusal08@gmail.com`
2. Browse to a product you've purchased
3. Click "Write a Review"

**Expected Result**:
- ✅ Review form appears
- ✅ Can select rating 1-5 stars
- ✅ Can add title (optional, max 200 chars)
- ✅ Can add comment (optional, max 5000 chars)
- ✅ "Submit Review" button enabled

**How to Create Test Order**:
```sql
-- Run this SQL to create a delivered order for testing
-- (See SQL section below)
```

---

### Test 3: Review Submission Success

**Steps**:
1. Complete Test 2 (review form open)
2. Select 4 stars
3. Title: "Great product!"
4. Comment: "I really enjoyed this product. Quality is excellent."
5. Click "Submit Review"

**Expected Result**:
- ✅ Review submitted successfully
- ✅ Success message appears
- ✅ Review appears on product page (if auto-approved)
- ✅ OR "Under moderation" message (if manual approval needed)
- ✅ Form resets or closes
- ✅ Product rating updates within 2 minutes

---

### Test 4: Rate Limiting Works

**Steps**:
1. Submit 5 reviews quickly on different products
2. Try to submit a 6th review

**Expected Result**:
- ✅ First 5 reviews succeed
- ✅ 6th review fails with error
- ✅ Error message: "Too many review submissions. Please try again in X minutes."
- ✅ Counter shows remaining submissions

---

### Test 5: Duplicate Review Prevention

**Steps**:
1. Submit a review on Product A
2. Try to submit another review on the same Product A

**Expected Result**:
- ✅ Second submission fails
- ✅ Error message: "You have already reviewed this product"

---

### Test 6: Vote on Reviews

**Steps**:
1. View product page with existing reviews
2. Click "Helpful" button on a review
3. Reload the page

**Expected Result**:
- ✅ Vote count increases by 1
- ✅ "Helpful" button shows as selected/highlighted
- ✅ After reload, "Helpful" still highlighted
- ✅ Clicking again removes vote

---

### Test 7: Vendor Sees Reviews

**Steps**:
1. Login as `vendor.trust@kbstylish.test`
2. Go to Vendor Dashboard → Products
3. Click "Customer Reviews" tab

**Expected Result**:
- ✅ All reviews on vendor's products visible
- ✅ Can filter: "Pending Reply" / "Replied" / "All"
- ✅ Review count badges correct
- ✅ Can see customer name, rating, comment
- ✅ Can see which product was reviewed

---

### Test 8: Vendor Replies to Review

**Steps**:
1. Complete Test 7 (viewing reviews)
2. Find a review without a reply
3. Click "Reply" button
4. Type: "Thank you for your feedback! We're glad you enjoyed it."
5. Click "Submit Reply"

**Expected Result**:
- ✅ Reply submitted successfully
- ✅ Reply appears under the review
- ✅ Reply visible on product page (public)
- ✅ Filter "Replied" now includes this review

---

### Test 9: Product Rating Updates Automatically

**Steps**:
1. Note current product rating (e.g., 3.5 stars)
2. Submit 2 new 5-star reviews
3. Wait 2-3 minutes

**Expected Result**:
- ✅ Rating updates to higher value (e.g., 3.8 stars)
- ✅ Review count increases by 2
- ✅ Rating distribution shows breakdown
- ✅ Cron job processes in background

---

### Test 10: CSRF Protection Works

**Steps** (Advanced - requires browser dev tools):
1. Open browser console
2. Try to submit review without CSRF token:
```javascript
fetch('/api/user/reviews/submit', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    productId: 'some-id',
    orderId: 'some-id',
    rating: 5
  })
})
```

**Expected Result**:
- ✅ Request fails with 403 Forbidden
- ✅ Error: "Invalid security token"

---

## 🛠️ TEST DATA SETUP

### Create Test Order for Customer

**Product ID** (use any from vendor): `ff552a71-339a-4bd8-a932-c54d7ee92347`

```sql
-- Step 1: Create an order
INSERT INTO orders (
  id,
  user_id,
  order_number,
  status,
  subtotal_cents,
  tax_cents,
  shipping_cents,
  discount_cents,
  total_cents,
  currency,
  shipping_name,
  shipping_phone,
  shipping_address_line1,
  shipping_city,
  shipping_state,
  shipping_postal_code,
  shipping_country,
  created_at,
  confirmed_at,
  shipped_at,
  delivered_at
)
VALUES (
  gen_random_uuid(),
  '8e80ead5-ce95-4bad-ab30-d4f54555584b', -- Customer
  'TEST-ORDER-' || floor(random() * 100000)::text,
  'delivered', -- MUST be delivered for review eligibility
  150000, -- 1500 NPR subtotal
  0,
  0,
  0,
  150000,
  'NPR',
  'Shishir Bhusal',
  '+977-9876543210',
  'Test Address Line 1',
  'Kathmandu',
  'Bagmati',
  '44600',
  'Nepal',
  NOW() - interval '10 days', -- Ordered 10 days ago
  NOW() - interval '10 days', -- Confirmed immediately
  NOW() - interval '8 days',  -- Shipped 8 days ago
  NOW() - interval '5 days'   -- Delivered 5 days ago (within 90-day window)
)
RETURNING id, order_number;

-- Copy the returned order ID for next step
```

```sql
-- Step 2: Add product to order (use order ID from step 1)
INSERT INTO order_items (
  id,
  order_id,
  product_id,
  variant_id,
  quantity,
  unit_price_cents,
  total_price_cents,
  product_snapshot
)
SELECT 
  gen_random_uuid(),
  'YOUR_ORDER_ID_HERE', -- Replace with order ID from step 1
  'ff552a71-339a-4bd8-a932-c54d7ee92347', -- Product ID
  v.id, -- First variant
  1,
  v.price * 100, -- Convert to cents
  v.price * 100,
  jsonb_build_object(
    'name', p.name,
    'variant_name', 'Standard',
    'sku', v.sku
  )
FROM products p
JOIN product_variants v ON v.product_id = p.id
WHERE p.id = 'ff552a71-339a-4bd8-a932-c54d7ee92347'
LIMIT 1;
```

### Verify Test Data

```sql
-- Check orders for customer
SELECT 
  o.id,
  o.order_number,
  o.status,
  o.delivered_at,
  oi.product_id,
  p.name as product_name
FROM orders o
JOIN order_items oi ON oi.order_id = o.id
JOIN products p ON p.id = oi.product_id
WHERE o.user_id = '8e80ead5-ce95-4bad-ab30-d4f54555584b'
  AND o.status = 'delivered'
ORDER BY o.created_at DESC;
```

---

## 🔍 DEBUGGING COMMANDS

### Check Review Eligibility (SQL)
```sql
SELECT check_review_eligibility(
  '8e80ead5-ce95-4bad-ab30-d4f54555584b', -- User ID
  'ff552a71-339a-4bd8-a932-c54d7ee92347'  -- Product ID
) as eligibility;
```

### Check Existing Reviews
```sql
SELECT 
  r.id,
  r.rating,
  r.title,
  r.comment,
  r.is_approved,
  r.created_at,
  p.name as product_name,
  u.display_name as reviewer
FROM reviews r
JOIN products p ON p.id = r.product_id
JOIN user_profiles u ON u.id = r.user_id
WHERE r.product_id = 'ff552a71-339a-4bd8-a932-c54d7ee92347'
ORDER BY r.created_at DESC;
```

### Check Product Ratings
```sql
SELECT 
  id,
  name,
  average_rating,
  review_count,
  rating_distribution
FROM products
WHERE id = 'ff552a71-339a-4bd8-a932-c54d7ee92347';
```

### Check Job Queue Status
```sql
SELECT 
  id,
  job_type,
  status,
  payload->>'product_id' as product_id,
  attempts,
  created_at
FROM job_queue
WHERE job_type = 'update_product_rating'
ORDER BY created_at DESC
LIMIT 20;
```

### Check Cron Job Status
```sql
SELECT 
  jobid,
  jobname,
  schedule,
  active,
  command
FROM cron.job
WHERE jobname = 'ratings-worker-auto-trigger';
```

---

## 🚨 KNOWN ISSUES

### Issue 1: Review-Manager 400 Error ⚠️
**Status**: ACTIVE  
**Cause**: Inner join failing when user_profiles missing  
**Fix**: Deploy updated review-manager with left join  
**ETA**: 2 minutes

### Issue 2: All Products Show "Must Purchase" ⚠️
**Status**: INVESTIGATING  
**Cause**: No test orders exist for customer  
**Fix**: Create test order using SQL above  
**ETA**: Manual setup required

---

## ✅ SUCCESS CRITERIA

### Minimum Viable Test
- [ ] Customer can see eligibility correctly (purchased vs not purchased)
- [ ] Customer can submit review on purchased product
- [ ] Review appears on product page
- [ ] Product rating updates automatically
- [ ] Vendor can see and reply to review

### Full Production Test
- [ ] All 10 test scenarios pass
- [ ] No console errors
- [ ] No 400/500 errors in network tab
- [ ] Performance < 500ms for review fetch
- [ ] CSRF and rate limiting working

---

## 📞 SUPPORT

**Issue**: Review-manager returns 400 error  
**Next Step**: Deploy fixed review-manager (in progress)

**Issue**: Cannot find reviewable products  
**Next Step**: Create test order using SQL above

**Issue**: Reviews not appearing  
**Next Step**: Check moderation_status = 'approved' in database

---

**Testing starts after fixing the 400 error and creating test orders!**
