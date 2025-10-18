# 🧪 CURATION UI - TESTING GUIDE

**Date**: October 17, 2025  
**Status**: ✅ **READY FOR TESTING**  
**Mission**: Test frontend integration for Curation & Ranking Engine  
**Blueprint**: Fortress Architecture v2.1 - Week 3  

---

## 📋 PRE-TESTING CHECKLIST

### Prerequisites (MUST COMPLETE FIRST)
- [ ] **Week 1 migrations deployed** (database functions exist)
- [ ] **Week 2 Edge Function deployed** (`get-curated-content` active)
- [ ] **Redis configured** (environment variables set)
- [ ] **Frontend code deployed** (Week 3 refactoring complete)

---

## 🧪 TESTING SCENARIOS

### Test 1: Homepage - Trending Products

**Objective**: Verify trending products display with live data

**Steps**:
1. Navigate to homepage: `http://localhost:3000`
2. Scroll to "Trending Products" section
3. Observe products displayed

**Expected Results**:
- ✅ Section shows "Trending Products" heading
- ✅ Grid shows products (4 columns on desktop)
- ✅ Each product has: image, name, price, optional badge
- ✅ Products are clickable links to product pages
- ✅ Section hidden if no products available (graceful degradation)

**Check Server Logs**:
```bash
# Look for cache status
[Curation API] Fetching trending products...
[Curation API] Cache HIT/MISS - source: cache|database
```

**Verify Data**:
```bash
# Check Edge Function directly
curl "http://localhost:54321/functions/v1/get-curated-content?action=fetch_trending_products&limit=20"

# Should return:
# {
#   "success": true,
#   "data": [...],
#   "source": "cache|database"
# }
```

---

### Test 2: Homepage - Featured Brands

**Objective**: Verify featured brands display with live data

**Steps**:
1. Navigate to homepage: `http://localhost:3000`
2. Scroll to "Featured Brands" section
3. Observe brands displayed

**Expected Results**:
- ✅ Section shows "Featured Brands" heading
- ✅ Grid shows brands (3 columns on desktop)
- ✅ Each brand has: logo (if available), name, product count
- ✅ Brands are clickable links to filtered shop page
- ✅ Section hidden if no brands available

**Check Database**:
```sql
-- Verify brands are featured
SELECT brand_name, is_featured, featured_at 
FROM public.brands 
WHERE is_featured = true;

-- Should return at least 1 featured brand
```

**Verify Data**:
```bash
curl "http://localhost:54321/functions/v1/get-curated-content?action=fetch_featured_brands&limit=6"
```

---

### Test 3: Product Detail - Complete the Look

**Objective**: Verify product recommendations display

**Steps**:
1. Navigate to any product page: `http://localhost:3000/product/[slug]`
2. Scroll to "Complete the Look" section
3. Observe recommended products

**Expected Results**:
- ✅ Section shows "Complete the Look" heading
- ✅ Grid shows recommendations (4 columns)
- ✅ Each recommendation has: image, name, price
- ✅ Recommendations are clickable links
- ✅ Section hidden if no recommendations available
- ✅ Only shows active + in-stock products (self-healing)

**Check Database**:
```sql
-- Verify recommendations exist
SELECT source_product_id, recommended_product_id, display_order
FROM public.product_recommendations
WHERE source_product_id = '[PRODUCT_UUID]'
ORDER BY display_order;
```

**Verify Data**:
```bash
curl "http://localhost:54321/functions/v1/get-curated-content?action=fetch_recommendations&product_id=[UUID]&limit=4"
```

---

### Test 4: Click Tracking - Trending Products

**Objective**: Verify click events are tracked

**Steps**:
1. Navigate to homepage
2. Open browser DevTools → Network tab
3. Click on a trending product
4. Observe network request to `track_event`

**Expected Results**:
- ✅ Navigation to product page occurs immediately (non-blocking)
- ✅ POST request to `/functions/v1/get-curated-content?action=track_event` fires
- ✅ Request body contains:
  ```json
  {
    "event_type": "click",
    "curation_type": "trending_products",
    "target_id": "[PRODUCT_UUID]",
    "session_id": "session_..."
  }
  ```
- ✅ Response: `{ "success": true }`

**Check Database**:
```sql
-- Verify event was tracked
SELECT * FROM public.curation_events 
WHERE curation_type = 'trending_products' 
  AND event_type = 'click'
ORDER BY created_at DESC 
LIMIT 10;

-- Should show recent click event
```

---

### Test 5: Click Tracking - Featured Brands

**Objective**: Verify brand click tracking

**Steps**:
1. Navigate to homepage
2. Open DevTools → Network tab
3. Click on a featured brand
4. Observe network request

**Expected Results**:
- ✅ Navigation to shop page with brand filter occurs
- ✅ POST request to `track_event` fires
- ✅ Request body has `curation_type: 'featured_brands'`

**Check Database**:
```sql
SELECT * FROM public.curation_events 
WHERE curation_type = 'featured_brands' 
  AND event_type = 'click'
ORDER BY created_at DESC 
LIMIT 5;
```

---

### Test 6: Click Tracking - Recommendations

**Objective**: Verify recommendation click tracking

**Steps**:
1. Navigate to product detail page
2. Open DevTools → Network tab
3. Click on a recommendation
4. Observe network request

**Expected Results**:
- ✅ Navigation to recommended product occurs
- ✅ POST request fires with:
  ```json
  {
    "event_type": "click",
    "curation_type": "product_recommendations",
    "source_id": "[SOURCE_PRODUCT_UUID]",
    "target_id": "[TARGET_PRODUCT_UUID]",
    "session_id": "session_..."
  }
  ```

**Check Database**:
```sql
SELECT 
  event_type,
  curation_type,
  source_id,
  target_id,
  created_at
FROM public.curation_events 
WHERE curation_type = 'product_recommendations'
ORDER BY created_at DESC 
LIMIT 5;
```

---

### Test 7: Session ID Persistence

**Objective**: Verify session ID persists across page views

**Steps**:
1. Open homepage in new private/incognito window
2. Open browser DevTools → Application → Session Storage
3. Click on a trending product
4. Navigate back to homepage
5. Click on another product
6. Check Session Storage again

**Expected Results**:
- ✅ `curation_session_id` appears in Session Storage after first click
- ✅ Same session ID used for all subsequent clicks in same session
- ✅ Session ID format: `session_[timestamp]_[random]`

---

### Test 8: Graceful Degradation - Empty State

**Objective**: Verify UI handles empty data gracefully

**Steps**:
1. Temporarily disable Edge Function or clear all data
2. Navigate to homepage
3. Observe behavior

**Expected Results**:
- ✅ Homepage loads without errors
- ✅ "Trending Products" section is hidden (or shows empty state)
- ✅ "Featured Brands" section is hidden
- ✅ Other homepage sections still display normally
- ✅ No JavaScript errors in console

**Check Server Logs**:
```bash
# Should see graceful error handling
[Curation API] Failed to fetch trending products: 500
[Curation API] Returning empty array (graceful degradation)
```

---

### Test 9: Cache Performance

**Objective**: Verify caching is working (5-minute TTL)

**Steps**:
1. Navigate to homepage (cold start)
2. Note load time in DevTools → Network tab
3. Refresh page immediately
4. Note load time again

**Expected Results**:
- ✅ First load: ~200-500ms (cache miss, fetches from database)
- ✅ Second load: ~50-100ms (cache hit, served from Redis)
- ✅ Server logs show "source: database" then "source: cache"

**Verify Cache**:
```bash
# Check Redis cache keys (via Upstash Dashboard or CLI)
KEYS curation:*

# Should return:
# curation:trending:20
# curation:brands:6
# curation:rec:[UUID]:4
```

---

### Test 10: Error Handling - Tracking Failures

**Objective**: Verify tracking failures don't block user

**Steps**:
1. Temporarily disable Edge Function
2. Navigate to homepage
3. Click on a product
4. Observe behavior

**Expected Results**:
- ✅ Navigation to product page occurs immediately (non-blocking)
- ✅ No alert/error modal shown to user
- ✅ Console shows warning (not error):
  ```
  [Curation Tracking] Failed to track event (non-blocking): Network error
  ```
- ✅ User experience unaffected

---

## 📊 ANALYTICS VERIFICATION

### Test 11: Event Analytics Dashboard

**Query**: Top clicked trending products (last 7 days)
```sql
SELECT 
  target_id as product_id,
  COUNT(*) as click_count
FROM public.curation_events
WHERE curation_type = 'trending_products'
  AND event_type = 'click'
  AND created_at >= NOW() - INTERVAL '7 days'
GROUP BY target_id
ORDER BY click_count DESC
LIMIT 10;
```

**Expected**: List of product UUIDs with click counts

### Test 12: CTR Calculation

**Query**: Click-through rate for recommendations
```sql
WITH clicks AS (
  SELECT COUNT(*) as click_count
  FROM public.curation_events
  WHERE curation_type = 'product_recommendations'
    AND event_type = 'click'
),
views AS (
  SELECT COUNT(*) as view_count
  FROM public.curation_events
  WHERE curation_type = 'product_recommendations'
    AND event_type = 'view'
)
SELECT 
  click_count,
  view_count,
  ROUND(100.0 * click_count / NULLIF(view_count, 0), 2) as ctr_percentage
FROM clicks, views;
```

**Expected**: CTR percentage (e.g., 2.5%)

---

## 🐛 COMMON ISSUES & FIXES

### Issue 1: "Trending Products" section empty

**Symptoms**: Section doesn't appear on homepage

**Possible Causes**:
1. Week 1 migrations not deployed
2. Edge Function not deployed
3. No products in database
4. Redis connection failure

**Fix**:
```bash
# Check migrations
supabase db push

# Check Edge Function
curl "http://localhost:54321/functions/v1/get-curated-content?action=fetch_trending_products&limit=20"

# Check database
psql "SELECT COUNT(*) FROM public.products WHERE is_active = true;"
```

### Issue 2: Click tracking not working

**Symptoms**: No events in `curation_events` table

**Possible Causes**:
1. Edge Function not deployed
2. Invalid event types
3. Network errors

**Fix**:
```bash
# Test tracking directly
curl -X POST "http://localhost:54321/functions/v1/get-curated-content?action=track_event" \
  -H "Content-Type: application/json" \
  -d '{"event_type":"click","curation_type":"trending_products","target_id":"test-uuid"}'

# Check response for errors
```

### Issue 3: TypeScript errors

**Symptoms**: Build fails with type errors

**Fix**:
```bash
# Verify imports
# TrendingProduct, FeaturedBrand, ProductRecommendation should be imported from @/lib/apiClient

# Run type check
npm run type-check
```

---

## ✅ SUCCESS CRITERIA

### Functional Tests
- [ ] Trending products display with live data
- [ ] Featured brands display with live data
- [ ] Recommendations display on product pages
- [ ] Click tracking works for all 3 curation types
- [ ] Session ID persists across page views
- [ ] Empty states handled gracefully
- [ ] Tracking failures don't block navigation

### Performance Tests
- [ ] Cache HIT latency <100ms
- [ ] Cache MISS latency <500ms
- [ ] Tracking requests non-blocking (<50ms impact)
- [ ] Homepage loads in <2s (with curated data)

### Data Integrity Tests
- [ ] All tracked events have valid UUIDs
- [ ] Session IDs are unique and persistent
- [ ] Event timestamps are accurate
- [ ] No duplicate events for single click

---

## 🎯 MONITORING QUERIES

### Daily Click Summary
```sql
SELECT 
  curation_type,
  event_type,
  COUNT(*) as event_count,
  COUNT(DISTINCT session_id) as unique_sessions
FROM public.curation_events
WHERE created_at >= CURRENT_DATE
GROUP BY curation_type, event_type
ORDER BY event_count DESC;
```

### Top Performing Content
```sql
-- Most clicked trending products (today)
SELECT 
  target_id,
  COUNT(*) as clicks
FROM public.curation_events
WHERE curation_type = 'trending_products'
  AND event_type = 'click'
  AND created_at >= CURRENT_DATE
GROUP BY target_id
ORDER BY clicks DESC
LIMIT 10;
```

---

**Testing Ready**: October 17, 2025  
**Blueprint**: Fortress Architecture v2.1  
**Status**: 🔥 **READY FOR PRODUCTION TESTING** 🔥  
